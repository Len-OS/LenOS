# Huddle P1 — Multi-stream Video · DM Huddles · Floating Pop-out

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Platforms:** Web · Desktop (Tauri + Rust) · Relay (lenos-relay crate)

---

## Scope

Three features shipped together as Huddle P1. All build on existing huddle infrastructure (audio WS, NIP-42 auth, HuddleContext, HuddleBar) with no changes to audio pipeline, STT, TTS, or Nostr lifecycle events unless noted.

---

## Feature 1 — Multi-stream Video

### Decision: single video WS connection per client

Each client maintains one WS to `/huddle/{eph_id}/video`. The relay fans ALL senders' frames to all receivers. The v2 header embeds `sender_pk` so the receiver disambiguates tiles without per-sender sub-endpoints. Simpler, same topology as today.

### Wire protocol — v2 video header (46 bytes)

```
Offset  Size  Field       Notes
     0     1  version     u8 = 0x02
     1     2  seq         u16 BE  (per-sender, wraps at 65535)
     3     8  pts_us      u64 BE  (microseconds since capture start)
    11     1  flags       u8  (0x01=keyframe, 0x02=last_fragment, 0x04=screen_share)
    12     1  reserved    u8 = 0x00
    13    32  sender_pk   sender's 32-byte Nostr pubkey (raw bytes, big-endian)
    45     1  reserved    u8 = 0x00
Total: 46 bytes
```

**Backward compat:** Read byte[0]. If `== 0x02` → v2 (46-byte header). Otherwise → v1 (14-byte header, byte[0] is MSB of seq). Both clients upgrade simultaneously so the v1 path is only needed during the rollout window.

**v1 header (legacy, 14 bytes):**
```
Offset  Size  Field
     0     2  seq         u16 BE
     2     8  pts_90k     u64 BE (90 kHz — note: desktop was already using pts_us here)
    10     1  flags       u8
    11     3  reserved
```

### Relay changes — `crates/lenos-relay/src/audio/`

**`wire.rs`**: Add `VIDEO_HEADER_V2_LEN: usize = 46`, `VIDEO_FLAG_*` constants, `parse_video_v2_header(bytes)` returning `(version, seq, pts_us, flags, sender_pk: [u8;32])`.

**`video_handler.rs`**: 

`VideoRoom` struct: replace `presenter: Mutex<Option<(Uuid, String)>>` with:
```rust
senders: DashMap<[u8; 32], Uuid>,   // pubkey_bytes → peer_id
```

Add `video_publishers()` method returning `Vec<(String, &'static str)>` (pubkey_hex, mode).

Recv loop logic:
- Parse version byte from incoming binary frame.
- v2: extract `sender_pk` bytes [13..45]. Verify `sender_pk == auth_ctx.pubkey.to_bytes()` — drop frame if mismatch (prevents video injection).
- If `senders` does not contain `sender_pk`: insert it, broadcast `{"type":"video_started","pubkey":"…","mode":"camera|screen"}` to all ctrl peers, log.
- Fan frame to `room.frame_tx` (broadcast channel — all receivers get it, they filter by their own `sender_pk` state if needed; in practice they render all senders).

Cleanup: when peer disconnects, remove from `senders`; if removed, broadcast `{"type":"video_stopped","pubkey":"…"}`.

`joined` message updated to:
```json
{"type":"joined","publishers":[{"pubkey":"…","mode":"camera|screen"},…]}
```

No single-presenter enforcement. Remove the `if presenter.is_none()` gate.

### Client changes — `huddleVideoWs.ts` (web + desktop)

**Send path — v2 header write:**
```typescript
function buildHeaderV2(seq: number, pts_us: number, flags: number, senderPkBytes: Uint8Array): Uint8Array {
  const buf = new ArrayBuffer(46);
  const v = new DataView(buf);
  v.setUint8(0, 0x02);                          // version
  v.setUint16(1, seq & 0xffff, false);          // seq
  v.setBigUint64(3, BigInt(pts_us), false);     // pts_us
  v.setUint8(11, flags);                        // flags
  v.setUint8(12, 0);                            // reserved
  new Uint8Array(buf, 13, 32).set(senderPkBytes); // sender_pk
  v.setUint8(45, 0);                            // reserved
  return new Uint8Array(buf);
}
```

**Own pubkey retrieval:**
- Web: add `getPublicKey(): Promise<string>` to `@/shared/lib/nostr-signer` (calls `window.nostr.getPublicKey()` or equivalent). Hex-decode to `Uint8Array(32)` before sending.
- Desktop: `invoke<{pubkey: string}>("get_identity")` at connect time; hex-decode. Cache in instance field.

