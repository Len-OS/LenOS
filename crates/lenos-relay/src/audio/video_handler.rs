//! WebSocket video relay: NIP-42 auth → membership → present/receive → cleanup.

use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Path, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use axum::extract::ws::{Message as WsMessage, WebSocket};
use bytes::Bytes;
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};
use uuid::Uuid;

use lenos_auth::generate_challenge;
use lenos_core::tenant::TenantContext;
use lenos_core::CommunityId;

use crate::audio::wire::VIDEO_HEADER_LEN;
use crate::state::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_VIDEO_FRAME_BYTES: usize = 65_536; // 64 KB max fragment
const MAX_TEXT_FRAME_BYTES: usize = 8_192;
const BROADCAST_CAPACITY: usize = 16;

// ── VideoRoom ─────────────────────────────────────────────────────────────────

/// Per-channel video relay room. Holds the frame broadcast channel and
/// per-peer control senders.
pub struct VideoRoom {
    /// Broadcast channel for video frames from the presenter.
    pub(crate) frame_tx: broadcast::Sender<Bytes>,
    /// Per-peer control channel: peer_id → JSON sender.
    ctrl_peers: DashMap<Uuid, mpsc::Sender<String>>,
    /// Current presenter: (peer_id, pubkey_hex). None when no one is sharing.
    presenter: Mutex<Option<(Uuid, String)>>,
}

impl VideoRoom {
    fn new() -> Self {
        let (frame_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            frame_tx,
            ctrl_peers: DashMap::new(),
            presenter: Mutex::new(None),
        }
    }

    fn subscribe_frames(&self) -> broadcast::Receiver<Bytes> {
        self.frame_tx.subscribe()
    }

    fn add_ctrl_peer(&self, peer_id: Uuid, tx: mpsc::Sender<String>) {
        self.ctrl_peers.insert(peer_id, tx);
    }

    fn remove_ctrl_peer(&self, peer_id: Uuid) {
        self.ctrl_peers.remove(&peer_id);
    }

    fn broadcast_ctrl(&self, msg: &str) {
        for entry in self.ctrl_peers.iter() {
            let _ = entry.value().try_send(msg.to_string());
        }
    }

    fn send_ctrl_to(&self, peer_id: Uuid, msg: String) {
        if let Some(tx) = self.ctrl_peers.get(&peer_id) {
            let _ = tx.try_send(msg);
        }
    }

    fn peer_count(&self) -> usize {
        self.ctrl_peers.len()
    }
}

// ── VideoRoomManager ──────────────────────────────────────────────────────────

/// Process-local registry of all active huddle video rooms, keyed by
/// `(CommunityId, channel_id)`. Rooms are lazily created on first peer
/// join and removed when the last peer leaves.
pub struct VideoRoomManager {
    rooms: DashMap<(CommunityId, Uuid), Arc<VideoRoom>>,
}

impl Default for VideoRoomManager {
    fn default() -> Self {
        Self::new()
    }
}

impl VideoRoomManager {
    /// Create an empty manager with no rooms.
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
        }
    }

    /// Return the existing room for `(community, channel_id)` or create a new one.
    pub fn get_or_create(&self, community: CommunityId, channel_id: Uuid) -> Arc<VideoRoom> {
        self.rooms
            .entry((community, channel_id))
            .or_insert_with(|| Arc::new(VideoRoom::new()))
            .clone()
    }

    /// Remove the room for `(community, channel_id)` if it has no remaining peers.
    pub fn cleanup_if_empty(&self, community: CommunityId, channel_id: Uuid) {
        self.rooms
            .remove_if(&(community, channel_id), |_, room| room.peer_count() == 0);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// WebSocket upgrade handler for `/huddle/:channel_id/video`.
pub async fn ws_video_handler(
    State(state): State<Arc<AppState>>,
    Path(channel_id): Path<Uuid>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let tenant = match crate::tenant::bind_community(&state.db, raw_host).await {
        Ok(ctx) => ctx,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                "relay: no community is configured for this host",
            )
                .into_response();
        }
    };
    ws.max_message_size(MAX_VIDEO_FRAME_BYTES + MAX_TEXT_FRAME_BYTES)
        .max_frame_size(MAX_VIDEO_FRAME_BYTES + MAX_TEXT_FRAME_BYTES)
        .on_upgrade(move |socket| handle_video_connection(socket, state, tenant, channel_id))
}

