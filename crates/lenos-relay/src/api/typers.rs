//! GET /api/channels/{channel_id}/typers — who is currently typing.

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

/// `GET /api/channels/{channel_id}/typers`
///
/// NIP-98 authenticated (any relay member).
/// Returns `{ "typers": ["<pubkey_hex>", ...] }`.
pub async fn get_typers(
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
        &format!("/api/channels/{channel_id}/typers"),
    );
    let (_pubkey, event_id_bytes) =
        bridge::verify_bridge_auth_with_options(&headers, "GET", &url, None, true, false)?;
    bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    let typers = state
        .pubsub
        .get_typers(&tenant, channel_id)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "redis error"))?;

    Ok(Json(serde_json::json!({ "typers": typers })))
}
