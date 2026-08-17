//! GET /api/giphy — proxy Giphy search with NIP-98 auth.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};

use super::{api_error, internal_error};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct GiphyQuery {
    pub q: String,
}

#[derive(Serialize, Deserialize)]
pub struct GifResult {
    pub url: String,
    pub preview_url: String,
    pub title: String,
}

#[derive(Serialize)]
pub struct GiphyResponse {
    pub gifs: Vec<GifResult>,
}

pub async fn search_gifs(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<GiphyQuery>,
) -> Result<Json<GiphyResponse>, (StatusCode, Json<serde_json::Value>)> {
    // NIP-98 auth (same pattern as thread_summary.rs)
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "relay: no community configured"))?;

    let url = super::bridge::nip98_expected_url(&state.config.relay_url, &tenant, "/api/giphy");
    let (_, event_id_bytes) = super::bridge::verify_bridge_auth(
        &headers,
        "GET",
        &url,
        None,
        state.config.require_auth_token,
    )?;
    super::bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    let api_key = match state.config.giphy_api_key.as_deref() {
        Some(k) if !k.is_empty() => k,
        _ => return Ok(Json(GiphyResponse { gifs: vec![] })),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| internal_error(&e.to_string()))?;

    let query_string = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("api_key", api_key)
        .append_pair("q", &params.q)
        .append_pair("limit", "10")
        .finish();
    let giphy_url = format!("https://api.giphy.com/v1/gifs/search?{query_string}");

    let resp = client
        .get(&giphy_url)
        .send()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("Giphy unreachable: {e}")))?;

    if !resp.status().is_success() {
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            &format!("Giphy returned {}", resp.status()),
        ));
    }

    #[derive(Deserialize)]
    struct GiphyApiResp {
        data: Vec<GiphyApiGif>,
    }
    #[derive(Deserialize)]
    struct GiphyApiGif {
        title: String,
        images: GiphyImages,
    }
    #[derive(Deserialize)]
    struct GiphyImages {
        original: GiphyUrl,
        fixed_height_small: GiphyUrl,
    }
    #[derive(Deserialize)]
    struct GiphyUrl {
        url: String,
    }

    let body: GiphyApiResp = resp
        .json()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("Giphy parse error: {e}")))?;

    let gifs = body
        .data
        .into_iter()
        .map(|g| GifResult {
            url: g.images.original.url,
            preview_url: g.images.fixed_height_small.url,
            title: g.title,
        })
        .collect();

    Ok(Json(GiphyResponse { gifs }))
}
