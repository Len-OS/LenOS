//! Encrypted agent credential HTTP API.
//!
//! Routes:
//!   GET  /api/relay/pubkey                          — no auth; returns relay hex pubkey
//!   PUT  /api/agent-credentials                     — NIP-98; upserts NIP-44 ciphertext
//!   GET  /api/agent-credentials/{d_tag}             — NIP-98; returns caller's ciphertext
//!   GET  /api/agent-credentials/{d_tag}/resolve     — NIP-98; decrypts and returns plaintext env vars
//!   DELETE /api/agent-credentials/{d_tag}           — NIP-98; deletes caller's record

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

use super::{api_error, bridge, internal_error};

/// `GET /api/relay/pubkey` — public endpoint, no auth required.
///
/// Returns the relay's Nostr hex pubkey so the client can encrypt to it.
pub async fn relay_pubkey(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({ "pubkey": state.relay_keypair.public_key().to_hex() }))
}

#[derive(Deserialize)]
pub struct UpsertBody {
    pub agent_d_tag: String,
    pub ciphertext: String,
}

/// `PUT /api/agent-credentials` — NIP-98 auth.
///
/// Upserts NIP-44 v2 ciphertext for the caller's (community, agent_d_tag).
pub async fn upsert(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let (tenant, pubkey) =
        authenticate_method(&state, &headers, "PUT", "/api/agent-credentials", &body).await?;

    let req: UpsertBody = serde_json::from_slice(&body)
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("invalid JSON: {e}")))?;

    if req.agent_d_tag.is_empty() || req.agent_d_tag.len() > 255 || req.agent_d_tag.contains('\0') {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "agent_d_tag must be 1-255 chars with no null bytes",
        ));
    }
    if req.ciphertext.is_empty() || req.ciphertext.len() > 65536 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "ciphertext must be 1-65536 bytes",
        ));
    }

    let owner_pubkey = pubkey.to_hex();
    let record = state
        .db
        .upsert_agent_credentials(
            tenant.community(),
            &owner_pubkey,
            &req.agent_d_tag,
            &req.ciphertext,
        )
        .await
        .map_err(|e| internal_error(&format!("upsert agent credentials: {e}")))?;

    Ok(Json(json!({ "id": record.id })))
}

/// `GET /api/agent-credentials/{agent_d_tag}` — NIP-98 auth.
///
/// Returns the caller's credential record. The NIP-98 pubkey must match
/// `owner_pubkey` on the stored record — a user never retrieves another's
/// ciphertext.
pub async fn get_creds(
    State(state): State<Arc<AppState>>,
    Path(agent_d_tag): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let path = format!("/api/agent-credentials/{agent_d_tag}");
    let (tenant, pubkey) = authenticate_method(&state, &headers, "GET", &path, &[]).await?;

    let owner_pubkey = pubkey.to_hex();
    let record = state
        .db
        .get_agent_credentials(tenant.community(), &owner_pubkey, &agent_d_tag)
        .await
        .map_err(|e| internal_error(&format!("get agent credentials: {e}")))?
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "credential not found"))?;

    // Owner check: should always be satisfied because we query by owner_pubkey,
    // but we assert it explicitly as a defence-in-depth guard.
    if record.owner_pubkey != owner_pubkey {
        return Err(api_error(StatusCode::FORBIDDEN, "forbidden"));
    }

    Ok(Json(json!({
        "id": record.id,
        "agent_d_tag": record.agent_d_tag,
        "ciphertext": record.ciphertext,
    })))
}

/// `GET /api/agent-credentials/{agent_d_tag}/resolve` — NIP-98 auth.
///
/// Decrypts the stored NIP-44 ciphertext using the relay's private key and
/// returns the plaintext env-var map. Used by agent runners (e.g. lenos-acp)
/// at spawn time to inject provider credentials into the agent process.
///
/// The decrypted payload is never written to any log.
pub async fn resolve_creds(
    State(state): State<Arc<AppState>>,
    Path(agent_d_tag): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let path = format!("/api/agent-credentials/{agent_d_tag}/resolve");
    let (tenant, pubkey) = authenticate_method(&state, &headers, "GET", &path, &[]).await?;

    let owner_pubkey = pubkey.to_hex();
    let record = state
        .db
        .get_agent_credentials(tenant.community(), &owner_pubkey, &agent_d_tag)
        .await
        .map_err(|e| internal_error(&format!("get agent credentials: {e}")))?
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "credential not found"))?;

    if record.owner_pubkey != owner_pubkey {
        return Err(api_error(StatusCode::FORBIDDEN, "forbidden"));
    }

    let owner_pk = nostr::PublicKey::from_hex(&record.owner_pubkey)
        .map_err(|_| internal_error("invalid owner_pubkey in DB record"))?;

    let plaintext = nostr::nips::nip44::decrypt(
        state.relay_keypair.secret_key(),
        &owner_pk,
        &record.ciphertext,
    )
    .map_err(|_| {
        tracing::warn!(
            agent_d_tag = %agent_d_tag,
            "resolve_creds: NIP-44 decrypt failed — ciphertext may be corrupt or re-keyed"
        );
        api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "credential decryption failed",
        )
    })?;

    let env_vars: serde_json::Map<String, Value> =
        serde_json::from_str(&plaintext).map_err(|_| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "credential payload is not valid JSON",
            )
        })?;

    Ok(Json(json!({ "env": env_vars })))
}

/// `DELETE /api/agent-credentials/{agent_d_tag}` — NIP-98 auth.
pub async fn delete_creds(
    State(state): State<Arc<AppState>>,
    Path(agent_d_tag): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let path = format!("/api/agent-credentials/{agent_d_tag}");
    let (tenant, pubkey) = authenticate_method(&state, &headers, "DELETE", &path, &[]).await?;

    let owner_pubkey = pubkey.to_hex();
    state
        .db
        .delete_agent_credentials(tenant.community(), &owner_pubkey, &agent_d_tag)
        .await
        .map_err(|e| internal_error(&format!("delete agent credentials: {e}")))?;

    Ok(Json(json!({ "deleted": true })))
}

/// Bind tenant from Host header, verify NIP-98 signature, check replay.
async fn authenticate_method(
    state: &Arc<AppState>,
    headers: &HeaderMap,
    method: &str,
    path: &str,
    body: &[u8],
) -> Result<(lenos_core::TenantContext, nostr::PublicKey), (StatusCode, Json<Value>)> {
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

    let url = bridge::nip98_expected_url(&state.config.relay_url, &tenant, path);
    let body_opt = if body.is_empty() { None } else { Some(body) };
    let (pubkey, event_id_bytes) =
        bridge::verify_bridge_auth(headers, method, &url, body_opt, true)?;
    bridge::check_nip98_replay(state, &tenant, event_id_bytes).await?;

    Ok((tenant, pubkey))
}
