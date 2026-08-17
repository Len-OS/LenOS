//! POST /api/thread-summary — forward thread messages to LenGrowth AI summarizer.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};

use super::{api_error, internal_error};
use crate::state::AppState;

#[derive(Deserialize, Serialize)]
pub struct ThreadMessage {
    pub pubkey: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Deserialize)]
pub struct SummarizeRequest {
    pub messages: Vec<ThreadMessage>,
}

#[derive(Deserialize, Serialize)]
pub struct SummarizeResponse {
    pub summary: String,
}

pub async fn summarize_thread(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SummarizeRequest>,
) -> Result<Json<SummarizeResponse>, (StatusCode, Json<serde_json::Value>)> {
    // NIP-98 auth (same pattern as documents.rs)
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "relay: no community configured"))?;

    let url =
        super::bridge::nip98_expected_url(&state.config.relay_url, &tenant, "/api/thread-summary");
    let (_, event_id_bytes) = super::bridge::verify_bridge_auth(
        &headers,
        "POST",
        &url,
        None,
        state.config.require_auth_token,
    )?;
    super::bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    // Require LENGROWTH_API_URL
    let base_url = state.config.lengrowth_api_url.as_deref().ok_or_else(|| {
        api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "AI summarization not configured",
        )
    })?;

    if body.messages.is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "messages array is empty",
        ));
    }

    // Forward to LenGrowth
    let upstream_url = format!("{}/api/ai/summarize", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| internal_error(&e.to_string()))?;

    let upstream_body = serde_json::json!({ "messages": body.messages });

    let resp = client
        .post(&upstream_url)
        .json(&upstream_body)
        .send()
        .await
        .map_err(|e| {
            api_error(
                StatusCode::BAD_GATEWAY,
                &format!("LenGrowth unreachable: {e}"),
            )
        })?;

    if !resp.status().is_success() {
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            &format!("LenGrowth returned {}", resp.status()),
        ));
    }

    let result: SummarizeResponse = resp.json().await.map_err(|e| {
        api_error(
            StatusCode::BAD_GATEWAY,
            &format!("invalid LenGrowth response: {e}"),
        )
    })?;

    Ok(Json(result))
}