async fn handle_video_connection(
    socket: WebSocket,
    state: Arc<AppState>,
    tenant: TenantContext,
    channel_id: Uuid,
) {
    let cancel = CancellationToken::new();
    let (mut ws_send, mut ws_recv) = socket.split();

    // ── NIP-42 challenge ─────────────────────────────────────────────────────
    let challenge = generate_challenge();
    let challenge_msg =
        serde_json::json!({"type": "challenge", "challenge": challenge}).to_string();
    if ws_send
        .send(WsMessage::Text(challenge_msg.into()))
        .await
        .is_err()
    {
        return;
    }

    #[derive(serde::Deserialize)]
    struct AuthMsg {
        #[serde(rename = "type")]
        msg_type: String,
        event: nostr::Event,
        parent_channel_id: Option<Uuid>,
    }

    let auth_result = tokio::select! {
        biased;
        _ = cancel.cancelled() => return,
        result = tokio::time::timeout(AUTH_TIMEOUT, async {
            while let Some(Ok(msg)) = ws_recv.next().await {
                if let WsMessage::Text(text) = msg {
                    if text.len() > MAX_TEXT_FRAME_BYTES { continue; }
                    if let Ok(auth) = serde_json::from_str::<AuthMsg>(&text) {
                        if auth.msg_type == "auth" { return Some(auth); }
                    }
                }
            }
            None
        }) => result,
    };

    let auth_msg = match auth_result {
        Ok(Some(a)) => a,
        _ => {
            debug!(channel_id = %channel_id, "video auth timeout");
            return;
        }
    };

    let auth_tag_json = crate::handlers::auth::extract_auth_tag_json(&auth_msg.event);
    let relay_url =
        crate::api::bridge::nip42_expected_relay_url(&state.config.relay_url, &tenant);
    let auth_ctx = match state
        .auth
        .verify_auth_event(auth_msg.event, &challenge, &relay_url)
        .await
    {
        Ok(ctx) => ctx,
        Err(e) => {
            warn!(channel_id = %channel_id, "video auth failed: {e}");
            let _ = ws_send
                .send(WsMessage::Text(
                    serde_json::json!({"type":"error","message":"auth failed"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };

    let pubkey = auth_ctx.pubkey;
    let pubkey_hex = pubkey.to_hex();
    let pubkey_bytes = pubkey.to_bytes().to_vec();

    if crate::api::relay_members::enforce_relay_membership(
        &state,
        tenant.community(),
        pubkey.as_bytes(),
        auth_tag_json.as_deref(),
    )
    .await
    .is_err()
    {
        warn!(channel_id = %channel_id, "video: relay membership denied");
        let _ = ws_send
            .send(WsMessage::Text(
                serde_json::json!({"type":"error","message":"not a relay member"})
                    .to_string()
                    .into(),
            ))
            .await;
        return;
    }

    // ── Membership check ─────────────────────────────────────────────────────
    let channel = match state.db.get_channel(tenant.community(), channel_id).await {
        Ok(ch) => ch,
        Err(_) => {
            let _ = ws_send
                .send(WsMessage::Text(
                    serde_json::json!({"type":"error","message":"channel not found"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };

    if channel.archived_at.is_some() {
        let _ = ws_send
            .send(WsMessage::Text(
                serde_json::json!({"type":"error","message":"huddle has ended"})
                    .to_string()
                    .into(),
            ))
            .await;
        return;
    }

    let is_member = match state
        .is_member_cached(tenant.community(), channel_id, &pubkey_bytes)
        .await
    {
        Ok(v) => v,
        Err(_) => false,
    };

    let parent_channel_id = auth_msg.parent_channel_id;
    if !is_member && channel.visibility != "open" {
        // Auto-add for ephemeral channels whose parent is a member
        let allowed = if channel.ttl_seconds.is_some() {
            if let Some(parent_id) = parent_channel_id {
                state
                    .is_member_cached(tenant.community(), parent_id, &pubkey_bytes)
                    .await
                    .unwrap_or(false)
            } else {
                false
            }
        } else {
            false
        };

        if !allowed {
            warn!(channel_id = %channel_id, pubkey = %pubkey_hex, "video: not a member");
            let _ = ws_send
                .send(WsMessage::Text(
                    serde_json::json!({"type":"error","message":"not a member"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    }

    // ── Join room ────────────────────────────────────────────────────────────
    let room = state
        .video_rooms
        .get_or_create(tenant.community(), channel_id);

    let peer_id = Uuid::new_v4();
    let (ctrl_tx, mut ctrl_rx) = mpsc::channel::<String>(16);
    room.add_ctrl_peer(peer_id, ctrl_tx);

    let mut frame_rx = room.subscribe_frames();

    // Notify new peer if there's already a presenter
    {
        let presenter = room.presenter.lock().await;
        if let Some((_, ref pk)) = *presenter {
            let msg =
                serde_json::json!({"type":"presenter_joined","pubkey": pk}).to_string();
            room.send_ctrl_to(peer_id, msg);
        }
    }

    let joined_msg = serde_json::json!({"type":"joined"}).to_string();
    if ws_send
        .send(WsMessage::Text(joined_msg.into()))
        .await
        .is_err()
    {
        room.remove_ctrl_peer(peer_id);
        state
            .video_rooms
            .cleanup_if_empty(tenant.community(), channel_id);
        return;
    }

    info!(
        channel_id = %channel_id,
        pubkey = %pubkey_hex,
        "video peer joined"
    );

    // ── Dual-channel send loop ────────────────────────────────────────────────
    let (data_tx, mut data_rx) = mpsc::channel::<Bytes>(16);
    let send_cancel = cancel.child_token();
    let send_task = tokio::spawn(async move {
        loop {
            // Drain control first
            while let Ok(ctrl_msg) = ctrl_rx.try_recv() {
                if ws_send
                    .send(WsMessage::Text(ctrl_msg.into()))
                    .await
                    .is_err()
                {
                    return;
                }
            }
            tokio::select! {
                biased;
                _ = send_cancel.cancelled() => {
                    let _ = ws_send.send(WsMessage::Close(None)).await;
                    break;
                }
                Some(ctrl_msg) = ctrl_rx.recv() => {
                    if ws_send.send(WsMessage::Text(ctrl_msg.into())).await.is_err() { break; }
                }
                Some(frame) = data_rx.recv() => {
                    if ws_send.send(WsMessage::Binary(frame)).await.is_err() { break; }
                }
                Ok(frame) = frame_rx.recv() => {
                    if ws_send.send(WsMessage::Binary(frame)).await.is_err() { break; }
                }
            }
        }
    });

    // ── Recv loop ────────────────────────────────────────────────────────────
    let mut is_presenter = false;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            msg = ws_recv.next() => {
                match msg {
                    Some(Ok(WsMessage::Binary(data))) => {
                        if data.len() > MAX_VIDEO_FRAME_BYTES {
                            warn!(peer_id = %peer_id, "video frame too large — dropping");
                            continue;
                        }
                        if data.len() <= VIDEO_HEADER_LEN {
                            continue;
                        }

                        if !is_presenter {
                            // Try to become presenter
                            let mut presenter = room.presenter.lock().await;
                            if presenter.is_none() {
                                *presenter = Some((peer_id, pubkey_hex.clone()));
                                is_presenter = true;
                                drop(presenter);
                                // Notify everyone else
                                let join_msg = serde_json::json!({
                                    "type": "presenter_joined",
                                    "pubkey": pubkey_hex,
                                }).to_string();
                                room.broadcast_ctrl(&join_msg);
                                info!(channel_id = %channel_id, pubkey = %pubkey_hex, "video presenter started");
                            } else {
                                // Someone else is presenting, drop this frame
                                continue;
                            }
                        }

                        // Forward to all receivers
                        let _ = room.frame_tx.send(Bytes::copy_from_slice(&data));
                    }
                    Some(Ok(WsMessage::Text(text))) => {
                        if text.len() > MAX_TEXT_FRAME_BYTES { continue; }
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                            if v.get("type").and_then(|t| t.as_str()) == Some("leave") {
                                break;
                            }
                        }
                    }
                    Some(Ok(WsMessage::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    cancel.cancel();
    let _ = send_task.await;

    // ── Cleanup ───────────────────────────────────────────────────────────────
    if is_presenter {
        let mut presenter = room.presenter.lock().await;
        if presenter.as_ref().map(|(id, _)| *id) == Some(peer_id) {
            *presenter = None;
            drop(presenter);
            let left_msg =
                serde_json::json!({"type":"presenter_left","pubkey": pubkey_hex}).to_string();
            room.broadcast_ctrl(&left_msg);
            info!(channel_id = %channel_id, pubkey = %pubkey_hex, "video presenter stopped");
        }
    }

    room.remove_ctrl_peer(peer_id);
    state
        .video_rooms
        .cleanup_if_empty(tenant.community(), channel_id);

    // suppress unused variable warning — data_tx is kept alive for the send_task lifetime
    drop(data_tx);

    info!(channel_id = %channel_id, pubkey = %pubkey_hex, "video peer left");
}
