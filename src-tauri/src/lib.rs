//! Gera Tauri application — pure Rust backend, no Python.

pub mod commands;
pub mod gcal;
pub mod models;
pub mod oauth;
pub mod renderer;
pub mod repository;
pub mod storage;
pub mod tasks;
pub mod watcher;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};

use repository::{EmitFn, Repository};
use storage::{init_data_directory, is_valid_vault, load_recent_vaults, save_recent_vault};
use watcher::WatcherHandle;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

pub struct AppInner {
    pub repo: Repository,
    pub data_root: PathBuf,
    pub emit_fn: Option<EmitFn>,
    pub watcher_handle: Option<WatcherHandle>,
}

pub struct AppState {
    pub inner: Arc<Mutex<AppInner>>,
}

// ---------------------------------------------------------------------------
// Startup vault resolution (mirrors Python _resolve_startup_vault)
// ---------------------------------------------------------------------------

fn resolve_startup_vault(app_data_dir: &std::path::Path) -> PathBuf {
    let recent = load_recent_vaults(app_data_dir);
    if let Some(first) = recent.first() {
        let candidate = PathBuf::from(first);
        if is_valid_vault(&candidate) {
            log::info!("Resuming last vault: {}", candidate.display());
            return candidate;
        }
        log::warn!(
            "Last vault no longer valid, falling back to default: {}",
            candidate.display()
        );
    }
    init_data_directory(None).unwrap_or_else(|_| storage::default_data_root())
}

// ---------------------------------------------------------------------------
// Window background colour (macOS only)
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn set_window_bg_color(window: &tauri::WebviewWindow, r: f64, g: f64, b: f64) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSColor;

    if let Ok(ns_window) = window.ns_window() {
        let ns_window = ns_window as *mut AnyObject;
        unsafe {
            let bg_color = NSColor::colorWithRed_green_blue_alpha(r, g, b, 1.0);
            let _: () = msg_send![ns_window, setBackgroundColor: &*bg_color];
        }
    }
}

// ---------------------------------------------------------------------------
// set_theme command (keeps macOS window background in sync with theme)
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "snake_case")]
fn set_theme(window: tauri::WebviewWindow, dark: bool) {
    #[cfg(target_os = "macos")]
    {
        if dark {
            set_window_bg_color(&window, 11.0 / 255.0, 15.0 / 255.0, 22.0 / 255.0);
        } else {
            set_window_bg_color(&window, 232.0 / 255.0, 237.0 / 255.0, 244.0 / 255.0);
        }
    }
}

// ---------------------------------------------------------------------------
// Menu setup (mirrors original Rust lib.rs)
// ---------------------------------------------------------------------------

#[cfg(desktop)]
struct RecentVaultPaths(Vec<String>);