**Recv path — v2 parser:**
```typescript
function parseIncomingFrame(data: ArrayBuffer): ParsedFrame | null {
  const v = new DataView(data);
  const version = v.getUint8(0);
  if (version === 0x02 && data.byteLength >= 46) {
    const seq = v.getUint16(1, false);
    const pts_us = Number(v.getBigUint64(3, false));
    const flags = v.getUint8(11);
    const senderPkBytes = new Uint8Array(data, 13, 32);
    const senderPubkey = Array.from(senderPkBytes).map(b => b.toString(16).padStart(2,'0')).join('');
    const payload = new Uint8Array(data, 46);
    return { seq, pts_us, flags, senderPubkey, payload };
  } else {
    // v1 fallback
    const seq = v.getUint16(0, false);
    const pts_us = Number(v.getBigUint64(2, false));
    const flags = v.getUint8(10);
    const payload = new Uint8Array(data, 14);
    return { seq, pts_us, flags, senderPubkey: "unknown", payload };
  }
}
```

**Fragment buffer:** `Map<senderPubkey, Map<seq, Uint8Array[]>>` — seqs from different senders are independent and must not cross-contaminate.

**Updated types:**
```typescript
export type VideoFramePayload = {
  seq: number;
  pts_us: number;
  flags: number;
  data: Uint8Array;
  senderPubkey: string;  // NEW
};
```

**WS message handler:** listen for `video_started`/`video_stopped` JSON messages alongside existing `presenter_joined`/`presenter_left` (keep both for backward compat during rollout). Seed from `publishers` array in `joined`.

### HuddleContext changes (web + desktop)

Remove:
```typescript
remotePresenterPubkey: string | null
setRemotePresenterPubkey: (pubkey: string | null) => void
```

Add:
```typescript
remoteVideoPublishers: Map<string, "camera" | "screen">
// key = pubkey hex, value = mode
```

Desktop: same replacement in `HuddleContextValue` interface.

### New component — `HuddleVideoGrid`

**Files:** `web/src/features/huddle/ui/HuddleVideoGrid.tsx`, `desktop/src/features/huddle/components/HuddleVideoGrid.tsx`

Props:
```typescript
interface HuddleVideoGridProps {
  publishers: Map<string, "camera" | "screen">;   // from context
  localStream: MediaStream | null;                  // own camera preview
  onFrame: (handler: (f: VideoFramePayload) => void) => () => void;  // bus subscription
}
```

Layout rules (CSS grid):
- 0 remote = hidden
- 1 = full width
- 2 = 50/50 horizontal
- 3–4 = 2×2
- 5+ = 3-column wrap

Screen-share tiles: full-width row at top (regardless of count rule above).

Per-tile: one `VideoDecoder` (VP8) keyed by `senderPubkey`. `VideoDecoder.output` → `<canvas>` via `VideoFrame`. On new `senderPubkey` in `publishers`, create decoder + canvas. On pubkey removed, flush and destroy.

Local preview tile: `<video srcObject={localStream} autoPlay muted playsInline>`.

Replace single `HuddleVideo`/canvas element in `HuddleBar` with `<HuddleVideoGrid>`.

---

## Feature 2 — DM Huddles

### Synthetic channel ID

```typescript
function dmChannelId(pubkeyA: string, pubkeyB: string): string {
  return [pubkeyA, pubkeyB].sort().join(":");
}
```

Detection (Rust and TypeScript): `parent_channel_id.contains(':')`.

### Rust — `desktop/src-tauri/src/huddle/`

**`relay_api.rs`** — `start_huddle` relay API call: add optional `dm_pubkeys: Option<Vec<String>>` to request body. When `parent_channel_id` contains `:`, set `parent_type: "dm"` and `dm_pubkeys`.

**`mod.rs`** — `start_huddle` Tauri command: add `dm_pubkeys: Option<Vec<String>>` param. When provided, construct synthetic `parent_channel_id = sorted(dm_pubkeys).join(":")` and pass through.

**KIND_HUDDLE_STARTED** event (web `startHuddle`, desktop `start_huddle`): when `dm_pubkeys` present, add `#p [otherPubkey]` tag. The `#h` tag is still set to the synthetic ID.

### Web — `huddleLifecycle.ts`

Add subscription: `{"#p": [selfPubkey], kinds: [48100]}` — surfaces DM huddle invites regardless of which channel is open.

### `startHuddle` action

Add `dmPubkeys?: string[]` param. When provided:
1. Compute `parentChannelId = dmPubkeys.sort().join(":")`
2. Pass `dm_pubkeys` to relay API (web side) or Rust invoke (desktop side)
3. Add `#p` tag to KIND_HUDDLE_STARTED

### UI additions

**DM thread header (web + desktop):** Add `<HuddleIndicator>` button. Find DM thread header component during implementation (likely near channel header components). Pass `parentChannelId = dmChannelId(self, other)` to `startHuddle`.

**`HuddleAttachment`** (web + desktop): already renders in timeline. Add render condition: OR event has `#p` tag matching `selfPubkey` or other DM participant. No change to join logic — `ephemeralChannelId` comes from event content as usual.

