use tauri::State;

use crate::models::{CreateTaskResponse, TaskList};

#[tauri::command(rename_all = "snake_case")]
pub fn list_floating_tasks(
    limit: Option<u32>,
    cursor: Option<String>,
    deadline_from: Option<String>,
    deadline_to: Option<String>,
    event_id: Option<String>,
    project_id: Option<String>,
    state: State<'_, crate::AppState>,
) -> Result<TaskList, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .list_tasks_page(
            limit,
            cursor.as_deref(),
            deadline_from.as_deref(),
            deadline_to.as_deref(),
            event_id.as_deref(),
            project_id.as_deref(),
        )
        .map(|(tasks, next_cursor)| TaskList { tasks, next_cursor })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn toggle_task(
    source_file: String,
    line_number: i64,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .toggle_task(&source_file, line_number)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_task(
    text: String,
    state: State<'_, crate::AppState>,
) -> Result<CreateTaskResponse, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let task = inner.repo.create_task(&text).map_err(|e| e.to_string())?;
    Ok(CreateTaskResponse { task })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_task(
    source_file: String,
    line_number: i64,
    new_text: String,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .update_task(&source_file, line_number, &new_text)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_task(
    source_file: String,
    line_number: i64,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .delete_task(&source_file, line_number)
        .map_err(|e| e.to_string())
}
