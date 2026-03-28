/**
 * Type-safe wrappers for Gera Rust backend commands.
 *
 * Each exported function calls the corresponding `#[tauri::command]`
 * Rust handler via Tauri's `invoke`.
 */

import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataRootStatus {
  path: string;
  structure: Record<string, boolean>;
}

export interface RenderMarkdownResponse {
  html: string;
  title: string;
  frontmatter: Record<string, unknown>;
  event_ids: string[];
  project_ids: string[];
}

export interface EventMetadata {
  source_platform: string;
  source_account: string;
  source_event_id: string;
  source_calendar_id: string;
  etag: string;
  last_synced_at: string | null;
  recurring_event_id: string;
  source_updated_at: string | null;
}

export interface EventEntity {
  id: string;
  source: string;
  from_: string;
  to: string;
  name: string;
  description: string;
  participants: string[];
  location: string;
  metadata: EventMetadata;
}

export interface NoteEntity {
  filename: string;
  title: string;
  body_preview: string;
  event_ids: string[];
  project_ids: string[];
  raw_content: string;
}

export interface ProjectEntity {
  id: string;
  filename: string;
  title: string;
  body_preview: string;
  event_ids: string[];
  raw_content: string;
}

export interface TimeReference {
  modifier: string;
  amount: number;
  unit: string;
  target_id: string;
}

export interface TaskEntity {
  text: string;
  completed: boolean;
  raw_line: string;
  source_file: string;
  line_number: number;
  deadline: string | null;
  event_ids: string[];
  project_ids: string[];
  time_references: TimeReference[];
  resolved_event_names: Record<string, string>;
  resolved_project_names: Record<string, string>;
}

export interface NoteContentResponse {
  filename: string;
  raw_content: string;
  html: string;
  title: string;
  event_ids: string[];
  project_ids: string[];
}

export interface PageRequest {
  limit?: number;
  cursor?: string | null;
  [key: string]: unknown;
}

export interface EventListRequest extends PageRequest {
  from_?: string;
  to?: string;
}

export interface NoteListRequest extends PageRequest {
  event_id?: string;
  project_id?: string;
}

export interface TaskListRequest extends PageRequest {
  deadline_from?: string;
  deadline_to?: string;
  event_id?: string;
  project_id?: string;
}

export interface EventListResponse {
  events: EventEntity[];
  next_cursor: string | null;
}

export interface NoteListResponse {
  notes: NoteEntity[];
  next_cursor: string | null;
}

export interface ProjectListResponse {
  projects: ProjectEntity[];
  next_cursor: string | null;
}

