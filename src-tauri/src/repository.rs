//! In-memory SQLite repository for Gera entities.
//!
//! Mirrors Python's `repository.py` exactly — same schema, same cursor-based
//! pagination, same FTS5 virtual tables, same partial-reload logic.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use once_cell::sync::Lazy;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json;

use crate::models::*;
use crate::storage::{
    self, body_preview, events_file, extract_title, frontmatter_event_ids, frontmatter_project_ids,
    notes_dir, parse_frontmatter, projects_dir, sanitize_content, serialize_frontmatter,
    tasks_file,
};
use regex::Regex;

use crate::tasks::{parse_iso_datetime, parse_tasks_from_markdown, resolve_tasks, EventRef};

pub const DATA_CHANGED_EVENT: &str = "gera://data-changed";
pub const VAULT_CHANGED_EVENT: &str = "gera://vault-changed";

pub type EmitFn = Arc<dyn Fn(String, String) + Send + Sync>;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

pub struct Repository {
    conn: Connection,
    data_root: PathBuf,
    emit_fn: Option<EmitFn>,
    /// Timestamp of the last `resolve_all_tasks` call, used to skip redundant
    /// re-resolves when the file watcher fires shortly after a command.
    last_resolve_at: Option<std::time::Instant>,
}

// Safety: rusqlite Connection is Send when compiled with thread-safe SQLite.
// We gate access via Mutex<Repository> at the AppState level.
unsafe impl Send for Repository {}

