//! Entity structs matching the Python Pydantic models exactly.
//!
//! JSON field names are preserved verbatim (snake_case throughout).
//! The `from_` field uses a trailing underscore to avoid Rust's `from` keyword
//! ambiguity — serde serialises it as `"from_"`, matching the TypeScript interface.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// EventMetadata
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EventMetadata {
    #[serde(default = "default_local")]
    pub source_platform: String,
    #[serde(default)]
    pub source_account: String,
    #[serde(default)]
    pub source_event_id: String,
    #[serde(default)]
    pub source_calendar_id: String,
    #[serde(default)]
    pub etag: String,
    #[serde(default)]
    pub last_synced_at: Option<String>,
    #[serde(default)]
    pub recurring_event_id: String,
    #[serde(default)]
    pub source_updated_at: Option<String>,
}

fn default_local() -> String {
    "local".to_string()
}

// ---------------------------------------------------------------------------
// EventEntity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEntity {
    pub id: String,
    #[serde(default = "default_local")]
    pub source: String,
    /// ISO-8601 datetime string. Named `from_` to avoid Rust keyword clash.
    pub from_: String,
    pub to: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub participants: Vec<String>,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub metadata: EventMetadata,
}

// ---------------------------------------------------------------------------
// NoteEntity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteEntity {
    pub filename: String,
    pub title: String,
    #[serde(default)]
    pub body_preview: String,
    #[serde(default)]
    pub event_ids: Vec<String>,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub raw_content: String,
}

// ---------------------------------------------------------------------------
// ProjectEntity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntity {
    pub id: String,
    pub filename: String,
    pub title: String,
    #[serde(default)]
    pub body_preview: String,
    #[serde(default)]
    pub event_ids: Vec<String>,
    #[serde(default)]
    pub raw_content: String,
}

// ---------------------------------------------------------------------------
// TimeReference
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeReference {
    pub modifier: String,
    pub amount: i64,
    pub unit: String,
    pub target_id: String,
}

// ---------------------------------------------------------------------------
// TaskEntity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEntity {
    pub text: String,
    pub completed: bool,
    pub raw_line: String,
    pub source_file: String,
    pub line_number: i64,
    #[serde(default)]
    pub deadline: Option<String>,
    #[serde(default)]
    pub event_ids: Vec<String>,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub time_references: Vec<TimeReference>,
    #[serde(default)]
    pub resolved_event_names: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub resolved_project_names: std::collections::HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Response wrapper types (match Python command responses)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct EventList {
    pub events: Vec<EventEntity>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteList {
    pub notes: Vec<NoteEntity>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectList {
    pub projects: Vec<ProjectEntity>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskList {
    pub tasks: Vec<TaskEntity>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteContentResponse {
    pub filename: String,
    pub raw_content: String,
    pub html: String,
    pub title: String,
    pub event_ids: Vec<String>,
    pub project_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RenderMarkdownResponse {
    pub html: String,
    pub title: String,
    pub frontmatter: serde_json::Value,
    pub event_ids: Vec<String>,
    pub project_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DataRootStatus {
    pub path: String,
    pub structure: std::collections::HashMap<String, bool>,
}

#[derive(Debug, Serialize)]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct VaultStatus {
    pub current: String,
    pub recent: Vec<VaultInfo>,
}

#[derive(Debug, Serialize)]
pub struct CreateEventResponse {
    pub event: EventEntity,
}

#[derive(Debug, Serialize)]
pub struct UpdateEventResponse {
    pub event: EventEntity,
}

#[derive(Debug, Serialize)]
pub struct CreateNoteResponse {
    pub note: NoteEntity,
}

#[derive(Debug, Serialize)]
pub struct CreateTaskResponse {
    pub task: TaskEntity,
}

#[derive(Debug, Serialize)]
pub struct EventSearchResponse {
    pub events: Vec<EventEntity>,
}

#[derive(Debug, Serialize)]
pub struct NotesSearchResponse {
    pub notes: Vec<NoteEntity>,
}

#[derive(Debug, Serialize)]
pub struct ProjectsSearchResponse {
    pub projects: Vec<ProjectEntity>,
}

#[derive(Debug, Serialize)]
pub struct TasksSearchResponse {
    pub tasks: Vec<TaskEntity>,
}

#[derive(Debug, Serialize)]
pub struct SyncGoogleCalendarResponse {
    pub created: i64,
    pub updated: i64,
    pub skipped: i64,
    pub stale: i64,
}
