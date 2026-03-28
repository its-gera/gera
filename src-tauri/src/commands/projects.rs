use tauri::State;

use crate::models::ProjectList;

#[tauri::command(rename_all = "snake_case")]
pub fn list_projects(
    limit: Option<u32>,
    cursor: Option<String>,
    state: State<'_, crate::AppState>,
) -> Result<ProjectList, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .list_projects_page(limit, cursor.as_deref())
        .map(|(projects, next_cursor)| ProjectList { projects, next_cursor })
        .map_err(|e| e.to_string())
}
