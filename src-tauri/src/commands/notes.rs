use tauri::State;

use crate::models::{CreateNoteResponse, NoteContentResponse, NoteList};
use crate::renderer::render_to_response;

#[tauri::command(rename_all = "snake_case")]
pub fn list_notes(
    limit: Option<u32>,
    cursor: Option<String>,
    event_id: Option<String>,
    project_id: Option<String>,
    state: State<'_, crate::AppState>,
) -> Result<NoteList, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .list_notes_page(limit, cursor.as_deref(), event_id.as_deref(), project_id.as_deref())
        .map(|(notes, next_cursor)| NoteList { notes, next_cursor })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_note_content(
    filename: String,
    state: State<'_, crate::AppState>,
) -> Result<NoteContentResponse, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let note_path = inner.data_root.join("notes").join(&filename);
    let raw = std::fs::read_to_string(&note_path)
        .map_err(|e| format!("Failed to read note '{}': {}", filename, e))?;
    let doc = crate::renderer::render(&raw);
    Ok(NoteContentResponse {
        filename,
        raw_content: raw,
        html: doc.html,
        title: doc.title,
        event_ids: doc.event_ids,
        project_ids: doc.project_ids,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_note_content(
    filename: String,
    content: String,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.repo.update_note(&filename, &content).map(|_note| ())
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_note(
    filename: String,
    content: Option<String>,
    event_ids: Option<Vec<String>>,
    project_ids: Option<Vec<String>>,
    state: State<'_, crate::AppState>,
) -> Result<CreateNoteResponse, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let note = inner
        .repo
        .create_note(
            &filename,
            content.as_deref().unwrap_or(""),
            event_ids.as_deref(),
            project_ids.as_deref(),
        )
        .map_err(|e| e.to_string())?;
    Ok(CreateNoteResponse { note })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_note(filename: String, state: State<'_, crate::AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.repo.delete_note(&filename).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn render_markdown_cmd(content: String) -> crate::models::RenderMarkdownResponse {
    render_to_response(&content)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_data_root_status(
    state: State<'_, crate::AppState>,
) -> Result<crate::models::DataRootStatus, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let structure = crate::storage::verify_structure(&inner.data_root);
    Ok(crate::models::DataRootStatus {
        path: inner.data_root.to_string_lossy().to_string(),
        structure,
    })
}
