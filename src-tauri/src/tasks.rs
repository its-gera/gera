//! Task parsing from markdown content and deadline resolution.
//!
//! Mirrors Python's `_parse_tasks_from_markdown` and `_resolve_tasks`.

use chrono::{DateTime, Duration, NaiveDateTime, TimeZone, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

use crate::models::{TaskEntity, TimeReference};

// ---------------------------------------------------------------------------
// Compiled regex patterns (mirrors Python patterns)
// ---------------------------------------------------------------------------

/// Matches a markdown task checkbox line: `- [ ]` or `- [x]`
static TASK_PAT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[-*+] \[([ xX])\] (.+)").unwrap()
});

/// Matches time/event references inside task text.
///
/// Groups:
/// 1. absolute datetime   `@2026-02-20T09:00`
/// 2. modifier            `before`/`after` in `@before[30m]:event-id`
/// 3. amount              numeric part
/// 4. unit                Y/M/W/d/h/m
/// 5. target_id           event id in modifier reference
/// 6. plain event ref     `@event-id`
static TIME_PAT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"@(?:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})|(\w+?)\[(\d+)([YMWdhm])\]:([\w\-\.:]+)|([\w\-\.]+))").unwrap()
});

/// Matches `#project-id` references
static PROJECT_PAT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"#([\w\-]+)").unwrap()
});

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/// Parse markdown text for task entities.
pub fn parse_tasks_from_markdown(text: &str, source_file: &str) -> Vec<TaskEntity> {
    let mut tasks = Vec::new();

    for (i, line) in text.lines().enumerate() {
        let stripped = line.trim();
        let Some(cap) = TASK_PAT.captures(stripped) else {
            continue;
        };

        let task_text = cap[2].to_string();
        let completed = matches!(&cap[1], "x" | "X");

        let mut deadline: Option<String> = None;
        let mut event_ids: Vec<String> = Vec::new();
        let mut project_ids: Vec<String> = Vec::new();
        let mut time_references: Vec<TimeReference> = Vec::new();

        for m in TIME_PAT.captures_iter(&task_text) {
            if let Some(dt) = m.get(1) {
                // Absolute datetime
                deadline = Some(format!("{}:00", dt.as_str())); // ensure seconds
            } else if m.get(2).is_some() {
                // Modifier reference: @before[30m]:event-id
                let modifier = m[2].to_string();
                let amount: i64 = m[3].parse().unwrap_or(0);
                let unit = m[4].to_string();
                let target_id = m[5].to_string();
                event_ids.push(target_id.clone());
                time_references.push(TimeReference {
                    modifier,
                    amount,
                    unit,
                    target_id,
                });
            } else if let Some(plain) = m.get(6) {
                // Plain event reference
                event_ids.push(plain.as_str().to_string());
            }
        }

        for m in PROJECT_PAT.captures_iter(&task_text) {
            project_ids.push(m[1].to_string());
        }

        tasks.push(TaskEntity {
            text: task_text,
            completed,
            raw_line: line.to_string(),
            source_file: source_file.to_string(),
            line_number: (i + 1) as i64,
            deadline,
            event_ids,
            project_ids,
            time_references,
            resolved_event_names: HashMap::new(),
            resolved_project_names: HashMap::new(),
        });
    }

    tasks
}

// ---------------------------------------------------------------------------
// Offset calculation
// ---------------------------------------------------------------------------

/// Convert amount + unit to a chrono Duration.
fn compute_offset(amount: i64, unit: &str) -> Duration {
    match unit {
        "m" => Duration::minutes(amount),
        "h" => Duration::hours(amount),
        "d" => Duration::days(amount),
        "W" => Duration::weeks(amount),
        "M" => Duration::days(amount * 30),
        "Y" => Duration::days(amount * 365),
        _ => Duration::days(amount),
    }
}

/// Parse an ISO-8601 string into a UTC DateTime.
pub fn parse_iso_datetime(s: &str) -> Option<DateTime<Utc>> {
    // Try full ISO-8601 with timezone
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    // Try without timezone (assume UTC)
    let formats = [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
    ];
    for fmt in &formats {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(Utc.from_utc_datetime(&ndt));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Deadline resolution (mirrors Python _resolve_tasks)
// ---------------------------------------------------------------------------

/// Info about a referenced event needed for deadline resolution.
pub struct EventRef {
    pub name: String,
    pub from_: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// Resolve task references against a map of event IDs → EventRef.
pub fn resolve_tasks(
    tasks: Vec<TaskEntity>,
    event_map: &HashMap<String, EventRef>,
    project_map: &HashMap<String, String>,
) -> Vec<TaskEntity> {
    tasks
        .into_iter()
        .map(|mut task| {
            // Build resolved name maps
            let resolved_event_names: HashMap<String, String> = task
                .event_ids
                .iter()
                .filter_map(|id| event_map.get(id).map(|e| (id.clone(), e.name.clone())))
                .collect();
            let resolved_project_names: HashMap<String, String> = task
                .project_ids
                .iter()
                .filter_map(|id| project_map.get(id).map(|n| (id.clone(), n.clone())))
                .collect();

            // Compute deadline from time references if not already set
            let computed_deadline = if task.deadline.is_some() {
                task.deadline.clone()
            } else {
                let mut dl = None;
                for ref_ in &task.time_references {
                    if let Some(ev) = event_map.get(&ref_.target_id) {
                        let offset = compute_offset(ref_.amount, &ref_.unit);
                        let dt = match ref_.modifier.as_str() {
                            "before" => ev.from_ - offset,
                            "after" => ev.to + offset,
                            _ => continue,
                        };
                        dl = Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string());
                        break;
                    }
                }
                dl
            };

            task.deadline = computed_deadline;
            task.resolved_event_names = resolved_event_names;
            task.resolved_project_names = resolved_project_names;
            task
        })
        .collect()
}