---

## Feature 3 — Floating Pop-out

### Desktop (Tauri)

**New Rust commands in `desktop/src-tauri/src/lib.rs`:**

```rust
#[tauri::command]
async fn pop_out_huddle(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewUrl;
    tauri::WebviewWindowBuilder::new(
        &app,
        "huddle-pip",
        WebviewUrl::App("/huddle-pip".into()),
    )
    .title("Huddle")
    .decorations(false)
    .always_on_top(true)
    .transparent(true)
    .resizable(false)
    .inner_size(280.0, 80.0)
    .build()
    .map_err(|e| e.to_string())?;
    app.emit("huddle-pip-opened", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pop_in_huddle(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("huddle-pip") {
        win.close().map_err(|e| e.to_string())?;
    }
    app.emit("huddle-pip-closed", ()).map_err(|e| e.to_string())?;
    Ok(())
}
```

Register both in the `invoke_handler` in `lib.rs`.

**New route** `/huddle-pip` in `desktop/src/app/router.tsx` → renders `HuddleBarPip`.

**`HuddleBarPip`** (`desktop/src/features/huddle/components/HuddleBarPip.tsx`):
- Ultra-compact: speaking avatars stack, mute toggle, leave button, expand icon
- Draggable: `onMouseDown` → `window.__TAURI__.window.getCurrent().startDragging()` (Tauri 2 API)
- Expand: `invoke('pop_in_huddle')`
- Leave: `leaveHuddle()` then `invoke('pop_in_huddle')`

**HuddleContext (desktop)**: add `isPoppedOut: boolean`, listen to `huddle-pip-opened` / `huddle-pip-closed` Tauri events via `listen()`. When `isPoppedOut`, `HuddleBar` renders `null` in main window.

**Auto pop-out trigger**: when `activeEphemeralChannelId` is set AND user navigates to a different channel route, call `invoke('pop_out_huddle')`. When user navigates back to the huddle parent channel, call `invoke('pop_in_huddle')`. Detect navigation via TanStack Router's `useRouterState` watching `location.pathname` against `parentChannelId`.

### Web

**`HuddleFloatingBar`** (`web/src/features/huddle/ui/HuddleFloatingBar.tsx`):
- `position: fixed; bottom: 16px; right: 16px; z-index: 50`
- `border-radius: 16px; box-shadow: xl`
- Content: speaking avatar stack, mute toggle, leave button, expand-to-channel button
- Draggable: `onPointerDown` on drag handle → capture pointer → track `onPointerMove` on document → update `transform: translate(x, y)`. Release on `onPointerUp`.
- Expand button: `navigate({ to: "/channels/$channelId", params: { channelId: parentChannelId! } })`

**HuddleContext (web)**: add `isFloating: boolean` computed field. Set true when `ephemeralChannelId !== null && currentPathname !== /channels/${parentChannelId}`.

Implement via `useRouterState` hook from TanStack Router watching `location.pathname`:
```typescript
const location = useRouterState({ select: s => s.location });
const isFloating = !!ephemeralChannelId &&
  !location.pathname.includes(parentChannelId ?? "__none__");
```

**App shell**: render `{isFloating && <HuddleFloatingBar />}` at root level, outside channel layout, so it persists across navigation.

---

## Done Criteria

- [ ] `cargo build` clean in `desktop/src-tauri/`
- [ ] `pnpm typecheck && pnpm build` clean in `web/` and `desktop/`
- [ ] Multi-stream: two participants can both have camera on; both tiles render simultaneously
- [ ] Multi-stream: screen share still one-at-a-time per sender; shows as separate tile
- [ ] DM: "Start huddle" button visible in DM thread header
- [ ] DM: HuddleAttachment renders in DM timeline
- [ ] DM: joining DM huddle works end-to-end (audio connects)
- [ ] Float desktop: navigating away from huddle channel auto-opens pip window
- [ ] Float desktop: pip stays on top; mute and leave work from pip
- [ ] Float web: HuddleFloatingBar appears when navigating away from huddle channel
- [ ] Float web: draggable; expand returns to huddle channel
- [ ] docs/HUDDLE.md: multi-stream ✅, DM huddles ✅, floating window ✅ in parity table

## Global Constraints (preserved from existing codebase)

- Encoder dimensions from `track.getSettings()` — NEVER hardcode resolution
- `level_dbov` NEVER used for admission or moderation
- NIP-42 auth timeout 5 s
- kind:9 STT transcripts and kind:30810 notes publish to parent channel, not ephemeral
- Desktop: NEVER hold Mutex across `.await` in Rust
- Desktop: `signRelayEvent` (Tauri invoke) for signing; keys never leave Rust
- Video wire backward compat: check version byte; if absent/not 0x02, use 14-byte v1 layout
