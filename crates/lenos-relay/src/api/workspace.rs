//! Workspace self-service admin endpoints.
//!
//! PATCH /api/admin/v1/workspace/subdomain — owner-only subdomain rename.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use lenos_db::UpdateSlugOutcome;

use crate::state::AppState;

// api_error and bridge are defined in the parent api module, same as invites.rs.
use super::{api_error, bridge};

const RESERVED_SLUGS: &[&str] = &[
    "www",
    "app",
    "relay",
    "api",
    "growth-api",
    "lenos",
    "mail",
    "smtp",
];

fn validate_slug(slug: &str) -> bool {
    let re = regex::Regex::new(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{3,63}$")
        .expect("static regex");
    re.is_match(slug) && slug.len() >= 3 && slug.len() <= 63 && !RESERVED_SLUGS.contains(&slug)
}

#[derive(Debug, Deserialize)]
pub struct PatchSubdomainRequest {
    slug: String,
}

/// `PATCH /api/admin/v1/workspace/subdomain`
///
/// NIP-98 authenticated. Caller must hold the `owner` role.
pub async fn patch_subdomain(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    // Bind tenant + verify NIP-98 signature.
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
        "/api/admin/v1/workspace/subdomain",
    );
    let (pubkey, event_id_bytes) =
        bridge::verify_bridge_auth_with_options(&headers, "PATCH", &url, Some(&body), true, true)?;
    bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    // Owner-only check.
    let pubkey_hex = pubkey.to_hex();
    let member = state
        .db
        .get_relay_member(tenant.community(), &pubkey_hex)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "db error"))?;
    match member.as_ref().map(|m| m.role.as_str()) {
        Some("owner") => {}
        _ => {
            return Err(api_error(
                StatusCode::FORBIDDEN,
                "only the workspace owner can change the subdomain",
            ))
        }
    }

    // Parse and validate slug.
    let req: PatchSubdomainRequest = serde_json::from_slice(&body)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "invalid request body"))?;
    if !validate_slug(&req.slug) {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "slug must be 3\u{2013}63 chars: letters, numbers, hyphens; no reserved names",
        ));
    }

    // Perform update.
    let current_host = raw_host.to_string();
    match state
        .db
        .update_community_slug(tenant.community(), &current_host, &req.slug)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "db error"))?
    {
        UpdateSlugOutcome::Updated { .. } => Ok(StatusCode::OK),
        UpdateSlugOutcome::Conflict => {
            Err(api_error(StatusCode::CONFLICT, "subdomain already taken"))
        }
        UpdateSlugOutcome::NotFound => Err(api_error(StatusCode::NOT_FOUND, "community not found")),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_slug;

    #[test]
    fn valid_slugs_pass() {
        assert!(validate_slug("acme"));
        assert!(validate_slug("my-workspace"));
        assert!(validate_slug("abc"));
        assert!(validate_slug(&"a".repeat(63)));
    }

    #[test]
    fn too_short_slugs_fail() {
        assert!(!validate_slug("ab"));
        assert!(!validate_slug("a"));
        assert!(!validate_slug(""));
    }

    #[test]
    fn too_long_slugs_fail() {
        assert!(!validate_slug(&"a".repeat(64)));
    }

    #[test]
    fn reserved_slugs_fail() {
        for reserved in [
            "www",
            "app",
            "relay",
            "api",
            "growth-api",
            "lenos",
            "mail",
            "smtp",
        ] {
            assert!(
                !validate_slug(reserved),
                "reserved slug should fail: {reserved}"
            );
        }
    }

    #[test]
    fn uppercase_fails() {
        assert!(!validate_slug("MyWorkspace"));
    }

    #[test]
    fn hyphens_allowed_in_middle() {
        assert!(validate_slug("my-workspace-2024"));
    }
}
