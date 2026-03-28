//! File-system helpers: path constants, vault init/validation,
//! YAML frontmatter parsing/serialisation, and content sanitisation.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

pub const EVENTS_FILE: &str = "events.yaml";
pub const TASKS_FILE: &str = "tasks.md";
pub const NOTES_DIR: &str = "notes";
pub const PROJECTS_DIR: &str = "projects";

pub fn default_data_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Documents")
        .join("Gera")
}

pub fn events_file(data_root: &Path) -> PathBuf {
    data_root.join(EVENTS_FILE)
}

pub fn tasks_file(data_root: &Path) -> PathBuf {
    data_root.join(TASKS_FILE)
}

pub fn notes_dir(data_root: &Path) -> PathBuf {
    data_root.join(NOTES_DIR)
}

pub fn projects_dir(data_root: &Path) -> PathBuf {
    data_root.join(PROJECTS_DIR)
}

pub fn note_file(data_root: &Path, name: &str) -> PathBuf {
    let name = if name.ends_with(".md") {
        name.to_string()
    } else {
        format!("{}.md", name)
    };
    notes_dir(data_root).join(name)
}

pub fn project_file(data_root: &Path, name: &str) -> PathBuf {
    let name = if name.ends_with(".md") {
        name.to_string()
    } else {
        format!("{}.md", name)
    };
    projects_dir(data_root).join(name)
}

// ---------------------------------------------------------------------------
// Vault initialisation and validation
// ---------------------------------------------------------------------------

/// Create the standard Gera vault directory structure.
pub fn init_data_directory(path: Option<&Path>) -> std::io::Result<PathBuf> {
    let root = match path {
        Some(p) => p.to_path_buf(),
        None => default_data_root(),
    };

    std::fs::create_dir_all(&root)?;
    std::fs::create_dir_all(notes_dir(&root))?;
    std::fs::create_dir_all(projects_dir(&root))?;

    let ev = events_file(&root);
    if !ev.exists() {
        std::fs::write(&ev, "events: []\n")?;
    }

    let tf = tasks_file(&root);
    if !tf.exists() {
        std::fs::write(&tf, "# Tasks\n")?;
    }

    Ok(root)
}

/// Return a map of structure health checks for the given vault.
pub fn verify_structure(root: &Path) -> HashMap<String, bool> {
    let mut map = HashMap::new();
    map.insert(".".to_string(), root.is_dir());
    map.insert("notes".to_string(), notes_dir(root).is_dir());
    map.insert("projects".to_string(), projects_dir(root).is_dir());
    map.insert("events.yaml".to_string(), events_file(root).exists());
    map.insert("tasks.md".to_string(), tasks_file(root).exists());
    map
}

/// Return true if the given directory looks like a valid Gera vault.
pub fn is_valid_vault(root: &Path) -> bool {
    let s = verify_structure(root);
    s.get(".").copied().unwrap_or(false)
        && s.get("events.yaml").copied().unwrap_or(false)
        && s.get("tasks.md").copied().unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Content sanitisation (mirrors Python _sanitize_content)
// ---------------------------------------------------------------------------

/// Remove HTML-encoded spaces and strip trailing whitespace from each line.
pub fn sanitize_content(content: &str) -> String {
    let content = content.replace("&#x20;", " ");
    let lines: Vec<&str> = content.lines().collect();
    let mut result = lines
        .iter()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n");
    // Preserve trailing newline if the original had one
    if content.ends_with('\n') {
        result.push('\n');
    }
    result
}

// ---------------------------------------------------------------------------
// YAML frontmatter parsing and serialisation
// ---------------------------------------------------------------------------

/// Split YAML frontmatter from the markdown body.
/// Returns `(frontmatter_map, body_str)`.
pub fn parse_frontmatter(content: &str) -> (HashMap<String, serde_yaml::Value>, String) {
    if !content.starts_with("---") {
        return (HashMap::new(), content.to_string());
    }

    // Find the closing ---
    let after_open = &content[3..];
    let after_open = if after_open.starts_with('\n') {
        &after_open[1..]
    } else if after_open.starts_with("\r\n") {
        &after_open[2..]
    } else {
        return (HashMap::new(), content.to_string());
    };

    // Find closing ---\n
    if let Some(close_pos) = find_frontmatter_close(after_open) {
        let yaml_str = &after_open[..close_pos];
        let rest = &after_open[close_pos..];
        // Skip the --- and optional newline
        let body_start = if rest.starts_with("---\n") {
            4
        } else if rest.starts_with("---\r\n") {
            5
        } else if rest.starts_with("---") {
            3
        } else {
            0
        };
        let body = rest[body_start..].to_string();

        match serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
            Ok(serde_yaml::Value::Mapping(map)) => {
                let fm: HashMap<String, serde_yaml::Value> = map
                    .into_iter()
                    .filter_map(|(k, v)| k.as_str().map(|s| (s.to_string(), v)))
                    .collect();
                return (fm, body);
            }
            _ => {}
        }
    }

    (HashMap::new(), content.to_string())
}

