use tauri::State;

use crate::models::{CreateEventResponse, EventEntity, EventList, EventMetadata, UpdateEventResponse};

#[tauri::command(rename_all = "snake_case")]
pub fn list_events(
    limit: Option<u32>,
    cursor: Option<String>,
    from_: Option<String>,
    to: Option<String>,
    state: State<'_, crate::AppState>,
) -> Result<EventList, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner
        .repo
        .list_events_page(limit, cursor.as_deref(), from_.as_deref(), to.as_deref())
        .map(|(events, next_cursor)| EventList { events, next_cursor })
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_event(
    id: String,
    source: Option<String>,
    from_: String,
    to: String,
    name: String,
    description: Option<String>,
    location: Option<String>,
    participants: Option<Vec<String>>,
    metadata: Option<EventMetadata>,
    state: State<'_, crate::AppState>,
) -> Result<CreateEventResponse, String> {
    let event = EventEntity {
        id,
        source: source.unwrap_or_else(|| "local".to_string()),
        from_,
        to,
        name,
        description: description.unwrap_or_default(),
        participants: participants.unwrap_or_default(),
        location: location.unwrap_or_default(),
        metadata: metadata.unwrap_or_default(),
    };
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let result = inner.repo.create_event(&event).map_err(|e| e.to_string())?;
    Ok(CreateEventResponse { event: result })
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_event(
    id: String,
    name: String,
    from_: String,
    to: String,
    description: Option<String>,
    location: Option<String>,
    participants: Option<Vec<String>>,
    state: State<'_, crate::AppState>,
) -> Result<UpdateEventResponse, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let existing = inner
        .repo
        .get_event(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Event not found: {id}"))?;

    let updated = EventEntity {
        id: existing.id,
        source: existing.source,
        from_,
        to,
        name,
        description: description.unwrap_or_default(),
        location: location.unwrap_or_default(),
        participants: participants.unwrap_or_default(),
        metadata: existing.metadata,
    };
    let result = inner.repo.update_event(&updated).map_err(|e| e.to_string())?;
    Ok(UpdateEventResponse { event: result })
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_event(id: String, state: State<'_, crate::AppState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.repo.delete_event(&id).map_err(|e| e.to_string())
}