#[cfg(desktop)]
fn setup_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let app_data_dir = app.path().app_data_dir()?;
    let recent_vaults = load_recent_vaults(&app_data_dir);

    let mut recent_items: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for (i, path) in recent_vaults.iter().enumerate() {
        let label = std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path.as_str())
            .to_string();
        let item = MenuItem::with_id(app, format!("vault:recent:{i}"), label, true, None::<&str>)?;
        recent_items.push(item);
    }

    let recent_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        recent_items.iter().map(|i| i as _).collect();

    let recent_submenu = Submenu::with_id_and_items(
        app,
        "vault:recent-menu",
        "Recent",
        !recent_refs.is_empty(),
        &recent_refs,
    )?;

    let new_vault_item =
        MenuItem::with_id(app, "vault:new", "New Vault…", true, Some("CmdOrCtrl+Shift+N"))?;
    let open_vault_item =
        MenuItem::with_id(app, "vault:open", "Open Vault…", true, Some("CmdOrCtrl+Shift+O"))?;
    let separator = PredefinedMenuItem::separator(app)?;

    let file_menu = Submenu::with_id_and_items(
        app,
        "file",
        "File",
        true,
        &[&new_vault_item, &open_vault_item, &separator, &recent_submenu],
    )?;

    app.manage(RecentVaultPaths(recent_vaults));
    let menu = Menu::with_items(app, &[&file_menu])?;
    app.set_menu(menu)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// pub fn run()
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let data_root = resolve_startup_vault(&app_data_dir);
            save_recent_vault(&app_data_dir, &data_root.to_string_lossy());

            // Build the emit function (captures app handle clone)
            let app_handle = app.handle().clone();
            let emit_fn: EmitFn = Arc::new(move |event: String, payload: String| {
                let _ = app_handle.emit(&event, payload);
            });

            // Initialise repository
            let mut repo = Repository::new(data_root.clone())
                .expect("Failed to create SQLite repository");
            repo.reload().expect("Failed to load vault data");
            repo.set_emit(emit_fn.clone());

            log::info!("Data root: {}", data_root.display());

            let inner = Arc::new(Mutex::new(AppInner {
                repo,
                data_root: data_root.clone(),
                emit_fn: Some(emit_fn),
                watcher_handle: None,
            }));

            // Start file watcher
            let arc_for_watcher = Arc::clone(&inner);
            let watcher_handle = watcher::start_watcher(data_root.clone(), move |paths| {
                if let Ok(mut i) = arc_for_watcher.lock() {
                    i.repo.reload_for_changes(&paths);
                }
            })
            .ok();
            if let Ok(mut i) = inner.lock() {
                i.watcher_handle = watcher_handle;
            }

            app.manage(AppState { inner });

            // macOS window setup
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let dark = window
                    .theme()
                    .map(|t| t == tauri::Theme::Dark)
                    .unwrap_or(false);
                if dark {
                    set_window_bg_color(&window, 11.0 / 255.0, 15.0 / 255.0, 22.0 / 255.0);
                } else {
                    set_window_bg_color(
                        &window,
                        232.0 / 255.0,
                        237.0 / 255.0,
                        244.0 / 255.0,
                    );
                }

                // Size to fill screen height at 16:9
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    use tauri::{LogicalPosition, LogicalSize};
                    let scale = monitor.scale_factor();
                    let phys = monitor.size();
                    let screen_w = phys.width as f64 / scale;
                    let screen_h = phys.height as f64 / scale;
                    let desired_w = screen_h * 16.0 / 9.0;
                    let (win_w, win_h) = if desired_w <= screen_w {
                        (desired_w, screen_h)
                    } else {
                        (screen_w, screen_w * 9.0 / 16.0)
                    };
                    let _ = window.set_size(LogicalSize::new(win_w, win_h));
                    let _ =
                        window.set_position(LogicalPosition::new((screen_w - win_w) / 2.0, 0.0));
                }
            }

            #[cfg(desktop)]
            setup_menu(app)?;

            #[cfg(desktop)]
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                match id {
                    "vault:new" => {
                        let _ = app.emit("vault:new", ());
                    }
                    "vault:open" => {
                        let _ = app.emit("vault:open", ());
                    }
                    id if id.starts_with("vault:recent:") => {
                        if let Ok(idx) = id["vault:recent:".len()..].parse::<usize>() {
                            if let Some(paths) = app.try_state::<RecentVaultPaths>() {
                                if let Some(path) = paths.0.get(idx) {
                                    let _ = app.emit("vault:open-path", path.clone());
                                }
                            }
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Theme
            set_theme,
            // Events
            commands::events::list_events,
            commands::events::create_event,
            commands::events::update_event,
            commands::events::delete_event,
            // Notes
            commands::notes::list_notes,
            commands::notes::get_note_content,
            commands::notes::update_note_content,
            commands::notes::create_note,
            commands::notes::delete_note,
            commands::notes::render_markdown_cmd,
            commands::notes::get_data_root_status,
            // Tasks
            commands::tasks::list_floating_tasks,
            commands::tasks::toggle_task,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::delete_task,
            // Projects
            commands::projects::list_projects,
            // Search
            commands::search::search_events,
            commands::search::search_notes,
            commands::search::search_projects,
            commands::search::search_tasks,
            // Vault
            commands::vault::get_vault_status,
            commands::vault::new_vault,
            commands::vault::open_vault,
            commands::vault::sync_google_calendar,
            // OAuth (implemented in oauth.rs)
            oauth::authenticate_google_cmd,
            oauth::list_google_accounts_cmd,
            oauth::remove_google_account_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