fn find_frontmatter_close(s: &str) -> Option<usize> {
    let lines: Vec<&str> = s.lines().collect();
    let mut byte_pos = 0;
    for line in &lines {
        let trimmed = line.trim_end();
        if trimmed == "---" {
            return Some(byte_pos);
        }
        byte_pos += line.len() + 1; // +1 for \n
    }
    None
}

/// Combine a frontmatter map and markdown body into a complete file string.
pub fn serialize_frontmatter(data: &HashMap<String, serde_yaml::Value>, body: &str) -> String {
    if data.is_empty() {
        return body.to_string();
    }

    let mapping: serde_yaml::Mapping = data
        .iter()
        .map(|(k, v)| (serde_yaml::Value::String(k.clone()), v.clone()))
        .collect();
    let yaml_str = serde_yaml::to_string(&serde_yaml::Value::Mapping(mapping))
        .unwrap_or_default();
    // serde_yaml adds a leading `---\n`, strip it for our format
    let yaml_str = yaml_str.trim_start_matches("---\n").trim_end();
    let body = body.trim_start_matches('\n');
    format!("---\n{}\n---\n\n{}", yaml_str, body)
}

/// Extract event_ids list from frontmatter.
pub fn frontmatter_event_ids(fm: &HashMap<String, serde_yaml::Value>) -> Vec<String> {
    fm.get("event_ids")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Extract project_ids list from frontmatter.
pub fn frontmatter_project_ids(fm: &HashMap<String, serde_yaml::Value>) -> Vec<String> {
    fm.get("project_ids")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Title extraction from markdown body
// ---------------------------------------------------------------------------

/// Extract display title from raw markdown body.
/// Uses first `# H1` heading; falls back to first 6 words.
pub fn extract_title(body: &str) -> String {
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            return heading.trim().to_string();
        }
        if let Some(heading) = trimmed.strip_prefix("## ") {
            return heading.trim().to_string();
        }
        if let Some(heading) = trimmed.strip_prefix("### ") {
            return heading.trim().to_string();
        }
        if let Some(heading) = trimmed.strip_prefix("#### ") {
            return heading.trim().to_string();
        }
        if let Some(heading) = trimmed.strip_prefix("##### ") {
            return heading.trim().to_string();
        }
        if let Some(heading) = trimmed.strip_prefix("###### ") {
            return heading.trim().to_string();
        }
    }
    // fallback: first 6 words
    let words: Vec<&str> = body.split_whitespace().take(6).collect();
    if words.is_empty() {
        "Untitled".to_string()
    } else {
        words.join(" ")
    }
}

/// Return a ~100-char plain-text preview of a markdown body.
pub fn body_preview(body: &str) -> String {
    let text: String = body
        .lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let text = text.trim();
    if text.len() <= 100 {
        text.to_string()
    } else {
        format!("{}…", &text[..100])
    }
}

// ---------------------------------------------------------------------------
// Recent vaults persistence
// ---------------------------------------------------------------------------

pub fn load_recent_vaults(app_data_dir: &Path) -> Vec<String> {
    let path = app_data_dir.join("vaults.json");
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return vec![];
    };
    value["recent"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .take(10)
                .collect()
        })
        .unwrap_or_default()
}

pub fn save_recent_vault(app_data_dir: &Path, vault_path: &str) {
    let _ = std::fs::create_dir_all(app_data_dir);
    let mut recent = load_recent_vaults(app_data_dir);
    recent.retain(|p| p != vault_path);
    recent.insert(0, vault_path.to_string());
    recent.truncate(10);
    let value = serde_json::json!({ "recent": recent });
    let _ = std::fs::write(
        app_data_dir.join("vaults.json"),
        serde_json::to_string_pretty(&value).unwrap_or_default(),
    );
}
