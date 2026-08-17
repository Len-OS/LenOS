//! Data export (GDPR / portability) — `GET /api/export`
//!
//! Returns all Nostr events authored by the requesting user (or, for admins,
//! any community member) as a JSON file download.
//!
//! # Auth
//! NIP-98 HTTP auth required. Exporting another user's data additionally
//! requires an owner or admin role.
//!
//! # Limits
//! At most 100,000 events are returned to cap response size.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
};

use crate::state::AppState;

use super::bridge::{check_nip98_replay, nip98_expected_url, verify_bridge_auth};
use super::{api_error, internal_error};

const MAX_EXPORT_ROWS: i64 = 100_000;

#[derive(serde::Deserialize)]
pub struct ExportQuery {
    /// Hex-encoded public key to export. If omitted, defaults to the
    /// authenticated caller's own public key.
    pub pubkey: Option<String>,
}

// ── Row type ───────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct EventRow {
    id: Vec<u8>,
    pubkey: Vec<u8>,
    created_at: chrono::DateTime<chrono::Utc>,
    kind: i32,
    tags: serde_json::Value,
    content: String,
    sig: Vec<u8>,
}

// ── Handler ────────────────────────────────────────────────────────────────────

/// `GET /api/export[?pubkey=<hex>]`
///
/// Returns a JSON array of Nostr events for the target public key, as an
/// attachment download.
pub async fn export_user_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<ExportQuery>,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // Reconstruct the expected NIP-98 URL including query string.
    let path = match &query.pubkey {
        Some(pk) => format!("/api/export?pubkey={pk}"),
        None => "/api/export".to_string(),
    };

    // Host → community binding
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

    // NIP-98 auth
    let url = nip98_expected_url(&state.config.relay_url, &tenant, &path);
    let (caller_pubkey, event_id_bytes) =
        verify_bridge_auth(&headers, "GET", &url, None, state.config.require_auth_token)?;
    check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    let caller_bytes = caller_pubkey.to_bytes().to_vec();

    // Resolve the target pubkey
    let target_bytes: Vec<u8> = match &query.pubkey {
        None => caller_bytes.clone(),
        Some(hex_pk) => {
            let bytes = hex::decode(hex_pk)
                .map_err(|_| api_error(StatusCode::BAD_REQUEST, "invalid pubkey hex"))?;
            if bytes.len() != 32 {
                return Err(api_error(
                    StatusCode::BAD_REQUEST,
                    "pubkey must be 32 bytes",
                ));
            }
            bytes
        }
    };

    // If exporting for someone else, require admin role
    if target_bytes != caller_bytes {
        let role: Option<String> = sqlx::query_scalar(
            "SELECT role FROM relay_members WHERE community_id = $1 AND pubkey = $2",
        )
        .bind(*tenant.community().as_uuid())
        .bind(&caller_bytes)
        .fetch_optional(state.db.pool())
        .await
        .map_err(|e| internal_error(&format!("db error checking admin for export: {e}")))?;

        match role.as_deref() {
            Some("owner") | Some("admin") => {}
            _ => {
                return Err(api_error(
                    StatusCode::FORBIDDEN,
                    "admin role required to export another user's data",
                ));
            }
        }
    }

    // Query events
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT id, pubkey, created_at, kind, tags, content, sig \
         FROM events \
         WHERE community_id = $1 AND pubkey = $2 AND deleted_at IS NULL \
         ORDER BY created_at DESC \
         LIMIT $3",
    )
    .bind(*tenant.community().as_uuid())
    .bind(&target_bytes)
    .bind(MAX_EXPORT_ROWS)
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| internal_error(&format!("db error fetching events for export: {e}")))?;

    // Serialize as Nostr-compatible event objects
    let events: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "id":         hex::encode(&row.id),
                "pubkey":     hex::encode(&row.pubkey),
                "created_at": row.created_at.timestamp(),
                "kind":       row.kind,
                "tags":       row.tags,
                "content":    row.content,
                "sig":        hex::encode(&row.sig),
            })
        })
        .collect();

    let payload = serde_json::json!({
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "pubkey": hex::encode(&target_bytes),
        "community": tenant.community().to_string(),
        "events": events,
    });

    let body = serde_json::to_vec(&payload)
        .map_err(|e| internal_error(&format!("json serialization failed: {e}")))?;

    let filename = format!("export-{}.json", hex::encode(&target_bytes));

    Ok((
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/json"
                    .parse::<axum::http::HeaderValue>()
                    .unwrap(),
            ),
            (
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\"")
                    .parse::<axum::http::HeaderValue>()
                    .unwrap(),
            ),
        ],
        body,
    )
        .into_response())
}
