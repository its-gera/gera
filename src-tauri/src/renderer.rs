//! Markdown-to-HTML renderer with Gera-specific extensions.
//!
//! Mirrors Python's `renderer.py` exactly:
//! - Renders CommonMark + GFM (task lists, strikethrough, tables) via `comrak`
//! - Post-processes HTML to wrap Gera `@`/`#` references in semantic `<span>` elements
//! - Extracts YAML frontmatter and document title

use once_cell::sync::Lazy;
use regex::Regex;

use crate::models::RenderMarkdownResponse;
use crate::storage::{
    extract_title, frontmatter_event_ids, frontmatter_project_ids, parse_frontmatter,
};

// ---------------------------------------------------------------------------
// Combined Gera reference pattern (single-pass, most-specific first)
//
// Group layout:
//   1 + 2 : @before[OFFSET]:TARGET
//   3     : @DATETIME  e.g. @2026-3-3T18:00
//   4     : @EVENT-ID
//   5     : #PROJECT-ID
//
// Using a single combined regex avoids the need for a lookahead assertion
// (which the `regex` crate does not support).  Because the engine tries
// alternatives left-to-right, `@before[...]` is consumed by group 1/2 before
// the engine can ever try group 4 at the same position.
// ---------------------------------------------------------------------------

static GERA_REF_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"@before\[(\d+[YMWdhm])\]:([\w][\w:\.\-]*)|@(\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2})|@([a-zA-Z][\w\-]*)|#([a-zA-Z][\w\-]*)",
    )
    .unwrap()
});

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

fn replace_gera_refs(html: &str) -> String {
    GERA_REF_RE
        .replace_all(html, |caps: &regex::Captures| {
            if caps.get(1).is_some() {
                // @before[OFFSET]:TARGET — groups 1 and 2
                let offset = &caps[1];
                let target = &caps[2];
                format!(
                    r#"<span class="gera-ref gera-ref--before" data-offset="{}" data-target="{}">@before[{}]:{}</span>"#,
                    offset, target, offset, target
                )
            } else if caps.get(3).is_some() {
                // @DATETIME — group 3
                let dt = &caps[3];
                format!(
                    r#"<span class="gera-ref gera-ref--datetime" data-datetime="{}">@{}</span>"#,
                    dt, dt
                )
            } else if caps.get(4).is_some() {
                // @EVENT-ID — group 4
                let event_id = &caps[4];
                format!(
                    r#"<span class="gera-ref gera-ref--event" data-event="{}">@{}</span>"#,
                    event_id, event_id
                )
            } else {
                // #PROJECT-ID — group 5
                let project_id = &caps[5];
                format!(
                    r#"<span class="gera-ref gera-ref--project" data-project="{}">#{}</span>"#,
                    project_id, project_id
                )
            }
        })
        .into_owned()
}

// ---------------------------------------------------------------------------
// comrak options (mirrors mistune plugins: task_lists, strikethrough, table)
// ---------------------------------------------------------------------------

fn markdown_to_html(body: &str) -> String {
    use comrak::{markdown_to_html, Options};

    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.render.escape = true;

    markdown_to_html(body, &options)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub struct RenderedDocument {
    pub html: String,
    pub title: String,
    pub frontmatter: std::collections::HashMap<String, serde_yaml::Value>,
    pub event_ids: Vec<String>,
    pub project_ids: Vec<String>,
}

pub fn render(content: &str) -> RenderedDocument {
    let (frontmatter, body) = parse_frontmatter(content);
    let title = extract_title(&body);
    let raw_html = markdown_to_html(&body);
    let html = replace_gera_refs(&raw_html);

    let event_ids = frontmatter_event_ids(&frontmatter);
    let project_ids = frontmatter_project_ids(&frontmatter);

    RenderedDocument {
        html,
        title,
        frontmatter,
        event_ids,
        project_ids,
    }
}

pub fn render_to_response(content: &str) -> RenderMarkdownResponse {
    let doc = render(content);

    // Convert frontmatter HashMap<String, serde_yaml::Value> to serde_json::Value
    let fm_json: serde_json::Map<String, serde_json::Value> = doc
        .frontmatter
        .into_iter()
        .filter_map(|(k, v)| {
            serde_json::to_value(v)
                .ok()
                .map(|jv| (k, jv))
        })
        .collect();

    RenderMarkdownResponse {
        html: doc.html,
        title: doc.title,
        frontmatter: serde_json::Value::Object(fm_json),
        event_ids: doc.event_ids,
        project_ids: doc.project_ids,
    }
}

/// Render a plain markdown body (no frontmatter) to HTML with Gera refs.
pub fn render_body(markdown_body: &str) -> String {
    let raw_html = markdown_to_html(markdown_body);
    replace_gera_refs(&raw_html)
}
