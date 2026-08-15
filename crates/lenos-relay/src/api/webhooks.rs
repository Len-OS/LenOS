//! Outgoing webhooks — community admins register HTTP endpoints that receive
//! a POST on each ingested Nostr event (filtered by kind / channel).
//!
//! # Auth
//! All management endpoints (list/create/delete) require NIP-98 auth from an
//! owner or admin of the community.
//!
//! # Delivery
//! `dispatch_webhooks` is called fire-and-forget after successful event storage.
//! Each matching webhook receives a JSON-encoded Nostr event with an
//! `X-LenOS-Signature` header containing an HMAC-SHA256 of the body.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

use lenos_core::TenantContext;
use nostr::Event;

use crate::state::AppState;

use super::{api_error, internal_error};
use super::bridge::{check_nip98_replay, nip98_expected_url, verify_bridge_auth};

// ── Row types ──────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize, serde::Serialize, sqlx::FromRow)]
pub struct OutgoingWebhook {
    pub id: uuid::Uuid,
    pub community_id: uuid::Uuid,
    pub url: String,
    pub event_filter: serde_json::Value,
    pub secret: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct CreateWebhookRequest {
    pub url: String,
    pub event_filter: Option<serde_json::Value>,
}

// ── Admin check ────────────────────────────────────────────────────────────────

async fn require_admin(
    db: &sqlx::PgPool,
    community_id: uuid::Uuid,
    pubkey: &[u8],
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let role: Option<String> = sqlx::query_scalar(
        "SELECT role FROM relay_members WHERE community_id = $1 AND pubkey = $2",
    )
    .bind(community_id)
    .bind(pubkey)
    .fetch_optional(db)
    .await
    .map_err(|e| internal_error(&format!("db error checking admin: {e}")))?;

    match role.as_deref() {
        Some("owner") | Some("admin") => Ok(()),
        _ => Err(api_error(StatusCode::FORBIDDEN, "admin required")),
    }
}

// ── Shared auth prelude ────────────────────────────────────────────────────────

async fn auth_prelude(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    method: &str,
    path: &str,
) -> Result<(TenantContext, Vec<u8>), (StatusCode, Json<serde_json::Value>)> {
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| {
            api_error(
                StatusCode::NOT_FOUND,
                "relay: no community is configured for this host",
            )
        })?;

    let url = nip98_expected_url(&state.config.relay_url, &tenant, path);
    let (pubkey, event_id_bytes) =
        verify_bridge_auth(headers, method, &url, None, state.config.require_auth_token)?;
    check_nip98_replay(state, &tenant, event_id_bytes).await?;

    let pubkey_bytes = pubkey.to_bytes().to_vec();
    Ok((tenant, pubkey_bytes))
}

// ── Handlers ───────────────────────────────────────────────────────────────────

/// `GET /api/webhooks` — list all webhooks for this community (admin only).
pub async fn list_webhooks(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let (tenant, pubkey_bytes) =
        auth_prelude(&state, &headers, "GET", "/api/webhooks").await?;

    require_admin(state.db.pool(), *tenant.community().as_uuid(), &pubkey_bytes).await?;

    let rows: Vec<OutgoingWebhook> = sqlx::query_as(
        "SELECT id, community_id, url, event_filter, secret, created_at \
         FROM outgoing_webhooks WHERE community_id = $1 ORDER BY created_at ASC",
    )
    .bind(*tenant.community().as_uuid())
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| internal_error(&format!("db error listing webhooks: {e}")))?;

    Ok(Json(serde_json::to_value(rows).unwrap_or(serde_json::json!([]))))
}

/// `POST /api/webhooks` — create a webhook (admin only).
pub async fn create_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let (tenant, pubkey_bytes) =
        auth_prelude(&state, &headers, "POST", "/api/webhooks").await?;

    require_admin(state.db.pool(), *tenant.community().as_uuid(), &pubkey_bytes).await?;

    let req: CreateWebhookRequest = serde_json::from_slice(&body)
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("invalid JSON: {e}")))?;

    // Validate URL
    if req.url.is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "url must not be empty"));
    }
    if !req.url.starts_with("https://") && !req.url.starts_with("http://") {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "url must start with http:// or https://",
        ));
    }

    let event_filter = req.event_filter.unwrap_or(serde_json::json!({}));
    // Generate a UUID-based secret
    let secret = uuid::Uuid::new_v4().to_string();

    let row: OutgoingWebhook = sqlx::query_as(
        "INSERT INTO outgoing_webhooks (community_id, url, event_filter, secret) \
         VALUES ($1, $2, $3, $4) \
         RETURNING id, community_id, url, event_filter, secret, created_at",
    )
    .bind(*tenant.community().as_uuid())
    .bind(&req.url)
    .bind(&event_filter)
    .bind(&secret)
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| internal_error(&format!("db error creating webhook: {e}")))?;

    Ok(Json(
        serde_json::to_value(row).unwrap_or(serde_json::json!({})),
    ))
}

