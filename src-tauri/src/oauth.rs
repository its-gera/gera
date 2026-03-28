/// Google OAuth 2.0 implementation with S256 PKCE.
///
/// Handles token acquisition, storage, refresh, and Tauri command registration.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use yoauth::{get_oauth_token, OAuthConfig};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TokenData {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub scope: Option<String>,
    pub account_email: Option<String>,
}

/// File-based token storage in the app's data directory
fn token_store_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    fs::create_dir_all(&data_dir).ok();
    data_dir.join("google_tokens.json")
}

pub fn save_tokens(app_handle: &tauri::AppHandle, tokens: &[TokenData]) {
    let path = token_store_path(app_handle);
    let json = serde_json::to_string_pretty(tokens).unwrap_or_default();
    let _ = fs::write(path, json);
}

pub fn load_tokens(app_handle: &tauri::AppHandle) -> Vec<TokenData> {
    let path = token_store_path(app_handle);
    if !path.exists() {
        return vec![];
    }
    let data = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

pub const GOOGLE_CLIENT_ID: &str =
    "690211739966-q4mp5lv90sh42fq0gsban3522k2gfkfp.apps.googleusercontent.com";
pub const GOOGLE_CLIENT_SECRET: &str = "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";

/// Run the Google OAuth flow with S256 PKCE
fn run_google_oauth() -> Result<TokenData, String> {
    let client_id = GOOGLE_CLIENT_ID;
    let client_secret = GOOGLE_CLIENT_SECRET;
    let config = OAuthConfig::new(
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        client_id,
    )
    .with_client_secret(client_secret)
    .with_scopes(vec![
        "https://www.googleapis.com/auth/calendar".to_string(), 
        "https://www.googleapis.com/auth/userinfo.email".to_string()
    ])
    .with_pkce_method(Some("S256".to_string()));

    let token = get_oauth_token(config).map_err(|e| format!("OAuth failed: {e}"))?;

    Ok(TokenData {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_type: token.token_type.unwrap_or_else(|| "Bearer".to_string()),
        expires_in: token.expires_in,
        scope: token.scope,
        account_email: None, // populated after userinfo call
    })
}

/// Fetch the account email from Google userinfo endpoint
pub async fn fetch_google_email(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch userinfo: {e}"))?;

    #[derive(Deserialize)]
    struct UserInfo {
        email: String,
    }

    let user_info: UserInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse userinfo: {e}"))?;

    Ok(user_info.email)
}

/// Refresh an expired Google OAuth token
#[allow(dead_code)]
pub async fn refresh_google_token(refresh_token: &str) -> Result<TokenData, String> {
    let client = reqwest::Client::new();

    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
        token_type: Option<String>,
        expires_in: Option<u64>,
        scope: Option<String>,
    }

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", GOOGLE_CLIENT_ID),
            ("client_secret", GOOGLE_CLIENT_SECRET),
        ])
        .send()
        .await
        .map_err(|e| format!("Refresh token request failed: {e}"))?;

    let refresh_data: RefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    Ok(TokenData {
        access_token: refresh_data.access_token,
        refresh_token: Some(refresh_token.to_string()),
        token_type: refresh_data
            .token_type
            .unwrap_or_else(|| "Bearer".to_string()),
        expires_in: refresh_data.expires_in,
        scope: refresh_data.scope,
        account_email: None,
    })
}

// Tauri commands

#[tauri::command(rename_all = "snake_case")]
pub async fn authenticate_google_cmd(app_handle: tauri::AppHandle) -> Result<TokenData, String> {
    // Run OAuth in a blocking thread (yoauth spawns local HTTP server)
    let token = tokio::task::spawn_blocking(run_google_oauth)
        .await
        .map_err(|e| format!("Task failed: {e}"))??;

    // Fetch account email via Google userinfo
    let mut token = token;
    token.account_email = fetch_google_email(&token.access_token).await.ok();

    // Persist tokens
    let mut tokens = load_tokens(&app_handle);
    if let Some(ref email) = token.account_email {
        tokens.retain(|t| t.account_email.as_deref() != Some(email));
    }
    tokens.push(token.clone());
    save_tokens(&app_handle, &tokens);

    Ok(token)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_google_accounts_cmd(app_handle: tauri::AppHandle) -> Vec<TokenData> {
    load_tokens(&app_handle)
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_google_account_cmd(
    app_handle: tauri::AppHandle,
    email: String,
) -> Result<(), String> {
    let mut tokens = load_tokens(&app_handle);
    tokens.retain(|t| t.account_email.as_deref() != Some(&email));
    save_tokens(&app_handle, &tokens);
    Ok(())
}
