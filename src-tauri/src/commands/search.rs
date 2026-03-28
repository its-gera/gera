use tauri::State;

use crate::models::{EventSearchResponse, NotesSearchResponse, ProjectsSearchResponse, TasksSearchResponse};

#[tauri::command(rename_all = "snake_case")]
pub fn search_events(query: String, state: State<'_, crate::AppState>) -> Result<EventSearchResponse, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .search_events(&query)
        .map(|events| EventSearchResponse { events })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn search_notes(query: String, state: State<'_, crate::AppState>) -> Result<NotesSearchResponse, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .search_notes(&query)
        .map(|notes| NotesSearchResponse { notes })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn search_projects(query: String, state: State<'_, crate::AppState>) -> Result<ProjectsSearchResponse, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .search_projects(&query)
        .map(|projects| ProjectsSearchResponse { projects })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn search_tasks(query: String, state: State<'_, crate::AppState>) -> Result<TasksSearchResponse, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .search_tasks(&query)
        .map(|tasks| TasksSearchResponse { tasks })
        .map_err(|e| e.to_string())
}