impl Repository {
    pub fn new(data_root: PathBuf) -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        let repo = Repository {
            conn,
            data_root,
            emit_fn: None,
            last_resolve_at: None,
        };
        repo.create_schema()?;
        Ok(repo)
    }

    pub fn set_emit(&mut self, emit_fn: EmitFn) {
        self.emit_fn = Some(emit_fn);
    }

    // -----------------------------------------------------------------------
    // Emit helpers
    // -----------------------------------------------------------------------

    pub fn emit_data_changed(&self, changes: &[serde_json::Value]) {
        let Some(ref emit) = self.emit_fn else { return };
        let payload = serde_json::json!({ "changes": changes }).to_string();
        emit(DATA_CHANGED_EVENT.to_string(), payload);
    }

    // -----------------------------------------------------------------------
    // Schema
    // -----------------------------------------------------------------------

    fn create_schema(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS events (
                id           TEXT PRIMARY KEY,
                source       TEXT NOT NULL DEFAULT 'local',
                from_        TEXT NOT NULL,
                to_          TEXT NOT NULL,
                name         TEXT NOT NULL,
                description  TEXT NOT NULL DEFAULT '',
                participants TEXT NOT NULL DEFAULT '[]',
                location     TEXT NOT NULL DEFAULT '',
                metadata     TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS notes (
                filename     TEXT PRIMARY KEY,
                title        TEXT NOT NULL,
                body_preview TEXT NOT NULL DEFAULT '',
                event_ids    TEXT NOT NULL DEFAULT '[]',
                project_ids  TEXT NOT NULL DEFAULT '[]',
                raw_content  TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS projects (
                id           TEXT PRIMARY KEY,
                filename     TEXT NOT NULL,
                title        TEXT NOT NULL,
                body_preview TEXT NOT NULL DEFAULT '',
                event_ids    TEXT NOT NULL DEFAULT '[]',
                raw_content  TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS tasks (
                rowid                  INTEGER PRIMARY KEY AUTOINCREMENT,
                text                   TEXT NOT NULL,
                completed              INTEGER NOT NULL DEFAULT 0,
                raw_line               TEXT NOT NULL,
                source_file            TEXT NOT NULL,
                line_number            INTEGER NOT NULL,
                deadline               TEXT,
                event_ids              TEXT NOT NULL DEFAULT '[]',
                project_ids            TEXT NOT NULL DEFAULT '[]',
                time_references        TEXT NOT NULL DEFAULT '[]',
                resolved_event_names   TEXT NOT NULL DEFAULT '{}',
                resolved_project_names TEXT NOT NULL DEFAULT '{}'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
                id, name, description, location, participants,
                content='events', content_rowid='rowid'
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                filename, title, raw_content,
                content='notes', content_rowid='rowid'
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
                id, title, raw_content,
                content='projects', content_rowid='rowid'
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
                text,
                content='tasks', content_rowid='rowid'
            );
            "#,
        )?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Vault reset
    // -----------------------------------------------------------------------

    pub fn clear_all(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            r#"
            DELETE FROM tasks;
            DELETE FROM projects;
            DELETE FROM notes;
            DELETE FROM events;
            INSERT INTO events_fts(events_fts) VALUES('rebuild');
            INSERT INTO notes_fts(notes_fts) VALUES('rebuild');
            INSERT INTO projects_fts(projects_fts) VALUES('rebuild');
            INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
            "#,
        )
    }

    pub fn set_data_root(&mut self, root: PathBuf) {
        self.data_root = root;
    }

    // -----------------------------------------------------------------------
    // Disk readers
    // -----------------------------------------------------------------------

    fn read_events_from_disk(&self) -> Vec<EventEntity> {
        let path = events_file(&self.data_root);
        if !path.exists() {
            return vec![];
        }

        let Ok(raw) = std::fs::read_to_string(&path) else {
            return vec![];
        };
        let Ok(data) = serde_yaml::from_str::<serde_yaml::Value>(&raw) else {
            return vec![];
        };

        let events_seq = match data.get("events").and_then(|v| v.as_sequence()) {
            Some(s) => s.clone(),
            None => return vec![],
        };

        let mut result = Vec::new();
        for entry in events_seq {
            if let Some(ev) = yaml_entry_to_event(&entry) {
                result.push(ev);
            }
        }
        result
    }

    fn read_note_file(&self, md_path: &Path) -> Option<(NoteEntity, Vec<TaskEntity>)> {
        let notes_base = notes_dir(&self.data_root);
        let rel = md_path
            .strip_prefix(&notes_base)
            .ok()?
            .to_string_lossy()
            .to_string();

        let raw = std::fs::read_to_string(md_path).ok()?;
        let (fm, body) = parse_frontmatter(&raw);
        let title = extract_title(&body);
        let inherited_events = frontmatter_event_ids(&fm);
        let inherited_projects = frontmatter_project_ids(&fm);

        let source_file = format!("notes/{}", rel);
        let mut note_tasks = parse_tasks_from_markdown(&raw, &source_file);
        for t in &mut note_tasks {
            for eid in &inherited_events {
                if !t.event_ids.contains(eid) {
                    t.event_ids.push(eid.clone());
                }
            }
            for pid in &inherited_projects {
                if !t.project_ids.contains(pid) {
                    t.project_ids.push(pid.clone());
                }
            }
        }

        let note = NoteEntity {
            filename: rel,
            title,
            body_preview: body_preview(&body),
            event_ids: inherited_events,
            project_ids: inherited_projects,
            raw_content: raw,
        };
        Some((note, note_tasks))
    }

    fn read_notes_from_disk(&self) -> (Vec<NoteEntity>, Vec<TaskEntity>) {
        let ndir = notes_dir(&self.data_root);
        if !ndir.is_dir() {
            return (vec![], vec![]);
        }

        let mut notes = Vec::new();
        let mut all_tasks = Vec::new();

        let mut paths: Vec<_> = std::fs::read_dir(&ndir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
            .map(|e| e.path())
            .collect();
        paths.sort();

        for path in paths {
            if let Some((note, tasks)) = self.read_note_file(&path) {
                notes.push(note);
                all_tasks.extend(tasks);
            }
        }
        (notes, all_tasks)
    }

    fn read_project_file(&self, md_path: &Path) -> Option<(ProjectEntity, Vec<TaskEntity>)> {
        let projects_base = projects_dir(&self.data_root);
        let rel = md_path
            .strip_prefix(&projects_base)
            .ok()?
            .to_string_lossy()
            .to_string();
        let id = Path::new(&rel).file_stem()?.to_string_lossy().to_string();

        let raw = std::fs::read_to_string(md_path).ok()?;
        let (fm, body) = parse_frontmatter(&raw);
        let title = extract_title(&body);
        let inherited_events = frontmatter_event_ids(&fm);

        let source_file = format!("projects/{}", rel);
        let mut project_tasks = parse_tasks_from_markdown(&raw, &source_file);
        for t in &mut project_tasks {
            for eid in &inherited_events {
                if !t.event_ids.contains(eid) {
                    t.event_ids.push(eid.clone());
                }
            }
            if !t.project_ids.contains(&id) {
                t.project_ids.push(id.clone());
            }
        }

        let project = ProjectEntity {
            id,
            filename: rel,
            title,
            body_preview: body_preview(&body),
            event_ids: inherited_events,
            raw_content: raw,
        };
        Some((project, project_tasks))
    }

    fn read_projects_from_disk(&self) -> (Vec<ProjectEntity>, Vec<TaskEntity>) {
        let pdir = projects_dir(&self.data_root);
        if !pdir.is_dir() {
            return (vec![], vec![]);
        }

        let mut projects = Vec::new();
        let mut all_tasks = Vec::new();

        let mut paths: Vec<_> = std::fs::read_dir(&pdir)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
            .map(|e| e.path())
            .collect();
        paths.sort();

        for path in paths {
            if let Some((proj, tasks)) = self.read_project_file(&path) {
                projects.push(proj);
                all_tasks.extend(tasks);
            }
        }
        (projects, all_tasks)
    }

    fn read_tasks_from_disk(&self) -> Vec<TaskEntity> {
        let path = tasks_file(&self.data_root);
        if !path.exists() {
            return vec![];
        }
        let Ok(raw) = std::fs::read_to_string(&path) else {
            return vec![];
        };
        parse_tasks_from_markdown(&raw, "tasks.md")
    }

    // -----------------------------------------------------------------------
    // Reload
    // -----------------------------------------------------------------------

    pub fn reload(&mut self) -> rusqlite::Result<()> {
        self.reload_events()?;
        self.reload_notes(None)?;
        self.reload_projects(None)?;
        self.reload_tasks()?;
        self.resolve_all_tasks()?;
        Ok(())
    }

    pub fn reload_for_changes(&mut self, changed_paths: &[String]) {
        let mut targets: std::collections::HashSet<&str> = std::collections::HashSet::new();
        let mut note_files: Vec<String> = Vec::new();
        let mut project_files: Vec<String> = Vec::new();

        for p in changed_paths {
            let path = Path::new(p);
            let parts: Vec<_> = path.components().collect();
            if parts.is_empty() {
                continue;
            }
            let first = parts[0].as_os_str().to_string_lossy();
            match first.as_ref() {
                "events.yaml" | "events.yml" => {
                    targets.insert("events");
                }
                "tasks.md" => {
                    targets.insert("tasks");
                }
                "notes" if parts.len() > 1 => {
                    targets.insert("notes");
                    let rest: PathBuf = parts[1..].iter().collect();
                    note_files.push(rest.to_string_lossy().to_string());
                }
                "projects" if parts.len() > 1 => {
                    targets.insert("projects");
                    let rest: PathBuf = parts[1..].iter().collect();
                    project_files.push(rest.to_string_lossy().to_string());
                }
                _ => {}
            }
        }

        if targets.is_empty() {
            return;
        }

        // Deduplicate: on some platforms the OS fires multiple events per write
        // note_files.sort_unstable();
        // note_files.dedup();
        // project_files.sort_unstable();
        // project_files.dedup();

        let mut affected: Vec<String> = Vec::new();

        if targets.contains("events") {
            let _ = self.reload_events();
            affected.push("events".to_string());
        }
        if targets.contains("notes") {
            let files = if note_files.is_empty() {
                None
            } else {
                Some(note_files.as_slice())
            };
            let _ = self.reload_notes(files);
            affected.push("notes".to_string());
        }
        if targets.contains("projects") {
            let files = if project_files.is_empty() {
                None
            } else {
                Some(project_files.as_slice())
            };
            let _ = self.reload_projects(files);
            affected.push("projects".to_string());
        }
        if targets.contains("tasks") {
            let _ = self.reload_tasks();
            affected.push("tasks".to_string());
        }

        // Skip resolve_all_tasks if a command already ran it within the last 600ms.
        // The watcher fires ~300ms after the write that the command just completed,
        // so this avoids the double DELETE-ALL / INSERT-ALL cycle on every mutation.
        // External edits (e.g. user edits a file in another editor) still get a full
        // resolve because last_resolve_at will be old or None.
        let recently_resolved = self
            .last_resolve_at
            .map(|t| t.elapsed() < std::time::Duration::from_millis(600))
            .unwrap_or(false);
        if !recently_resolved {
            let _ = self.resolve_all_tasks();
        }
        affected.push("tasks".to_string());
        affected.sort();
        affected.dedup();

        let changes: Vec<serde_json::Value> = affected
            .iter()
            .map(|t| serde_json::json!({ "entity": t, "ids": null }))
            .collect();
        self.emit_data_changed(&changes);
    }

    pub fn reload_events(&self) -> rusqlite::Result<()> {
        let events = self.read_events_from_disk();
        self.conn.execute("DELETE FROM events", [])?;
        for e in &events {
            self.conn.execute(
                "INSERT INTO events (id, source, from_, to_, name, description, participants, location, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    e.id, e.source, e.from_, e.to, e.name, e.description,
                    serde_json::to_string(&e.participants).unwrap_or_default(),
                    e.location,
                    serde_json::to_string(&e.metadata).unwrap_or_default(),
                ],
            )?;
        }
        self.conn
            .execute_batch("INSERT INTO events_fts(events_fts) VALUES('rebuild');")?;
        Ok(())
    }

    pub fn reload_notes(&mut self, files: Option<&[String]>) -> rusqlite::Result<()> {
        match files {
            None => {
                let (notes, note_tasks) = self.read_notes_from_disk();
                self.conn.execute("DELETE FROM notes", [])?;
                for n in &notes {
                    self.insert_note(n)?;
                }
                self.conn
                    .execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;
                let sources: std::collections::HashSet<String> = notes
                    .iter()
                    .map(|n| format!("notes/{}", n.filename))
                    .collect();
                self.replace_tasks(&sources, &note_tasks)?;
            }
            Some(filenames) => {
                let ndir = notes_dir(&self.data_root);
                let mut all_tasks: Vec<TaskEntity> = Vec::new();
                let mut sources: std::collections::HashSet<String> =
                    std::collections::HashSet::new();
                for filename in filenames {
                    sources.insert(format!("notes/{}", filename));
                    self.conn
                        .execute("DELETE FROM notes WHERE filename = ?1", params![filename])?;
                    let md_path = ndir.join(filename);
                    if md_path.exists() {
                        if let Some((note, tasks)) = self.read_note_file(&md_path) {
                            self.insert_note(&note)?;
                            all_tasks.extend(tasks);
                        }
                    }
                }
                self.conn
                    .execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;
                self.replace_tasks(&sources, &all_tasks)?;
            }
        }
        Ok(())
    }

    pub fn reload_projects(&mut self, files: Option<&[String]>) -> rusqlite::Result<()> {
        match files {
            None => {
                let (projects, project_tasks) = self.read_projects_from_disk();
                self.conn.execute("DELETE FROM projects", [])?;
                for p in &projects {
                    self.insert_project(p)?;
                }
                self.conn
                    .execute_batch("INSERT INTO projects_fts(projects_fts) VALUES('rebuild');")?;
                let sources: std::collections::HashSet<String> = projects
                    .iter()
                    .map(|p| format!("projects/{}", p.filename))
                    .collect();
                self.replace_tasks(&sources, &project_tasks)?;
            }
            Some(filenames) => {
                let pdir = projects_dir(&self.data_root);
                let mut all_tasks: Vec<TaskEntity> = Vec::new();
                let mut sources: std::collections::HashSet<String> =
                    std::collections::HashSet::new();
                for filename in filenames {
                    let project_id = Path::new(filename)
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    sources.insert(format!("projects/{}", filename));
                    self.conn
                        .execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;
                    let md_path = pdir.join(filename);
                    if md_path.exists() {
                        if let Some((project, tasks)) = self.read_project_file(&md_path) {
                            self.insert_project(&project)?;
                            all_tasks.extend(tasks);
                        }
                    }
                }
                self.conn
                    .execute_batch("INSERT INTO projects_fts(projects_fts) VALUES('rebuild');")?;
                self.replace_tasks(&sources, &all_tasks)?;
            }
        }
        Ok(())
    }

    pub fn reload_tasks(&mut self) -> rusqlite::Result<()> {
        let tasks = self.read_tasks_from_disk();
        let sources: std::collections::HashSet<String> =
            std::iter::once("tasks.md".to_string()).collect();
        self.replace_tasks(&sources, &tasks)
    }

    fn insert_note(&self, n: &NoteEntity) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO notes (filename, title, body_preview, event_ids, project_ids, raw_content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                n.filename, n.title, n.body_preview,
                serde_json::to_string(&n.event_ids).unwrap_or_default(),
                serde_json::to_string(&n.project_ids).unwrap_or_default(),
                n.raw_content,
            ],
        )?;
        Ok(())
    }

    fn insert_project(&self, p: &ProjectEntity) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO projects (id, filename, title, body_preview, event_ids, raw_content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                p.id, p.filename, p.title, p.body_preview,
                serde_json::to_string(&p.event_ids).unwrap_or_default(),
                p.raw_content,
            ],
        )?;
        Ok(())
    }

    fn replace_tasks(
        &self,
        source_files: &std::collections::HashSet<String>,
        tasks: &[TaskEntity],
    ) -> rusqlite::Result<()> {
        if !source_files.is_empty() {
            let placeholders: String = source_files
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1))
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!("DELETE FROM tasks WHERE source_file IN ({})", placeholders);
            let mut stmt = self.conn.prepare(&sql)?;
            let params: Vec<&dyn rusqlite::ToSql> = source_files
                .iter()
                .map(|s| s as &dyn rusqlite::ToSql)
                .collect();
            stmt.execute(params.as_slice())?;
        }
        for t in tasks {
            self.conn.execute(
                "INSERT INTO tasks (text, completed, raw_line, source_file, line_number, deadline, event_ids, project_ids, time_references, resolved_event_names, resolved_project_names)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    t.text,
                    t.completed as i64,
                    t.raw_line,
                    t.source_file,
                    t.line_number,
                    t.deadline,
                    serde_json::to_string(&t.event_ids).unwrap_or_default(),
                    serde_json::to_string(&t.project_ids).unwrap_or_default(),
                    serde_json::to_string(&t.time_references).unwrap_or_default(),
                    serde_json::to_string(&t.resolved_event_names).unwrap_or_default(),
                    serde_json::to_string(&t.resolved_project_names).unwrap_or_default(),
                ],
            )?;
        }
        self.conn
            .execute_batch("INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');")?;
        Ok(())
    }

    pub fn resolve_all_tasks(&mut self) -> rusqlite::Result<()> {
        self.last_resolve_at = Some(std::time::Instant::now());
        // Build event_map and project_map from DB
        let event_map = self.build_event_map()?;
        let project_map = self.build_project_map()?;

        // Read all tasks
        let tasks = self.all_tasks_raw()?;
        if tasks.is_empty() {
            return Ok(());
        }

        let resolved = resolve_tasks(tasks, &event_map, &project_map);

        // Write back
        self.conn.execute("DELETE FROM tasks", [])?;
        for t in &resolved {
            self.conn.execute(
                "INSERT INTO tasks (text, completed, raw_line, source_file, line_number, deadline, event_ids, project_ids, time_references, resolved_event_names, resolved_project_names)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    t.text,
                    t.completed as i64,
                    t.raw_line,
                    t.source_file,
                    t.line_number,
                    t.deadline,
                    serde_json::to_string(&t.event_ids).unwrap_or_default(),
                    serde_json::to_string(&t.project_ids).unwrap_or_default(),
                    serde_json::to_string(&t.time_references).unwrap_or_default(),
                    serde_json::to_string(&t.resolved_event_names).unwrap_or_default(),
                    serde_json::to_string(&t.resolved_project_names).unwrap_or_default(),
                ],
            )?;
        }
        self.conn
            .execute_batch("INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');")?;
        Ok(())
    }

    fn build_event_map(&self) -> rusqlite::Result<HashMap<String, EventRef>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, from_, to_ FROM events")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        let mut map = HashMap::new();
        for row in rows.flatten() {
            let (id, name, from_s, to_s) = row;
            let from_ = parse_iso_datetime(&from_s).unwrap_or_else(chrono::Utc::now);
            let to = parse_iso_datetime(&to_s).unwrap_or_else(chrono::Utc::now);
            map.insert(id, EventRef { name, from_, to });
        }
        Ok(map)
    }

    fn build_project_map(&self) -> rusqlite::Result<HashMap<String, String>> {
        let mut stmt = self.conn.prepare("SELECT id, title FROM projects")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        Ok(rows.flatten().collect())
    }

    fn all_tasks_raw(&self) -> rusqlite::Result<Vec<TaskEntity>> {
        let mut stmt = self.conn.prepare("SELECT * FROM tasks")?;
        let tasks = stmt
            .query_map([], |row| row_to_task(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(tasks)
    }

    // -----------------------------------------------------------------------
    // Paginated queries
    // -----------------------------------------------------------------------

    fn normalize_page_size(limit: Option<u32>) -> u32 {
        limit.map(|l| l.min(500).max(1)).unwrap_or(100)
    }

    fn parse_cursor(cursor: Option<&str>) -> i64 {
        cursor.and_then(|c| c.parse().ok()).unwrap_or(0)
    }

    pub fn list_events_page(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
        from_: Option<&str>,
        to: Option<&str>,
    ) -> rusqlite::Result<(Vec<EventEntity>, Option<String>)> {
        let page_size = Self::normalize_page_size(limit) as i64;
        let offset = Self::parse_cursor(cursor);

        let mut where_parts: Vec<String> = Vec::new();
        let mut bind: Vec<String> = Vec::new();

        if let Some(f) = from_ {
            where_parts.push("to_ >= ?".to_string());
            bind.push(f.to_string());
        }
        if let Some(t) = to {
            where_parts.push("from_ <= ?".to_string());
            bind.push(t.to_string());
        }

        let where_clause = if where_parts.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_parts.join(" AND "))
        };

        let sql = format!(
            "SELECT * FROM events {} ORDER BY from_ ASC, to_ ASC, id ASC LIMIT {} OFFSET {}",
            where_clause,
            page_size + 1,
            offset
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let bind_refs: Vec<&dyn rusqlite::ToSql> =
            bind.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows: Vec<EventEntity> = stmt
            .query_map(bind_refs.as_slice(), |row| row_to_event(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let has_more = rows.len() > page_size as usize;
        let page: Vec<EventEntity> = rows.into_iter().take(page_size as usize).collect();
        let next_cursor = if has_more {
            Some((offset + page_size).to_string())
        } else {
            None
        };
        Ok((page, next_cursor))
    }

    pub fn list_notes_page(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
        event_id: Option<&str>,
        project_id: Option<&str>,
    ) -> rusqlite::Result<(Vec<NoteEntity>, Option<String>)> {
        let page_size = Self::normalize_page_size(limit) as i64;
        let offset = Self::parse_cursor(cursor);

        let mut where_parts: Vec<String> = Vec::new();
        let mut bind: Vec<String> = Vec::new();

        if let Some(eid) = event_id {
            where_parts.push("instr(event_ids, ?) > 0".to_string());
            bind.push(format!(r#""{}""#, eid));
        }
        if let Some(pid) = project_id {
            where_parts.push("instr(project_ids, ?) > 0".to_string());
            bind.push(format!(r#""{}""#, pid));
        }

        let where_clause = if where_parts.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_parts.join(" AND "))
        };

        let sql = format!(
            "SELECT * FROM notes {} ORDER BY filename ASC LIMIT {} OFFSET {}",
            where_clause,
            page_size + 1,
            offset
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let bind_refs: Vec<&dyn rusqlite::ToSql> =
            bind.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows: Vec<NoteEntity> = stmt
            .query_map(bind_refs.as_slice(), |row| row_to_note(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let has_more = rows.len() > page_size as usize;
        let page: Vec<NoteEntity> = rows.into_iter().take(page_size as usize).collect();
        let next_cursor = if has_more {
            Some((offset + page_size).to_string())
        } else {
            None
        };
        Ok((page, next_cursor))
    }

    pub fn list_projects_page(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
    ) -> rusqlite::Result<(Vec<ProjectEntity>, Option<String>)> {
        let page_size = Self::normalize_page_size(limit) as i64;
        let offset = Self::parse_cursor(cursor);

        let sql = format!(
            "SELECT * FROM projects ORDER BY id ASC LIMIT {} OFFSET {}",
            page_size + 1,
            offset
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows: Vec<ProjectEntity> = stmt
            .query_map([], |row| row_to_project(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let has_more = rows.len() > page_size as usize;
        let page: Vec<ProjectEntity> = rows.into_iter().take(page_size as usize).collect();
        let next_cursor = if has_more {
            Some((offset + page_size).to_string())
        } else {
            None
        };
        Ok((page, next_cursor))
    }

    pub fn list_tasks_page(
        &self,
        limit: Option<u32>,
        cursor: Option<&str>,
        deadline_from: Option<&str>,
        deadline_to: Option<&str>,
        event_id: Option<&str>,
        project_id: Option<&str>,
    ) -> rusqlite::Result<(Vec<TaskEntity>, Option<String>)> {
        let page_size = Self::normalize_page_size(limit) as i64;
        let offset = Self::parse_cursor(cursor);

        let mut where_parts: Vec<String> = Vec::new();
        let mut bind: Vec<String> = Vec::new();

        if let Some(df) = deadline_from {
            where_parts.push("deadline IS NOT NULL AND deadline >= ?".to_string());
            bind.push(df.to_string());
        }
        if let Some(dt) = deadline_to {
            where_parts.push("deadline IS NOT NULL AND deadline <= ?".to_string());
            bind.push(dt.to_string());
        }
        if let Some(eid) = event_id {
            where_parts.push("instr(event_ids, ?) > 0".to_string());
            bind.push(format!(r#""{}""#, eid));
        }
        if let Some(pid) = project_id {
            where_parts.push("instr(project_ids, ?) > 0".to_string());
            bind.push(format!(r#""{}""#, pid));
        }

        let where_clause = if where_parts.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_parts.join(" AND "))
        };

        let sql = format!(
            "SELECT * FROM tasks {} ORDER BY source_file ASC, line_number ASC, rowid ASC LIMIT {} OFFSET {}",
            where_clause, page_size + 1, offset
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let bind_refs: Vec<&dyn rusqlite::ToSql> =
            bind.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let rows: Vec<TaskEntity> = stmt
            .query_map(bind_refs.as_slice(), |row| row_to_task(row))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let has_more = rows.len() > page_size as usize;
        let page: Vec<TaskEntity> = rows.into_iter().take(page_size as usize).collect();
        let next_cursor = if has_more {
            Some((offset + page_size).to_string())
        } else {
            None
        };
        Ok((page, next_cursor))
    }

    // -----------------------------------------------------------------------
    // Get single entity
    // -----------------------------------------------------------------------

    pub fn get_event(&self, id: &str) -> rusqlite::Result<Option<EventEntity>> {
        self.conn
            .query_row("SELECT * FROM events WHERE id = ?1", params![id], |row| {
                row_to_event(row)
            })
            .optional()
    }

    pub fn get_note(&self, filename: &str) -> rusqlite::Result<Option<NoteEntity>> {
        self.conn
            .query_row(
                "SELECT * FROM notes WHERE filename = ?1",
                params![filename],
                |row| row_to_note(row),
            )
            .optional()
    }

    pub fn get_project(&self, id: &str) -> rusqlite::Result<Option<ProjectEntity>> {
        self.conn
            .query_row("SELECT * FROM projects WHERE id = ?1", params![id], |row| {
                row_to_project(row)
            })
            .optional()
    }

    // -----------------------------------------------------------------------
    // Full-text search (with LIKE fallback)
    // -----------------------------------------------------------------------

    pub fn search_events(&self, query: &str) -> rusqlite::Result<Vec<EventEntity>> {
        match self.conn.prepare(
            "SELECT e.* FROM events e JOIN events_fts f ON e.rowid = f.rowid WHERE events_fts MATCH ?1",
        ) {
            Ok(mut stmt) => {
                let rows = stmt
                    .query_map(params![query], |row| row_to_event(row))?
                    .collect::<rusqlite::Result<Vec<_>>>();
                match rows {
                    Ok(v) => return Ok(v),
                    Err(_) => {}
                }
            }
            Err(_) => {}
        }
        // LIKE fallback
        let wildcard = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT * FROM events WHERE name LIKE ?1 OR description LIKE ?1 OR location LIKE ?1 OR participants LIKE ?1",
        )?;
        let result = stmt
            .query_map(params![wildcard], |row| row_to_event(row))?
            .collect::<rusqlite::Result<Vec<_>>>();
        result
    }

    pub fn search_notes(&self, query: &str) -> rusqlite::Result<Vec<NoteEntity>> {
        if let Ok(mut stmt) = self.conn.prepare(
            "SELECT n.* FROM notes n JOIN notes_fts f ON n.rowid = f.rowid WHERE notes_fts MATCH ?1",
        ) {
            if let Ok(rows) = stmt
                .query_map(params![query], |row| row_to_note(row))?
                .collect::<rusqlite::Result<Vec<_>>>()
            {
                return Ok(rows);
            }
        }
        let wildcard = format!("%{}%", query);
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM notes WHERE title LIKE ?1 OR raw_content LIKE ?1")?;
        let result = stmt
            .query_map(params![wildcard], |row| row_to_note(row))?
            .collect::<rusqlite::Result<Vec<_>>>();
        result
    }

    pub fn search_projects(&self, query: &str) -> rusqlite::Result<Vec<ProjectEntity>> {
        if let Ok(mut stmt) = self.conn.prepare(
            "SELECT p.* FROM projects p JOIN projects_fts f ON p.rowid = f.rowid WHERE projects_fts MATCH ?1",
        ) {
            if let Ok(rows) = stmt
                .query_map(params![query], |row| row_to_project(row))?
                .collect::<rusqlite::Result<Vec<_>>>()
            {
                return Ok(rows);
            }
        }
        let wildcard = format!("%{}%", query);
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM projects WHERE title LIKE ?1 OR raw_content LIKE ?1")?;
        let result = stmt
            .query_map(params![wildcard], |row| row_to_project(row))?
            .collect::<rusqlite::Result<Vec<_>>>();
        result
    }

    pub fn search_tasks(&self, query: &str) -> rusqlite::Result<Vec<TaskEntity>> {
        if let Ok(mut stmt) = self.conn.prepare(
            "SELECT t.* FROM tasks t JOIN tasks_fts f ON t.rowid = f.rowid WHERE tasks_fts MATCH ?1 ORDER BY t.line_number",
        ) {
            if let Ok(rows) = stmt
                .query_map(params![query], |row| row_to_task(row))?
                .collect::<rusqlite::Result<Vec<_>>>()
            {
                return Ok(rows);
            }
        }
        let wildcard = format!("%{}%", query);
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM tasks WHERE text LIKE ?1 ORDER BY line_number")?;
        let result = stmt
            .query_map(params![wildcard], |row| row_to_task(row))?
            .collect::<rusqlite::Result<Vec<_>>>();
        result
    }

    // -----------------------------------------------------------------------
    // Write methods — file I/O → reload → emit
    // -----------------------------------------------------------------------

    pub fn create_event(&mut self, event: &EventEntity) -> Result<EventEntity, String> {
        let path = events_file(&self.data_root);
        let raw = if path.exists() {
            std::fs::read_to_string(&path).map_err(|e| e.to_string())?
        } else {
            "events: []\n".to_string()
        };

        let mut data: serde_yaml::Value =
            serde_yaml::from_str(&raw).unwrap_or(serde_yaml::Value::Null);
        if !data.is_mapping() {
            data = serde_yaml::to_value(serde_yaml::Mapping::new()).unwrap();
        }
        if data.get("events").is_none() {
            data["events"] = serde_yaml::Value::Sequence(vec![]);
        }
        let events = data["events"]
            .as_sequence_mut()
            .ok_or("events.yaml malformed")?;

        if events
            .iter()
            .any(|e| e.get("id").and_then(|v| v.as_str()) == Some(&event.id))
        {
            return Err(format!("Event already exists: {}", event.id));
        }

        events.push(event_to_yaml(event));
        std::fs::write(&path, serde_yaml::to_string(&data).unwrap_or_default())
            .map_err(|e| e.to_string())?;

        self.reload_events().map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "events", "ids": [event.id] })]);

        self.get_event(&event.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Event not found after creation".to_string())
    }

    pub fn update_event(&mut self, event: &EventEntity) -> Result<EventEntity, String> {
        let path = events_file(&self.data_root);
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut data: serde_yaml::Value = serde_yaml::from_str(&raw).map_err(|e| e.to_string())?;

        let events = data["events"]
            .as_sequence_mut()
            .ok_or("events.yaml malformed")?;

        let pos = events
            .iter()
            .position(|e| e.get("id").and_then(|v| v.as_str()) == Some(&event.id))
            .ok_or_else(|| format!("Event not found: {}", event.id))?;
        events[pos] = event_to_yaml(event);

        std::fs::write(&path, serde_yaml::to_string(&data).unwrap_or_default())
            .map_err(|e| e.to_string())?;

        self.reload_events().map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "events", "ids": [event.id] })]);

        self.get_event(&event.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Event not found after update".to_string())
    }

    pub fn delete_event(&mut self, event_id: &str) -> Result<(), String> {
        let path = events_file(&self.data_root);
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut data: serde_yaml::Value = serde_yaml::from_str(&raw).map_err(|e| e.to_string())?;

        let events = data["events"]
            .as_sequence_mut()
            .ok_or("events.yaml malformed")?;

        let len_before = events.len();
        events.retain(|e| e.get("id").and_then(|v| v.as_str()) != Some(event_id));
        if events.len() == len_before {
            return Err(format!("Event not found: {}", event_id));
        }

        std::fs::write(&path, serde_yaml::to_string(&data).unwrap_or_default())
            .map_err(|e| e.to_string())?;

        self.reload_events().map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "events", "ids": [event_id] })]);
        Ok(())
    }

    pub fn create_note(
        &mut self,
        filename: &str,
        content: &str,
        event_ids: Option<&[String]>,
        project_ids: Option<&[String]>,
    ) -> Result<NoteEntity, String> {
        let mut fm: HashMap<String, serde_yaml::Value> = HashMap::new();
        if let Some(eids) = event_ids {
            if !eids.is_empty() {
                fm.insert(
                    "event_ids".to_string(),
                    serde_yaml::Value::Sequence(
                        eids.iter()
                            .map(|s| serde_yaml::Value::String(s.clone()))
                            .collect(),
                    ),
                );
            }
        }
        if let Some(pids) = project_ids {
            if !pids.is_empty() {
                fm.insert(
                    "project_ids".to_string(),
                    serde_yaml::Value::Sequence(
                        pids.iter()
                            .map(|s| serde_yaml::Value::String(s.clone()))
                            .collect(),
                    ),
                );
            }
        }

        let note_filename = ensure_md_ext(filename);
        let full_content = serialize_frontmatter(&fm, content);
        let path = storage::note_file(&self.data_root, &note_filename);

        if path.exists() {
            return Err(format!("Note already exists: {}", path.display()));
        }
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&path, sanitize_content(&full_content)).map_err(|e| e.to_string())?;

        self.reload_notes(Some(&[note_filename.clone()]))
            .map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "notes", "ids": [note_filename] })]);

        self.get_note(&note_filename)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Note not found after creation".to_string())
    }

    pub fn update_note(&mut self, filename: &str, content: &str) -> Result<NoteEntity, String> {
        let note_filename = ensure_md_ext(filename);
        let path = storage::note_file(&self.data_root, &note_filename);

        if !path.exists() {
            return Err(format!("Note not found: {}", path.display()));
        }
        std::fs::write(&path, sanitize_content(content)).map_err(|e| e.to_string())?;

        self.reload_notes(Some(&[note_filename.clone()]))
            .map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "notes", "ids": [note_filename] })]);

        self.get_note(&note_filename)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Note not found after update".to_string())
    }

    pub fn delete_note(&mut self, filename: &str) -> Result<(), String> {
        let note_filename = ensure_md_ext(filename);
        let path = storage::note_file(&self.data_root, &note_filename);
        if !path.exists() {
            return Err(format!("Note not found: {}", path.display()));
        }
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;

        self.reload_notes(Some(&[note_filename.clone()]))
            .map_err(|e| e.to_string())?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "notes", "ids": [note_filename] })]);
        Ok(())
    }

    pub fn toggle_task(&mut self, source_file: &str, line_number: i64) -> Result<(), String> {
        let path = self.data_root.join(source_file);
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
        // Preserve trailing newline
        let had_trailing = text.ends_with('\n');

        let idx = (line_number - 1) as usize;
        if idx >= lines.len() {
            return Err(format!("Line {} out of range", line_number));
        }

        let line = &lines[idx];
        let re: &Regex = once_cell::sync::Lazy::force(&TOGGLE_TASK_RE);
        let Some(caps) = re.captures(line) else {
            return Err(format!("Line {} is not a task", line_number));
        };

        let indent = &caps[1];
        let bullet = &caps[2];
        let marker = &caps[3];
        let task_text = &caps[4];
        let toggled = if matches!(marker, "x" | "X") {
            " "
        } else {
            "x"
        };
        lines[idx] = format!("{}{} [{}] {}", indent, bullet, toggled, task_text);

        let mut content = lines.join("\n");
        if had_trailing {
            content.push('\n');
        }
        std::fs::write(&path, sanitize_content(&content)).map_err(|e| e.to_string())?;

        self.reload_after_task_change(source_file)?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "tasks", "ids": null })]);
        Ok(())
    }

    pub fn delete_task(&mut self, source_file: &str, line_number: i64) -> Result<(), String> {
        let path = self.data_root.join(source_file);
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
        let had_trailing = text.ends_with('\n');

        let idx = (line_number - 1) as usize;
        if idx >= lines.len() {
            return Err(format!("Line {} out of range", line_number));
        }

        let re: &Regex = once_cell::sync::Lazy::force(&DELETE_TASK_RE);
        if !re.is_match(&lines[idx]) {
            return Err(format!("Line {} is not a task", line_number));
        }

        lines.remove(idx);
        let mut content = lines.join("\n");
        if had_trailing {
            content.push('\n');
        }
        std::fs::write(&path, sanitize_content(&content)).map_err(|e| e.to_string())?;

        self.reload_after_task_change(source_file)?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "tasks", "ids": null })]);
        Ok(())
    }

    pub fn update_task(
        &mut self,
        source_file: &str,
        line_number: i64,
        new_text: &str,
    ) -> Result<(), String> {
        let new_text = new_text.trim();
        if new_text.is_empty() {
            return Err("Task text must not be empty".to_string());
        }

        let path = self.data_root.join(source_file);
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
        let had_trailing = text.ends_with('\n');

        let idx = (line_number - 1) as usize;
        if idx >= lines.len() {
            return Err(format!("Line {} out of range", line_number));
        }

        let re: &Regex = once_cell::sync::Lazy::force(&UPDATE_TASK_RE);
        let Some(caps) = re.captures(&lines[idx]) else {
            return Err(format!("Line {} is not a task", line_number));
        };

        let indent = &caps[1];
        let bullet = &caps[2];
        let marker = &caps[3];
        lines[idx] = format!("{}{} [{}] {}", indent, bullet, marker, new_text);

        let mut content = lines.join("\n");
        if had_trailing {
            content.push('\n');
        }
        std::fs::write(&path, sanitize_content(&content)).map_err(|e| e.to_string())?;

        self.reload_after_task_change(source_file)?;
        self.emit_data_changed(&[serde_json::json!({ "entity": "tasks", "ids": null })]);
        Ok(())
    }

    pub fn create_task(&mut self, text: &str) -> Result<TaskEntity, String> {
        let text = text.trim();
        if text.is_empty() {
            return Err("Task text must not be empty".to_string());
        }

        let path = tasks_file(&self.data_root);
        let existing = if path.exists() {
            std::fs::read_to_string(&path).map_err(|e| e.to_string())?
        } else {
            String::new()
        };

        let mut content = existing;
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&format!("- [ ] {}\n", text));

        std::fs::write(&path, sanitize_content(&content)).map_err(|e| e.to_string())?;

        self.reload_tasks().map_err(|e| e.to_string())?;
        let _ = self.resolve_all_tasks().map_err(|e| e.to_string());
        self.emit_data_changed(&[serde_json::json!({ "entity": "tasks", "ids": null })]);

        // Return the last task in tasks.md
        let (tasks, _) = self
            .list_tasks_page(Some(500), None, None, None, None, None)
            .map_err(|e| e.to_string())?;
        let floating: Vec<_> = tasks
            .into_iter()
            .filter(|t| t.source_file == "tasks.md")
            .collect();
        floating
            .into_iter()
            .last()
            .ok_or_else(|| "Task not found after creation".to_string())
    }

    fn reload_after_task_change(&mut self, source_file: &str) -> Result<(), String> {
        if source_file.starts_with("notes/") {
            let filename = source_file.trim_start_matches("notes/").to_string();
            self.reload_notes(Some(&[filename]))
                .map_err(|e| e.to_string())?;
        } else if source_file.starts_with("projects/") {
            let filename = source_file.trim_start_matches("projects/").to_string();
            self.reload_projects(Some(&[filename]))
                .map_err(|e| e.to_string())?;
        } else {
            self.reload_tasks().map_err(|e| e.to_string())?;
        }
        self.resolve_all_tasks().map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Static regex for task mutations
// ---------------------------------------------------------------------------

static TOGGLE_TASK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(\s*)([-*+]) \[([ xX])\] (.+)$").unwrap());
static DELETE_TASK_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*[-*+] \[[ xX]\] ").unwrap());
static UPDATE_TASK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(\s*)([-*+]) \[([ xX])\] .+$").unwrap());

// ---------------------------------------------------------------------------
// Row → Entity conversions
// ---------------------------------------------------------------------------

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<EventEntity> {
    let participants_json: String = row.get("participants")?;
    let metadata_json: String = row
        .get::<_, Option<String>>("metadata")?
        .unwrap_or_else(|| "{}".to_string());

    Ok(EventEntity {
        id: row.get("id")?,
        source: row.get("source")?,
        from_: row.get("from_")?,
        to: row.get("to_")?,
        name: row.get("name")?,
        description: row.get("description")?,
        participants: serde_json::from_str(&participants_json).unwrap_or_default(),
        location: row.get("location")?,
        metadata: serde_json::from_str(&metadata_json).unwrap_or_default(),
    })
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteEntity> {
    let event_ids_json: String = row.get("event_ids")?;
    let project_ids_json: String = row.get("project_ids")?;
    Ok(NoteEntity {
        filename: row.get("filename")?,
        title: row.get("title")?,
        body_preview: row.get("body_preview")?,
        event_ids: serde_json::from_str(&event_ids_json).unwrap_or_default(),
        project_ids: serde_json::from_str(&project_ids_json).unwrap_or_default(),
        raw_content: row.get("raw_content")?,
    })
}

fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectEntity> {
    let event_ids_json: String = row.get("event_ids")?;
    Ok(ProjectEntity {
        id: row.get("id")?,
        filename: row.get("filename")?,
        title: row.get("title")?,
        body_preview: row.get("body_preview")?,
        event_ids: serde_json::from_str(&event_ids_json).unwrap_or_default(),
        raw_content: row.get("raw_content")?,
    })
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskEntity> {
    let event_ids_json: String = row.get("event_ids")?;
    let project_ids_json: String = row.get("project_ids")?;
    let time_refs_json: String = row.get("time_references")?;
    let resolved_ev_json: String = row.get("resolved_event_names")?;
    let resolved_pr_json: String = row.get("resolved_project_names")?;
    Ok(TaskEntity {
        text: row.get("text")?,
        completed: {
            let v: i64 = row.get("completed")?;
            v != 0
        },
        raw_line: row.get("raw_line")?,
        source_file: row.get("source_file")?,
        line_number: row.get("line_number")?,
        deadline: row.get("deadline")?,
        event_ids: serde_json::from_str(&event_ids_json).unwrap_or_default(),
        project_ids: serde_json::from_str(&project_ids_json).unwrap_or_default(),
        time_references: serde_json::from_str(&time_refs_json).unwrap_or_default(),
        resolved_event_names: serde_json::from_str(&resolved_ev_json).unwrap_or_default(),
        resolved_project_names: serde_json::from_str(&resolved_pr_json).unwrap_or_default(),
    })
}

// ---------------------------------------------------------------------------
// YAML ↔ EventEntity helpers
// ---------------------------------------------------------------------------

fn yaml_entry_to_event(entry: &serde_yaml::Value) -> Option<EventEntity> {
    let id = entry.get("id")?.as_str()?.to_string();
    let source = entry
        .get("source")
        .and_then(|v| v.as_str())
        .unwrap_or("local")
        .to_string();
    // YAML key is "from" (not "from_")
    let from_str = yaml_value_to_str(entry.get("from")?)?;
    let to_str = yaml_value_to_str(entry.get("to")?)?;
    let name = entry.get("name")?.as_str()?.to_string();
    let description = entry
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let participants: Vec<String> = entry
        .get("participants")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let location = entry
        .get("location")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let metadata: EventMetadata = entry
        .get("metadata")
        .and_then(|v| serde_yaml::from_value(v.clone()).ok())
        .unwrap_or_default();

    Some(EventEntity {
        id,
        source,
        from_: from_str,
        to: to_str,
        name,
        description,
        participants,
        location,
        metadata,
    })
}

fn yaml_value_to_str(val: &serde_yaml::Value) -> Option<String> {
    match val {
        serde_yaml::Value::String(s) => Some(s.clone()),
        serde_yaml::Value::Number(n) => Some(n.to_string()),
        // YAML auto-parses timestamps — serde_yaml may represent them as tagged values
        _ => {
            // Try to serialize back to string
            serde_yaml::to_string(val)
                .ok()
                .map(|s| s.trim().to_string())
        }
    }
}

fn event_to_yaml(event: &EventEntity) -> serde_yaml::Value {
    let mut map = serde_yaml::Mapping::new();
    map.insert(
        serde_yaml::Value::String("id".to_string()),
        serde_yaml::Value::String(event.id.clone()),
    );
    map.insert(
        serde_yaml::Value::String("source".to_string()),
        serde_yaml::Value::String(event.source.clone()),
    );
    // Use "from" key (not "from_") in YAML file
    map.insert(
        serde_yaml::Value::String("from".to_string()),
        serde_yaml::Value::String(event.from_.clone()),
    );
    map.insert(
        serde_yaml::Value::String("to".to_string()),
        serde_yaml::Value::String(event.to.clone()),
    );
    map.insert(
        serde_yaml::Value::String("name".to_string()),
        serde_yaml::Value::String(event.name.clone()),
    );
    map.insert(
        serde_yaml::Value::String("description".to_string()),
        serde_yaml::Value::String(event.description.clone()),
    );
    map.insert(
        serde_yaml::Value::String("participants".to_string()),
        serde_yaml::Value::Sequence(
            event
                .participants
                .iter()
                .map(|p| serde_yaml::Value::String(p.clone()))
                .collect(),
        ),
    );
    map.insert(
        serde_yaml::Value::String("location".to_string()),
        serde_yaml::Value::String(event.location.clone()),
    );
    map.insert(
        serde_yaml::Value::String("metadata".to_string()),
        serde_yaml::to_value(&event.metadata)
            .unwrap_or(serde_yaml::Value::Mapping(serde_yaml::Mapping::new())),
    );
    serde_yaml::Value::Mapping(map)
}

fn ensure_md_ext(filename: &str) -> String {
    if filename.ends_with(".md") {
        filename.to_string()
    } else {
        format!("{}.md", filename)
    }
}
