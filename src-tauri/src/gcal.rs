//! Google Calendar sync service.
//!
//! Ports Python's `service/google_calendar.py` to Rust using `reqwest`.
//! Deduplication strategy: match on source_platform + source_account + source_event_id;
//! update if etag differs, skip if same, create if new.

use chrono::{Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::models::{EventEntity, EventMetadata};
use crate::repository::Repository;
use crate::oauth::{GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET};

const GCAL_EVENTS_URL: &str =
    "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events";

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RefreshResponse {
    access_token: String,
    #[serde(default)]
    #[allow(dead_code)]
    expires_in: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    token_type: Option<String>,
}

/// Exchange a refresh token for a new access token.
pub async fn refresh_access_token(refresh_token: &str) -> Result<String, String> {
    let client = Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", GOOGLE_CLIENT_ID),
            ("client_secret", GOOGLE_CLIENT_SECRET),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed ({}): {}", status, body));
    }

    let data: RefreshResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    Ok(data.access_token)
}

// ---------------------------------------------------------------------------
// Fetch from Google Calendar API
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
struct GCalEventList {
    items: Vec<serde_json::Value>,
    #[serde(rename = "nextPageToken", default)]
    next_page_token: Option<String>,
}

async fn fetch_google_events(
    client: &Client,
    access_token: &str,
    _account_email: &str,
    calendar_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let now = Utc::now();
    let time_min = (now - Duration::days(30)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let time_max = (now + Duration::days(90)).format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let url = GCAL_EVENTS_URL.replace("{calendar_id}", calendar_id);
    let mut all_events: Vec<serde_json::Value> = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut params = vec![
            ("timeMin", time_min.clone()),
            ("timeMax", time_max.clone()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
            ("maxResults", "2500".to_string()),
        ];
        if let Some(ref pt) = page_token {
            params.push(("pageToken", pt.clone()));
        }

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .query(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Google Calendar events: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error {}: {}", status, body));
        }

        let data: GCalEventList = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse event list: {}", e))?;

        all_events.extend(data.items);
        match data.next_page_token {
            Some(pt) => page_token = Some(pt),
            None => break,
        }
    }

    Ok(all_events)
}

// ---------------------------------------------------------------------------
// Convert Google Calendar event → EventEntity
// ---------------------------------------------------------------------------

fn parse_gcal_datetime(value: Option<&str>) -> Option<String> {
    let s = value?;
    if s.is_empty() { return None; }
    // Try parsing as RFC3339
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc).format("%Y-%m-%dT%H:%M:%S").to_string());
    }
    // Date-only: "2026-03-08"
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let dt = d.and_hms_opt(0, 0, 0).unwrap();
        return Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string());
    }
    None
}

