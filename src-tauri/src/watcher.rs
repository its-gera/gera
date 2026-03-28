//! File-system watcher using the `notify` crate.
//!
//! Mirrors Python's `watcher.py`:
//! - Watches the vault data_root recursively for `.yaml`, `.yml`, `.md` changes
//! - Debounces events (300ms)
//! - Calls back with relative paths of changed files
//! - Emits `gera://fs-changed` and triggers partial repo reload

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

/// A handle that stops the watcher when dropped.
pub struct WatcherHandle {
    _watcher: RecommendedWatcher,
    stop_tx: std::sync::mpsc::SyncSender<()>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        let _ = self.stop_tx.try_send(());
    }
}

/// Start watching `data_root`.
///
/// `on_change` is called with a list of relative paths that changed.
/// It runs on a dedicated background thread.
pub fn start_watcher<F>(
    data_root: PathBuf,
    on_change: F,
) -> Result<WatcherHandle, notify::Error>
where
    F: Fn(Vec<String>) + Send + 'static,
{
    let (event_tx, event_rx) = std::sync::mpsc::channel::<notify::Result<Event>>();
    let (stop_tx, stop_rx) = std::sync::mpsc::sync_channel::<()>(1);

    let mut watcher = RecommendedWatcher::new(event_tx, notify::Config::default())?;
    watcher.watch(&data_root, RecursiveMode::Recursive)?;

    let data_root_clone = data_root.clone();
    std::thread::spawn(move || {
        let debounce = Duration::from_millis(300);
        let mut pending: Vec<PathBuf> = Vec::new();
        let mut last_event: Option<Instant> = None;

        loop {
            // Check for stop signal (non-blocking)
            if stop_rx.try_recv().is_ok() {
                break;
            }

            // Try to receive a new event with a short timeout
            match event_rx.recv_timeout(Duration::from_millis(50)) {
                Ok(Ok(event)) => {
                    let relevant: Vec<PathBuf> = event
                        .paths
                        .into_iter()
                        .filter(|p| is_relevant(p))
                        .collect();
                    if !relevant.is_empty() {
                        pending.extend(relevant);
                        last_event = Some(Instant::now());
                    }
                }
                Ok(Err(_)) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            }

            // Fire debounced callback
            if let Some(last) = last_event {
                if last.elapsed() >= debounce && !pending.is_empty() {
                    let mut rel_paths: Vec<String> = pending
                        .drain(..)
                        .filter_map(|p| {
                            p.strip_prefix(&data_root_clone)
                                .ok()
                                .map(|r| r.to_string_lossy().to_string())
                        })
                        .collect();
                    // Deduplicate: the OS may fire multiple events for a single write
                    rel_paths.sort_unstable();
                    rel_paths.dedup();

                    if !rel_paths.is_empty() {
                        on_change(rel_paths);
                    }
                    last_event = None;
                }
            }
        }
    });

    Ok(WatcherHandle {
        _watcher: watcher,
        stop_tx,
    })
}

fn is_relevant(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| matches!(ext, "yaml" | "yml" | "md"))
        .unwrap_or(false)
}
