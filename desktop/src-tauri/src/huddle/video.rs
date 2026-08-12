//! VP8 video relay commands for screen share and camera share.
//!
//! The video capture, VP8 encoding, wire framing, and WebSocket relay are
//! handled entirely in the TypeScript layer (HuddleVideoWs class in
//! HuddleContext.tsx) using browser APIs:
//!   - navigator.mediaDevices.getDisplayMedia / getUserMedia for capture
//!   - WebCodecs VideoEncoder (codec: "vp8") for encoding
//!   - Native WebSocket + NIP-42 auth for the relay connection
//!
//! These Rust commands serve as huddle-state guards: they verify the caller
//! is in an active huddle before the TypeScript layer proceeds. The relay URL
//! is available to TypeScript via the existing `getRelayWsUrl()` tauri command.
//!
//! Wire frame format (identical on web and desktop):
//!   [0:2]   seq      u16 BE
//!   [2:10]  pts_us   u64 BE (microseconds since capture start)
//!   [10]    flags    u8  (0x01=keyframe, 0x02=last_fragment, 0x04=screen_share)
//!   [11:14] reserved zero
//!   [14:]   VP8 payload (max 60 KB per fragment)

use tauri::State;

use super::state::HuddlePhase;
use crate::app_state::AppState;

/// Validate that the caller is in an active huddle and screen share can begin.
/// Stops any active video share first (mutual exclusion enforced by TypeScript).
#[tauri::command]
pub async fn start_screen_share(state: State<'_, AppState>) -> Result<(), String> {
    let hs = state.huddle()?;
    if !matches!(hs.phase, HuddlePhase::Connected | HuddlePhase::Active) {
        return Err("no active huddle".into());
    }
    hs.ephemeral_channel_id
        .as_ref()
        .ok_or("no ephemeral channel")?;
    Ok(())
}

/// Validate that the caller is in an active huddle and camera share can begin.
/// Stops any active video share first (mutual exclusion enforced by TypeScript).
#[tauri::command]
pub async fn start_camera_share(state: State<'_, AppState>) -> Result<(), String> {
    let hs = state.huddle()?;
    if !matches!(hs.phase, HuddlePhase::Connected | HuddlePhase::Active) {
        return Err("no active huddle".into());
    }
    hs.ephemeral_channel_id
        .as_ref()
        .ok_or("no ephemeral channel")?;
    Ok(())
}

/// No-op on the Rust side — TypeScript closes its own WebSocket and MediaStream.
#[tauri::command]
pub async fn stop_video_share(_state: State<'_, AppState>) -> Result<(), String> {
    Ok(())
}