fn google_event_to_entity(
    gcal_event: &serde_json::Value,
    account_email: &str,
    calendar_id: &str,
) -> Option<EventEntity> {
    let start = gcal_event.get("start")?;
    let end = gcal_event.get("end")?;

    let from_str = start.get("dateTime").or_else(|| start.get("date"))?.as_str();
    let to_str = end.get("dateTime").or_else(|| end.get("date"))?.as_str();

    let from_ = parse_gcal_datetime(from_str)?;
    let to = parse_gcal_datetime(to_str)?;

    let source_event_id = gcal_event.get("id")?.as_str()?.to_string();
    let gera_id = source_event_id.clone();

    let participants: Vec<String> = gcal_event
        .get("attendees")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("email")?.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let now_str = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    let metadata = EventMetadata {
        source_platform: "google_calendar".to_string(),
        source_account: account_email.to_string(),
        source_event_id,
        source_calendar_id: calendar_id.to_string(),
        etag: gcal_event.get("etag").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        last_synced_at: Some(now_str),
        recurring_event_id: gcal_event
            .get("recurringEventId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        source_updated_at: gcal_event
            .get("updated")
            .and_then(|v| v.as_str())
            .and_then(|s| parse_gcal_datetime(Some(s))),
    };

    Some(EventEntity {
        id: gera_id,
        source: "google_calendar".to_string(),
        from_,
        to,
        name: gcal_event
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("(No title)")
            .to_string(),
        description: gcal_event
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        participants,
        location: gcal_event
            .get("location")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        metadata,
    })
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub created: i64,
    pub updated: i64,
    pub skipped: i64,
    pub stale: i64,
}

/// Fetch raw calendar events without touching the repository (no lock needed).
pub async fn fetch_events_for_sync(
    access_token: &str,
    account_email: &str,
    calendar_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let client = Client::new();
    fetch_google_events(&client, access_token, account_email, calendar_id).await
}

/// Apply pre-fetched raw events to the repository (sync, no awaits).
pub fn apply_events_to_repo(
    repo: &mut Repository,
    raw_events: Vec<serde_json::Value>,
    account_email: &str,
    calendar_id: &str,
) -> Result<SyncResult, String> {
    let fetched: Vec<EventEntity> = raw_events
        .iter()
        .filter_map(|raw| google_event_to_entity(raw, account_email, calendar_id))
        .collect();

    let (all_existing, _) = repo
        .list_events_page(Some(500), None, None, None)
        .map_err(|e| e.to_string())?;

    let mut existing_by_source_id: std::collections::HashMap<String, EventEntity> =
        std::collections::HashMap::new();
    for e in all_existing {
        if e.metadata.source_platform == "google_calendar"
            && e.metadata.source_account == account_email
            && e.metadata.source_calendar_id == calendar_id
        {
            existing_by_source_id.insert(e.metadata.source_event_id.clone(), e);
        }
    }

    let mut created = 0i64;
    let mut updated = 0i64;
    let mut skipped = 0i64;

    for event in &fetched {
        let source_id = &event.metadata.source_event_id;
        if let Some(old) = existing_by_source_id.remove(source_id) {
            if old.metadata.etag != event.metadata.etag {
                let updated_event = EventEntity { id: old.id.clone(), ..event.clone() };
                repo.update_event(&updated_event).map_err(|e| e.to_string())?;
                updated += 1;
            } else {
                skipped += 1;
            }
        } else {
            repo.create_event(event).map_err(|e| e.to_string())?;
            created += 1;
        }
    }

    let stale = existing_by_source_id.len() as i64;
    Ok(SyncResult { created, updated, skipped, stale })
}

pub async fn sync_google_events(
    repo: &mut Repository,
    access_token: &str,
    account_email: &str,
    calendar_id: &str,
) -> Result<SyncResult, String> {
    let client = Client::new();

    let raw_events =
        fetch_google_events(&client, access_token, account_email, calendar_id).await?;

    let fetched: Vec<EventEntity> = raw_events
        .iter()
        .filter_map(|raw| google_event_to_entity(raw, account_email, calendar_id))
        .collect();

    // Build a map of existing Google events from this account/calendar
    let (all_existing, _) = repo
        .list_events_page(Some(500), None, None, None)
        .map_err(|e| e.to_string())?;

    let mut existing_by_source_id: std::collections::HashMap<String, EventEntity> =
        std::collections::HashMap::new();
    for e in all_existing {
        if e.metadata.source_platform == "google_calendar"
            && e.metadata.source_account == account_email
            && e.metadata.source_calendar_id == calendar_id
        {
            existing_by_source_id.insert(e.metadata.source_event_id.clone(), e);
        }
    }

    let mut created = 0i64;
    let mut updated = 0i64;
    let mut skipped = 0i64;

    for event in &fetched {
        let source_id = &event.metadata.source_event_id;
        if let Some(old) = existing_by_source_id.remove(source_id) {
            if old.metadata.etag != event.metadata.etag {
                // ETag changed → update, preserving the existing Gera ID
                let updated_event = EventEntity {
                    id: old.id.clone(),
                    ..event.clone()
                };
                repo.update_event(&updated_event).map_err(|e| e.to_string())?;
                updated += 1;
            } else {
                skipped += 1;
            }
        } else {
            repo.create_event(event).map_err(|e| e.to_string())?;
            created += 1;
        }
    }

    let stale = existing_by_source_id.len() as i64;

    Ok(SyncResult {
        created,
        updated,
        skipped,
        stale,
    })
}
