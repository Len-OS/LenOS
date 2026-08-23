//! GET /api/huddle/{channel_id}/recordings — list recordings for a huddle channel.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::Value;
use uuid::Uuid;

use crate::state::AppState;

use super::{api_error, bridge};

/// `GET /api/huddle/{channel_id}/recordings`
///
/// NIP-98 authenticated (any relay member).
/// Returns `{ "recordings": [{ "key": "...", "url": "..." }, ...] }`.
pub async fn list_recordings(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "no community for this host"))?;

    let url = bridge::nip98_expected_url(
        &state.config.relay_url,
        &tenant,
        &format!("/api/huddle/{channel_id}/recordings"),
    );
    let (_pubkey, event_id_bytes) =
        bridge::verify_bridge_auth_with_options(&headers, "GET", &url, None, true, false)?;
    bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    let prefix = format!("huddles/{}/{}/", tenant.community(), channel_id);
    let keys = state
        .media_storage
        .list_prefix(&prefix, 200)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "storage error"))?;

    let relay_http = state
        .config
        .relay_url
        .replace("wss://", "https://")
        .replace("ws://", "http://");
    let base = relay_http.trim_end_matches('/').to_owned();

    let recordings: Vec<Value> = keys
        .into_iter()
        .filter_map(|key| {
            let filename = key.rsplit('/').next()?.to_owned();
            let url = format!("{}/api/huddle/{}/recordings/{}", base, channel_id, filename);
            Some(serde_json::json!({ "key": key, "url": url }))
        })
        .collect();

    Ok(Json(serde_json::json!({ "recordings": recordings })))
}