export interface TaskListResponse {
  tasks: TaskEntity[];
  next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Get the current data root directory and its structure health. */
export async function getDataRootStatus(): Promise<DataRootStatus> {
  return invoke<DataRootStatus>("get_data_root_status");
}

/** Render a Gera markdown document (with optional YAML frontmatter) to HTML. */
export async function renderMarkdown(
  content: string
): Promise<RenderMarkdownResponse> {
  return invoke<RenderMarkdownResponse>("render_markdown_cmd", { content });
}

/** List all events from events.yaml. */
export async function listEventsPage(
  request: EventListRequest = {}
): Promise<EventListResponse> {
  const { from_, ...rest } = request;
  const args = from_ !== undefined ? { ...rest, from: from_ } : rest;
  return invoke<EventListResponse>("list_events", args);
}

/** Helper: Get ISO date strings for week boundaries. */
export function getWeekDateRange(fromDate: Date = new Date()): { from_: string; to: string } {
  const mon = new Date(fromDate);
  mon.setDate(fromDate.getDate() - ((fromDate.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from_: mon.toISOString(), to: sun.toISOString() };
}

/** List all events, internally paging through backend cursors. */
export async function listEvents(
  filters: Omit<EventListRequest, "cursor" | "limit"> = {}
): Promise<EventEntity[]> {
  const events: EventEntity[] = [];
  let cursor: string | null = null;
  do {
    const page = await listEventsPage({ ...filters, cursor, limit: 500 });
    events.push(...page.events);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return events;
}

/** List notes from notes/ with cursor pagination and relationship filters. */
export async function listNotesPage(
  request: NoteListRequest = {}
): Promise<NoteListResponse> {
  return invoke<NoteListResponse>("list_notes", request);
}

/** List all notes, internally paging through backend cursors. */
export async function listNotes(
  filters: Omit<NoteListRequest, "cursor" | "limit"> = {}
): Promise<NoteEntity[]> {
  const notes: NoteEntity[] = [];
  let cursor: string | null = null;
  do {
    const page = await listNotesPage({ ...filters, cursor, limit: 500 });
    notes.push(...page.notes);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return notes;
}

/** List projects from projects/ with cursor pagination. */
export async function listProjectsPage(
  request: PageRequest = {}
): Promise<ProjectListResponse> {
  return invoke<ProjectListResponse>("list_projects", request);
}

/** List all projects, internally paging through backend cursors. */
export async function listProjects(): Promise<ProjectEntity[]> {
  const projects: ProjectEntity[] = [];
  let cursor: string | null = null;
  do {
    const page = await listProjectsPage({ cursor, limit: 500 });
    projects.push(...page.projects);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return projects;
}

/** List floating tasks from tasks.md with cursor pagination and filters. */
export async function listFloatingTasksPage(
  request: TaskListRequest = {}
): Promise<TaskListResponse> {
  return invoke<TaskListResponse>("list_floating_tasks", request);
}

/** List all floating tasks, internally paging through backend cursors. */
export async function listFloatingTasks(
  filters: Omit<TaskListRequest, "cursor" | "limit"> = {}
): Promise<TaskEntity[]> {
  const tasks: TaskEntity[] = [];
  let cursor: string | null = null;
  do {
    const page = await listFloatingTasksPage({ ...filters, cursor, limit: 500 });
    tasks.push(...page.tasks);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return tasks;
}

/** Read and render a specific note by filename. */
export async function getNoteContent(
  filename: string
): Promise<NoteContentResponse> {
  return invoke<NoteContentResponse>("get_note_content", { filename });
}

/** Update a note file with new markdown content. */
export async function updateNoteContent(
  filename: string,
  content: string
): Promise<void> {
  return invoke<void>("update_note_content", { filename, content });
}

// ============================================================================
// SEARCH COMMANDS - FTS5 Full-Text Search
// ============================================================================

/** Full-text search events using FTS5. */
export async function searchEvents(query: string): Promise<EventEntity[]> {
  const response = await invoke<{ events: EventEntity[] }>("search_events", { query });
  return response.events;
}

/** Full-text search notes using FTS5. */
export async function searchNotes(query: string): Promise<NoteEntity[]> {
  const response = await invoke<{ notes: NoteEntity[] }>("search_notes", { query });
  return response.notes;
}

/** Full-text search projects using FTS5. */
export async function searchProjects(query: string): Promise<ProjectEntity[]> {
  const response = await invoke<{ projects: ProjectEntity[] }>("search_projects", { query });
  return response.projects;
}

/** Full-text search tasks using FTS5. */
export async function searchTasks(query: string): Promise<TaskEntity[]> {
  const response = await invoke<{ tasks: TaskEntity[] }>("search_tasks", { query });
  return response.tasks;
}

// ============================================================================
// TASK MUTATION COMMANDS
// ============================================================================

/** Toggle a task's completion status in its source markdown file. */
export async function toggleTask(
  sourceFile: string,
  lineNumber: number
): Promise<void> {
  return invoke<void>("toggle_task", {
    source_file: sourceFile,
    line_number: lineNumber,
  });
}

/** Create a new floating task in tasks.md. */
export async function createTask(text: string): Promise<TaskEntity> {
  const response = await invoke<{ task: TaskEntity }>("create_task", { text });
  return response.task;
}

/** Delete a task line from its source file. */
export async function deleteTask(
  sourceFile: string,
  lineNumber: number
): Promise<void> {
  return invoke<void>("delete_task", {
    source_file: sourceFile,
    line_number: lineNumber,
  });
}

/** Update the text of an existing task line. */
export async function updateTask(
  sourceFile: string,
  lineNumber: number,
  newText: string
): Promise<void> {
  return invoke<void>("update_task", {
    source_file: sourceFile,
    line_number: lineNumber,
    new_text: newText,
  });
}

/** Create a new note file. */
export async function createNote(
  filename: string,
  content: string = "",
  eventIds?: string[],
  projectIds?: string[]
): Promise<NoteEntity> {
  const response = await invoke<{ note: NoteEntity }>("create_note", {
    filename,
    content,
    event_ids: eventIds ?? null,
    project_ids: projectIds ?? null,
  });
  return response.note;
}

/** Delete a note file. */
export async function deleteNote(filename: string): Promise<void> {
  return invoke<void>("delete_note", { filename });
}

// ============================================================================
// EVENT MUTATION COMMANDS
// ============================================================================

export interface UpdateEventRequest {
  id: string;
  name: string;
  from_: string;
  to: string;
  description: string;
  location: string;
  participants: string[];
  [key: string]: unknown;
}

/** Update an existing event in events.yaml. */
export async function updateEvent(req: UpdateEventRequest): Promise<EventEntity> {
  const { from_, ...rest } = req;
  const response = await invoke<{ event: EventEntity }>("update_event", { ...rest, from: from_ });
  return response.event;
}

/** Delete an event from events.yaml. */
export async function deleteEvent(id: string): Promise<void> {
  return invoke<void>("delete_event", { id });
}

export interface CreateEventRequest {
  id: string;
  source?: string;
  from_: string;
  to: string;
  name: string;
  description?: string;
  location?: string;
  participants?: string[];
  metadata?: Partial<EventMetadata>;
  [key: string]: unknown;
}

/** Create a new event in events.yaml. */
export async function createEvent(req: CreateEventRequest): Promise<EventEntity> {
  const { from_, ...rest } = req;
  const response = await invoke<{ event: EventEntity }>("create_event", { ...rest, from: from_ });
  return response.event;
}

// ============================================================================
// GOOGLE CALENDAR OAUTH & SYNC (STUB)
// ============================================================================

export interface TokenData {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number | null;
  scope: string | null;
  account_email: string | null;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  stale: number;
}

/** Authenticate with Google Calendar (opens OAuth flow in browser). */
export async function authenticateGoogle(): Promise<TokenData> {
  return invoke<TokenData>("authenticate_google_cmd");
}

/** List all connected Google accounts. */
export async function listGoogleAccounts(): Promise<TokenData[]> {
  return invoke<TokenData[]>("list_google_accounts_cmd");
}

/** Remove a Google account and its tokens. */
export async function removeGoogleAccount(email: string): Promise<void> {
  return invoke<void>("remove_google_account_cmd", { email });
}

/** Sync Google Calendar events for an account. */
export async function syncGoogleCalendar(
  accountEmail: string,
  calendarId: string = "primary"
): Promise<SyncResult> {
  return invoke<SyncResult>("sync_google_calendar", {
    account_email: accountEmail,
    calendar_id: calendarId,
  });
}

// ============================================================================
// VAULT COMMANDS
// ============================================================================

export interface VaultInfo {
  path: string;
  name: string;
}

export interface VaultStatus {
  current: string;
  recent: VaultInfo[];
}

/** Return the current vault path and list of recently opened vaults. */
export async function getVaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>("get_vault_status");
}

/** Initialize a new Gera vault at *path* and switch to it. */
export async function newVault(path: string): Promise<VaultStatus> {
  return invoke<VaultStatus>("new_vault", { path });
}

/** Open an existing Gera vault at *path* and switch to it. */
export async function openVault(path: string): Promise<VaultStatus> {
  return invoke<VaultStatus>("open_vault", { path });
}
