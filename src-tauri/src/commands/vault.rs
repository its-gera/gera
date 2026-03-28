use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::models::{SyncGoogleCalendarResponse, VaultInfo, VaultStatus};
use crate::oauth::load_tokens;
use crate::repository::{EmitFn, Repository, VAULT_CHANGED_EVENT};
use crate::storage::{init_data_directory, is_valid_vault, load_recent_vaults, save_recent_vault};

#[tauri::command(rename_all = "snake_case")]
pub fn get_vault_status(
    app_handle: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<VaultStatus, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let recent = recent_vault_infos(&load_recent_vaults(&app_data_dir));
    Ok(VaultStatus {
        current: inner.data_root.to_string_lossy().to_string(),
        recent,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn new_vault(
    path: String,
    app_handle: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<VaultStatus, String> {
    switch_vault(&path, true, &app_handle, &state)
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_vault(
    path: String,
    app_handle: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<VaultStatus, String> {
    switch_vault(&path, false, &app_handle, &state)
}

fn recent_vault_infos(paths: &[String]) -> Vec<VaultInfo> {
    paths
        .iter()
        .map(|p| {
            let name = PathBuf::from(p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.clone());
            VaultInfo { path: p.clone(), name }
        })
        .collect()
}

fn switch_vault(
    path: &str,
    initialize: bool,
    app_handle: &AppHandle,
    state: &State<'_, crate::AppState>,
) -> Result<VaultStatus, String> {
    let new_path = PathBuf::from(path);
    let resolved = if initialize {
        init_data_directory(Some(&new_path)).map_err(|e| e.to_string())?
    } else {
        let r = new_path.canonicalize().unwrap_or(new_path);
        if !is_valid_vault(&r) {
            return Err(format!("Not a valid Gera vault: {}", r.display()));
        }
        r
    };

    // Snapshot emit_fn and resolved path, stop old watcher, rebuild repo
    let _emit_fn_clone: Option<EmitFn> = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;

        // Drop old watcher
        inner.watcher_handle = None;

        // Emit vault-changed so the UI clears its state
        if let Some(ref emit) = inner.emit_fn {
            let payload = serde_json::json!({ "path": resolved.to_string_lossy() }).to_string();
            emit(VAULT_CHANGED_EVENT.to_string(), payload);
        }

        // Build new repo
        let mut new_repo = Repository::new(resolved.clone()).map_err(|e| e.to_string())?;
        new_repo.clear_all().map_err(|e| e.to_string())?;
        new_repo.reload().map_err(|e| e.to_string())?;

        let emit_clone = inner.emit_fn.clone();
        if let Some(ref emit) = emit_clone {
            new_repo.set_emit(emit.clone());
        }

        inner.repo = new_repo;
        inner.data_root = resolved.clone();

        emit_clone
    };

    // Start watcher outside the lock
    let arc_clone = Arc::clone(&state.inner);
    let data_root_clone = resolved.clone();
    let watcher_handle = crate::watcher::start_watcher(data_root_clone, move |paths| {
        if let Ok(mut inner) = arc_clone.lock() {
            inner.repo.reload_for_changes(&paths);
        }
    })
    .ok();

    // Store the watcher handle
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.watcher_handle = watcher_handle;
    }

    // Emit full data-changed
    {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.repo.emit_data_changed(&[
            serde_json::json!({"entity": "events",   "ids": null}),
            serde_json::json!({"entity": "notes",    "ids": null}),
            serde_json::json!({"entity": "projects", "ids": null}),
            serde_json::json!({"entity": "tasks",    "ids": null}),
        ]);
    }

    // Persist recent vault
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    save_recent_vault(&app_data_dir, &resolved.to_string_lossy());

    let recent = recent_vault_infos(&load_recent_vaults(&app_data_dir));
    Ok(VaultStatus {
        current: resolved.to_string_lossy().to_string(),
        recent,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sync_google_calendar(
    account_email: String,
    calendar_id: Option<String>,
    app_handle: AppHandle,
    state: State<'_, crate::AppState>,
) -> Result<SyncGoogleCalendarResponse, String> {
    let calendar_id = calendar_id.unwrap_or_else(|| "primary".to_string());

    // Find token for the account
    let tokens = load_tokens(&app_handle);
    let token_data = tokens
        .into_iter()
        .find(|t| t.account_email.as_deref() == Some(&account_email))
        .ok_or_else(|| format!("No token found for account: {account_email}"))?;

    let refresh_token = token_data
        .refresh_token
        .ok_or_else(|| format!("No refresh token for {account_email}. Re-authenticate."))?;

    // Refresh access token (expires after ~1 hour)
    let access_token = crate::gcal::refresh_access_token(&refresh_token).await?;

    // Persist the refreshed token
    {
        let mut all_tokens = load_tokens(&app_handle);
        for t in &mut all_tokens {
            if t.account_email.as_deref() == Some(&account_email) {
                t.access_token = access_token.clone();
                break;
            }
        }
        crate::oauth::save_tokens(&app_handle, &all_tokens);
    }

    // Fetch events from Google (async — do NOT hold the repo lock during HTTP calls)
    let raw_events =
        crate::gcal::fetch_events_for_sync(&access_token, &account_email, &calendar_id).await?;

    // Apply to repo (sync — brief lock)
    let result = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        crate::gcal::apply_events_to_repo(
            &mut inner.repo,
            raw_events,
            &account_email,
            &calendar_id,
        )?
    };

    Ok(SyncGoogleCalendarResponse {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        stale: result.stale,
    })
}