/// `DELETE /api/webhooks/:id` — delete a webhook (admin only).
pub async fn delete_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id_str): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let id = uuid::Uuid::parse_str(&id_str)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "invalid webhook UUID"))?;

    let path = format!("/api/webhooks/{id_str}");
    let (tenant, pubkey_bytes) =
        auth_prelude(&state, &headers, "DELETE", &path).await?;

    require_admin(state.db.pool(), *tenant.community().as_uuid(), &pubkey_bytes).await?;

    let deleted = sqlx::query_scalar::<_, bool>(
        "WITH del AS (DELETE FROM outgoing_webhooks WHERE id = $1 AND community_id = $2 RETURNING id) \
         SELECT count(*) > 0 FROM del",
    )
    .bind(id)
    .bind(*tenant.community().as_uuid())
    .fetch_one(state.db.pool())
    .await
    .map_err(|e| internal_error(&format!("db error deleting webhook: {e}")))?;

    if !deleted {
        return Err(api_error(StatusCode::NOT_FOUND, "webhook not found"));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ── Dispatch ───────────────────────────────────────────────────────────────────

/// Returns true if `event` passes the webhook's event_filter.
///
/// Filter shape:
/// - `{}` (empty) — matches all events
/// - `{"kinds": [40002, 7]}` — matches only the listed kinds
/// - `{"channel_ids": ["uuid1"]}` — matches only events in those channels
/// - Both keys may be combined; both must match.
fn event_matches_filter(filter: &serde_json::Value, event: &Event, channel_id: Option<uuid::Uuid>) -> bool {
    if let Some(kinds) = filter.get("kinds").and_then(|v| v.as_array()) {
        let event_kind = event.kind.as_u16() as u64;
        let kind_match = kinds.iter().any(|k| k.as_u64() == Some(event_kind));
        if !kind_match {
            return false;
        }
    }

    if let Some(channel_ids) = filter.get("channel_ids").and_then(|v| v.as_array()) {
        let ch_str = channel_id.map(|id| id.to_string());
        let ch_match = channel_ids.iter().any(|c| {
            c.as_str()
                .map(|s| Some(s.to_owned()) == ch_str)
                .unwrap_or(false)
        });
        if !ch_match {
            return false;
        }
    }

    true
}

/// Compute HMAC-SHA256 of `body` using `secret` and return the hex digest.
fn hmac_sha256_hex(secret: &str, body: &[u8]) -> String {
    let mut mac = <Hmac<Sha256>>::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

/// Fire-and-forget webhook dispatch. Called after successful event storage.
///
/// Skips ephemeral/internal kinds that webhook consumers don't need:
/// kind 0 (profile), kind 2 (recommend relay), kind 10002 (relay list metadata).
pub async fn dispatch_webhooks(
    state: &Arc<AppState>,
    community_id: uuid::Uuid,
    event: &Event,
    channel_id: Option<uuid::Uuid>,
) {
    let kind_u32 = event.kind.as_u16() as u32;
    // Skip profile, recommend-relay, and relay list metadata — not useful for webhooks
    if kind_u32 == 0 || kind_u32 == 2 || kind_u32 == 10002 {
        return;
    }

    // Query all webhooks for this community
    let hooks: Vec<OutgoingWebhook> = match sqlx::query_as(
        "SELECT id, community_id, url, event_filter, secret, created_at \
         FROM outgoing_webhooks WHERE community_id = $1",
    )
    .bind(community_id)
    .fetch_all(state.db.pool())
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::warn!(community = %community_id, error = %e, "dispatch_webhooks: db error");
            return;
        }
    };

    if hooks.is_empty() {
        return;
    }

    let body_bytes = match serde_json::to_vec(event) {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(error = %e, "dispatch_webhooks: failed to serialize event");
            return;
        }
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    for hook in hooks {
        if !event_matches_filter(&hook.event_filter, event, channel_id) {
            continue;
        }

        let signature = hmac_sha256_hex(&hook.secret, &body_bytes);
        let url = hook.url.clone();
        let body = body_bytes.clone();
        let client = client.clone();

        tokio::spawn(async move {
            let result = client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("X-LenOS-Signature", &signature)
                .body(body)
                .send()
                .await;

            match result {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        tracing::warn!(
                            webhook_url = %url,
                            status = resp.status().as_u16(),
                            "dispatch_webhooks: non-2xx response"
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!(webhook_url = %url, error = %e, "dispatch_webhooks: delivery failed");
                }
            }
        });
    }
}
