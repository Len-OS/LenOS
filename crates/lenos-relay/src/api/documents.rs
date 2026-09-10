//! Document upload, listing, search, and deletion routes.
//!
//! Routes:
//!   POST   /api/documents          — upload document (multipart, NIP-98 auth)
//!   GET    /api/documents          — list documents for community/channel
//!   GET    /api/documents/search   — semantic search over document chunks
//!   DELETE /api/documents/:id      — soft-delete (uploader only)

#![allow(missing_docs)]

use std::sync::Arc;

use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

use super::{api_error, internal_error};

const MAX_DOCUMENT_BYTES: usize = 52_428_800; // 50 MB
const ALLOWED_MIME_TYPES: &[&str] = &["text/plain", "text/markdown", "application/pdf"];
const DEFAULT_LIST_LIMIT: i64 = 50;
const DEFAULT_SEARCH_LIMIT: i64 = 5;

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct UploadResponse {
    document_id: String,
    status: &'static str,
}

#[derive(Serialize)]
pub struct DocumentResponse {
    id: String,
    channel_id: Option<String>,
    filename: String,
    mime_type: String,
    byte_size: i64,
    status: String,
    error: Option<String>,
    created_at: String,
}

#[derive(Serialize)]
pub struct SearchResponse {
    chunks: Vec<ChunkResponse>,
}

#[derive(Serialize)]
struct ChunkResponse {
    document_id: String,
    document_name: String,
    chunk_index: i32,
    content: String,
    score: f64,
}

// ── Query parameters ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListQuery {
    channel_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
    channel_id: Option<Uuid>,
    limit: Option<i64>,
}

// ── Shared auth helper ────────────────────────────────────────────────────────

async fn resolve_and_auth(
    state: &AppState,
    headers: &HeaderMap,
    method: &str,
    path: &str,
) -> Result<(lenos_core::TenantContext, nostr::PublicKey), (StatusCode, Json<serde_json::Value>)> {
    let raw_host = headers
        .get(header::HOST)
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

    let url = super::bridge::nip98_expected_url(&state.config.relay_url, &tenant, path);
    let (pubkey, event_id_bytes) = super::bridge::verify_bridge_auth(
        headers,
        method,
        &url,
        None,
        state.config.require_auth_token,
    )?;

    super::bridge::check_nip98_replay(state, &tenant, event_id_bytes).await?;

    Ok((tenant, pubkey))
}

// ── POST /api/documents ───────────────────────────────────────────────────────

pub async fn upload_document(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (StatusCode, Json<serde_json::Value>)> {
    let (tenant, pubkey) = resolve_and_auth(&state, &headers, "POST", "/api/documents").await?;

    let rag = state
        .rag
        .as_ref()
        .ok_or_else(|| api_error(StatusCode::SERVICE_UNAVAILABLE, "RAG not enabled"))?
        .clone();

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut filename = String::from("document");
    let mut mime_type = String::from("application/octet-stream");
    let mut channel_id: Option<Uuid> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("multipart error: {e}")))?
    {
        match field.name() {
            Some("file") => {
                if let Some(fname) = field.file_name() {
                    filename = fname.to_owned();
                }
                if let Some(ct) = field.content_type() {
                    mime_type = ct.to_owned();
                }
                let data = field.bytes().await.map_err(|e| {
                    api_error(StatusCode::BAD_REQUEST, &format!("file read error: {e}"))
                })?;
                if data.len() > MAX_DOCUMENT_BYTES {
                    return Err(api_error(
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "file exceeds 50 MB limit",
                    ));
                }
                file_bytes = Some(data.to_vec());
            }
            Some("channel_id") => {
                let text = field
                    .text()
                    .await
                    .map_err(|_| api_error(StatusCode::BAD_REQUEST, "invalid channel_id field"))?;
                channel_id = Uuid::parse_str(&text).ok();
            }
            _ => {}
        }
    }

    let bytes =
        file_bytes.ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "missing file field"))?;

    let effective_mime = infer_mime(&bytes, &mime_type);

    if !ALLOWED_MIME_TYPES.contains(&effective_mime.as_str()) {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            &format!("unsupported file type: {effective_mime}. Allowed: text/plain, text/markdown, application/pdf"),
        ));
    }

    let community_id = tenant.community();
    let pubkey_bytes = pubkey.to_bytes().to_vec();
    let filename_clone = filename.clone();
    let effective_mime_clone = effective_mime.clone();

    let doc_id = Uuid::new_v4();

    tokio::spawn(async move {
        if let Err(e) = rag
            .ingest_document(
                doc_id,
                community_id,
                channel_id,
                &pubkey_bytes,
                &filename_clone,
                &effective_mime_clone,
                bytes,
            )
            .await
        {
            tracing::warn!(doc = %doc_id, error = %e, "document ingest failed");
        }
    });

    Ok(Json(UploadResponse {
        document_id: doc_id.to_string(),
        status: "processing",
    }))
}

// ── GET /api/documents ────────────────────────────────────────────────────────

pub async fn list_documents(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<ListQuery>,
) -> Result<Json<Vec<DocumentResponse>>, (StatusCode, Json<serde_json::Value>)> {
    let (tenant, _pubkey) = resolve_and_auth(&state, &headers, "GET", "/api/documents").await?;

    let docs = state
        .db
        .list_documents(tenant.community(), params.channel_id, DEFAULT_LIST_LIMIT)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(
        docs.into_iter()
            .map(|d| DocumentResponse {
                id: d.id.to_string(),
                channel_id: d.channel_id.map(|c| c.to_string()),
                filename: d.filename,
                mime_type: d.mime_type,
                byte_size: d.byte_size,
                status: d.status,
                error: d.error,
                created_at: d.created_at.to_rfc3339(),
            })
            .collect(),
    ))
}

// ── GET /api/documents/search ─────────────────────────────────────────────────

pub async fn search_documents(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, (StatusCode, Json<serde_json::Value>)> {
    let (tenant, _pubkey) =
        resolve_and_auth(&state, &headers, "GET", "/api/documents/search").await?;

    let rag = state
        .rag
        .as_ref()
        .ok_or_else(|| api_error(StatusCode::SERVICE_UNAVAILABLE, "RAG not enabled"))?
        .clone();

    let limit = params.limit.unwrap_or(DEFAULT_SEARCH_LIMIT).min(20);

    let chunks = rag
        .search(tenant.community(), &params.q, limit, params.channel_id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(SearchResponse {
        chunks: chunks
            .into_iter()
            .map(|c| ChunkResponse {
                document_id: c.document_id.to_string(),
                document_name: c.document_name,
                chunk_index: c.chunk_index,
                content: c.content,
                score: c.score,
            })
            .collect(),
    }))
}

// ── DELETE /api/documents/:id ─────────────────────────────────────────────────

pub async fn delete_document(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let path = format!("/api/documents/{id}");
    let (tenant, pubkey) = resolve_and_auth(&state, &headers, "DELETE", &path).await?;

    let deleted = state
        .db
        .soft_delete_document(tenant.community(), id, &pubkey.to_bytes())
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(api_error(
            StatusCode::FORBIDDEN,
            "document not found or not owned by you",
        ))
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

fn infer_mime(bytes: &[u8], declared: &str) -> String {
    if (declared == "application/octet-stream" || declared.is_empty()) && bytes.starts_with(b"%PDF")
    {
        return "application/pdf".to_owned();
    }
    declared.to_owned()
}
