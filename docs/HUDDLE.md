# LenOS Huddle — Complete Reference

**Last updated:** 2026-08-11  
**Platforms:** Web · Desktop (Tauri) · Mobile (Flutter — roadmap)

Huddle is LenOS's in-channel voice room. Any member can start one from a channel header; the room persists until explicitly ended. Audio is routed through the relay (server-mixed, not peer-to-peer), so it works across every client type simultaneously.

---

## Contents

1. [Architecture](#architecture)
2. [Wire Protocol](#wire-protocol)
3. [Nostr Event Kinds](#nostr-event-kinds)
4. [Desktop (Tauri + Rust)](#desktop-tauri--rust)
5. [Web](#web)
6. [Mobile (Flutter)](#mobile-flutter)
7. [Cross-Platform Parity](#cross-platform-parity)
8. [Roadmap — Screen Share · Video · Notes](#roadmap)

---

## Architecture

```
                      ┌─────────────────────────────┐
                      │       lenos-relay (Rust)     │
                      │                              │
  Web browser ────────┤  /huddle/{eph_ch_id}/audio   │
  Desktop (Tauri) ────┤   WS + NIP-42 auth           ├──── Nostr event fanout
  Mobile (future) ────┤   Opaque Opus fan-out         │     KIND 48100-48103
                      │   Active-speaker hints        │
                      └─────────────────────────────┘
```

- **Relay is the mixing bus.** Clients send Opus frames; the relay fans each frame to every other authenticated peer. No transcoding, no SFU tree — raw Opus forwarded verbatim.
- **No peer-to-peer.** ICE / WebRTC / STUN/TURN are not used. Every client connects only to the relay. Firewall-friendly; works on corporate networks.
- **Ephemeral channel.** On `start_huddle`, the relay creates a short-lived channel for the session and returns its ID. Participants join this ephemeral channel; the parent channel ID is stored in the start event's content so others can find it.
- **Nostr lifecycle.** The relay signs and publishes join/leave/end events so every subscriber (including clients not in the huddle) sees live participant state.

### Audio pipeline (all platforms)

```
Mic → PCM (48 kHz mono) → 20 ms frames (960 samples)
  → Opus encode (32 kbps VOIP) → 8-byte header prepended
  → WS binary frame → relay → all other peers
  → Opus decode → jitter buffer → AudioContext / native audio out
```

---

## Wire Protocol

### WebSocket endpoint

```
wss://<relay-host>/huddle/{ephemeral_channel_id}/audio
```

### Handshake sequence

```
Relay → Client   {"type":"challenge","challenge":"<random-hex>"}
Client → Relay   NIP-42 auth event (kind 22242, tag ["challenge","<hex>"])
Relay → Client   {"type":"joined","peers":["<pubkey>",…]}
                 -- audio frames may now flow --
Relay → Client   {"type":"peer_joined","pubkey":"<hex>"}   (when others join)
Relay → Client   {"type":"peer_left","pubkey":"<hex>"}     (when others leave)
```

Auth timeout: 5 s. Unauthenticated connections are dropped.

### Binary frame layout (v2)

Every audio frame is a binary WebSocket message structured as:

```
 Offset  Size   Field          Type      Notes
 ──────  ────   ─────────────  ────────  ──────────────────────────────────────
  0      2      seq            u16 BE    Wraps at 65 535; used for loss detection
  2      4      ts_48k         u32 BE    48 kHz RTP-style media timestamp
  6      1      level_dbov     i8        dBov in [-127, 0]; UNTRUSTED telemetry
  7      1      flags          u8        0x01 = DTX comfort-noise; bits 1-7 reserved
  8      N      opus_payload   bytes     Opus 20 ms frame; variable length
```

`level_dbov` is authored by the sender. The relay clamps it to `[-127, 0]` and forwards it unchanged. Clients MUST NOT use it for trust decisions (admission, moderation). It is used only for active-speaker detection UI.

### Active-speaker detection (client-side rule)

```
speaking   = last 5+ consecutive frames with level_dbov > −40
not_speaking = 3 consecutive frames with level_dbov <= −40 (reset speaking flag)
```

---

## Nostr Event Kinds

| Kind  | Name                        | Publisher | Description |
|-------|-----------------------------|-----------|-------------|
| 48100 | KIND_HUDDLE_STARTED         | client    | Starts huddle; content contains `{"ephemeralChannelId":"..."}` |
| 48101 | KIND_HUDDLE_PARTICIPANT_JOINED | relay  | Signed by relay when audio WS authenticates |
| 48102 | KIND_HUDDLE_PARTICIPANT_LEFT  | relay   | Signed by relay on WS disconnect |
| 48103 | KIND_HUDDLE_ENDED           | client    | Sent by creator to end huddle |
| 24810 | KIND_HUDDLE_REACTION        | client    | Ephemeral emoji reaction during huddle |

All lifecycle events carry `#h [parent_channel_id]` and `#e [started_event_id]` tags so subscribers can reconstruct state from any point.

A huddle is considered **stale** (join button hidden) if `created_at` on KIND_HUDDLE_STARTED is older than 3 600 s and no KIND_HUDDLE_ENDED has been seen.

---

## Desktop (Tauri + Rust)

**Status: Production**  
**Location:** `desktop/src/features/huddle/` (TypeScript UI) + `desktop/src-tauri/src/huddle/` (Rust backend)

### Feature set

| Feature | Status | Detail |
|---------|--------|--------|
| Start / join / leave huddle | ✅ | Phase machine: Idle → Creating → Connecting → Connected → Active → Leaving |
| Mic capture | ✅ | `getUserMedia` + `AudioWorkletNode`; PCM queued over Tauri IPC to Rust |
| Opus encode | ✅ | Rust `opus` crate; 48 kHz, mono, 32 kbps VOIP |
| Audio relay WS | ✅ | Same v2 protocol; NIP-42 auth in Rust |
| Opus decode + native playback | ✅ | Rust `opus` decode → `rodio` output; gapless scheduling |
| VAD | ✅ | `earshot` Rust library (WebRTC VAD); more accurate than energy thresholding |
| Active-speaker detection | ✅ | Per-peer frame counter; emitted as Tauri event `huddle-active-speakers` |
| Push-to-talk | ✅ | Global OS shortcut (`Ctrl+Space` default); configurable; mic muting when key up |
| Voice activity mode | ✅ | Toggle: push-to-talk ↔ continuous voice activity |
| Input device picker | ✅ | `enumerateDevices()` + per-session mic gain slider |
| Output device picker | ✅ | `rodio` output device enumeration + `SpeakerControls` UI |
| Live transcription (STT) | ✅ | Parakeet TDT-CTC 110 M (sherpa-onnx); publishes kind 9 to channel |
| TTS for agents | ✅ | Pocket TTS; queued per-agent; barge-in cancels on human speech |
| Transcription toggle | ✅ | Captions button in HuddleBar; `set_huddle_transcription_enabled` Tauri command |
| TTS toggle | ✅ | Toggle in HuddleBar; `set_tts_enabled` command |
| Emoji reactions | ✅ | KIND_HUDDLE_REACTION (24810); animated burst overlay |
| Participant list | ✅ | Agents + humans; agents have a remove button |
| Add agent dynamically | ✅ | `AddAgentDialog`; adds agent to ephemeral + parent channels |
| Model download UI | ✅ | Progress tracking for Parakeet + Pocket model files |
| Persistent timeline card | ✅ | `HuddleAttachment` in `MessageTimeline`; shows live/ended state + join button |
| HuddleIndicator in channel header | ✅ | Headphone icon; green when active; participant count badge |
| Screen share | 🔲 | Not implemented — see Roadmap |
| Video | 🔲 | Not implemented — see Roadmap |
| Huddle notes | 🔲 | Not implemented — see Roadmap |

### State machine

```
Idle ──(startHuddle)──► Creating ──(relay OK)──► Connecting
                                                     │
                                               (audio WS joined)
                                                     │
                                                  Active ──(leaveHuddle)──► Leaving ──► Idle
                                                     │
                                              (error / timeout)
                                                     │
                                                   Idle
```

### Rust module map

```
desktop/src-tauri/src/huddle/
├── mod.rs               Phase state machine; Tauri commands (start/join/leave/etc.)
├── relay_api.rs         HTTP membership queries; audio WS connect + handshake
├── wire.rs              v1/v2 frame parsing + encoding; threat-model notes
├── state.rs             HuddleState serialization; Tauri state mutations
├── pipeline.rs          STT/TTS pipeline construction; hot-start timer
├── stt.rs               STT worker: PCM → earshot VAD → Parakeet → kind:9
├── tts.rs               TTS worker: text queue → Pocket synth → rodio gapless
├── transcription.rs     Kind:9 event builder + relay publish
├── audio_output.rs      rodio output device enumeration + playback
├── agents.rs            Agent membership management + voice-mode guidelines
├── models.rs            Model download/cache manager (Parakeet + Pocket)
├── agent_tts_routing.rs Per-agent text normalisation + routing
└── (others)             Utility helpers
```

### Key TypeScript UI files

```
desktop/src/features/huddle/
├── HuddleContext.tsx         State provider; bridges Tauri events ↔ React
├── components/
│   ├── HuddleBar.tsx         Main controls: mute, TTS, captions, reactions, agents, leave
│   ├── MicControls.tsx       Input device picker + level meter + gain slider
│   ├── SpeakerControls.tsx   Output device picker
│   ├── ParticipantList.tsx   Roster (agents + humans); remove button for agents
│   ├── AddAgentDialog.tsx    Agent selector; adds to huddle dynamically
│   └── HuddleAttachment.tsx  Timeline card (in-progress / ended + join button)
└── lib/
    ├── audioWorklet.ts       Mic capture + PCM IPC to Rust
    ├── useAudioDevices.ts    Device enumeration hook
    └── huddleCardState.ts    Stale-check logic
```

---

## Web

**Status: Production (P0 feature set)**  
**Location:** `web/src/features/huddle/`

### Feature set

| Feature | Status | Detail |
|---------|--------|--------|
| Start / join / leave huddle | ✅ | Phase machine: idle → connecting → active → leaving |
| Mic capture | ✅ | `getUserMedia` + `AudioWorkletNode` (960-sample batches at 48 kHz) |
| Opus encode | ✅ | WebCodecs `AudioEncoder` (Chrome 94+, Safari 17.4+) |
| Opus WASM fallback | ✅ | `opusscript` (Emscripten-compiled libopus); loaded only when WebCodecs absent |
| Audio relay WS | ✅ | NIP-42 auth; v2 binary frame protocol; `huddleAudioWs.ts` |
| Opus decode + Web Audio playback | ✅ | Per-peer `AudioDecoder` + `AudioContext` scheduler; 3-frame (60 ms) jitter buffer |
| VAD | ✅ | Energy-based RMS dBov in AudioWorklet (less accurate than earshot) |
| Active-speaker detection | ✅ | Per-peer frame counter; 5-frame / 3-silent threshold |
| Emoji reactions | ✅ | 8 presets; animated bounce; KIND_HUDDLE_REACTION |
| Participant list | ✅ | Popover with avatars; green speaking ring |
| Persistent timeline card | ✅ | `HuddleAttachment`; live/ended state + join button |
| HuddleIndicator in channel header | ✅ | Headphone icon; green badge |
| Lifecycle subscription | ✅ | Subscribes to kinds 48100–48103 for in-channel UI state |
| Mute / unmute | ✅ | Worklet message; 8-bar level meter |
| beforeunload cleanup | ✅ | Leaves huddle on tab close |
| Push-to-talk | 🔲 | Not implemented — see Roadmap |
| Input device picker | 🔲 | Not implemented (uses system default) — see Roadmap |
| Output device picker | ⚠️ | Chrome only via `AudioContext.setSinkId`; no UI yet |
| STT | 🔲 | Roadmap (Phase 2): `window.SpeechRecognition` |
| TTS for agents | 🔲 | Roadmap (Phase 2): `window.speechSynthesis` |
| Screen share | 🔲 | Not implemented — see Roadmap |
| Video | 🔲 | Not implemented — see Roadmap |
| Huddle notes | 🔲 | Not implemented — see Roadmap |

### Browser compatibility

| Browser | Audio encode | WASM fallback | Notes |
|---------|-------------|---------------|-------|
| Chrome 94+ | ✅ WebCodecs | — | Full support |
| Edge 94+ | ✅ WebCodecs | — | Full support |
| Safari 17.4+ | ✅ WebCodecs | — | Full support |
| Firefox | ⚠️ | ✅ opusscript | WebCodecs AudioEncoder not supported in Firefox; WASM path active |
| Safari < 17.4 | ⚠️ | ✅ opusscript | Older Safari falls back to WASM |

### File map

```
web/src/features/huddle/
├── HuddleContext.tsx           State provider; pipeline setup; startHuddle/joinHuddle
├── useHuddle.ts                Re-export of context hook
├── worklets/
│   └── huddle-capture-processor.js   Vite entry for the AudioWorklet bundle
├── lib/
│   ├── huddleCapture.worklet.ts   AudioWorklet processor (960-sample accumulation)
│   ├── huddleCodec.ts          WebCodecs + opusscript encoder/decoder
│   ├── huddleAudioWs.ts        WS connect, NIP-42 auth, frame send/recv
│   ├── huddlePlayback.ts       Per-peer jitter buffer + AudioContext scheduler
│   ├── huddleVad.ts            pcmToDbov() — RMS energy to dBov
│   ├── huddleLifecycle.ts      Relay subscription + lifecycle state reconstruction
│   ├── huddleReactions.ts      Publish + subscribe KIND_HUDDLE_REACTION
│   └── huddleCardState.ts      isHuddleStale() — 3 600 s threshold
└── ui/
    ├── HuddleBar.tsx           Fixed bottom bar (mute, reactions, participants, leave)
    ├── MicControls.tsx         8-bar level meter + mute button
    ├── HuddleParticipants.tsx  Popover participant list with speaking ring
    ├── HuddleAttachment.tsx    Timeline card for KIND_HUDDLE_STARTED events
    └── HuddleIndicator.tsx     Channel header icon with participant count badge
```

### Vite build

The AudioWorklet runs in a dedicated browser thread and must be loaded as a separate script. Vite emits it at a fixed path:

```ts
// vite.config.ts
rollupOptions: {
  input: {
    index: "index.html",
    "huddle-capture-processor": "src/features/huddle/worklets/huddle-capture-processor.js",
  },
  output: {
    entryFileNames: (chunk) =>
      chunk.name === "huddle-capture-processor"
        ? "assets/[name].js"            // fixed path, no hash
        : "assets/[name]-[hash].js",
  },
}
```

`HuddleContext.tsx` references the worklet via `new URL(...)` which Vite rewrites to the correct asset URL at build time:

```ts
const WORKLET_URL = new URL("./worklets/huddle-capture-processor.js", import.meta.url).href;
```

---

## Mobile (Flutter)

**Status: Not implemented**

No huddle feature exists in the mobile app. The relay protocol is platform-agnostic (WebSocket + binary frames), so a Flutter implementation is feasible.

### What a Flutter implementation would need

| Component | Flutter equivalent |
|-----------|-------------------|
| Mic capture | `flutter_sound` or `record` package |
| Opus encode | `flutter_opus` / native plugin |
| AudioWorklet | Dart isolate for real-time PCM processing |
| WS relay connection | `web_socket_channel` |
| NIP-42 auth | Re-use existing Nostr signing utilities |
| Playback | `just_audio` or `flutter_sound` with buffer injection |
| Active-speaker UI | Existing avatar/profile components |

### Estimated scope

Phase 1 (basic voice, no STT/TTS): 3–4 weeks.  
Phase 2 (STT via on-device model, TTS): 2–3 additional weeks.

---

## Cross-Platform Parity

| Feature | Desktop | Web | Mobile |
|---------|---------|-----|--------|
| Start / join / leave | ✅ | ✅ | 🔲 |
| Mute / unmute | ✅ | ✅ | 🔲 |
| Mic level meter | ✅ | ✅ | 🔲 |
| Active-speaker detection | ✅ | ✅ | 🔲 |
| Emoji reactions | ✅ | ✅ | 🔲 |
| Participant list | ✅ | ✅ | 🔲 |
| Persistent timeline card | ✅ | ✅ | 🔲 |
| Channel header indicator | ✅ | ✅ | 🔲 |
| Lifecycle Nostr events | ✅ | ✅ | 🔲 |
| Push-to-talk | ✅ | 🔲 | 🔲 |
| Input device picker | ✅ | 🔲 | 🔲 |
| Output device picker | ✅ | ⚠️ Chrome only | 🔲 |
| STT (live transcription) | ✅ Parakeet | 🔲 Phase 2 | 🔲 |
| TTS (agent voice) | ✅ Pocket | 🔲 Phase 2 | 🔲 |
| Add agent dynamically | ✅ | 🔲 | 🔲 |
| Voice mode toggle (PTT/VAD) | ✅ | 🔲 | 🔲 |
| Screen share | 🔲 | 🔲 | 🔲 |
| Video | 🔲 | 🔲 | 🔲 |
| Huddle notes | 🔲 | 🔲 | 🔲 |

---

## Roadmap

### Push-to-talk — Web

**Effort:** ~0.5 days

`document.addEventListener("keydown/keyup")` for `Space` (or configurable key). Send mute/unmute message to the AudioWorklet. Show PTT indicator in `HuddleBar` while held. Persist preference to localStorage.

```ts
// HuddleContext.tsx addition
useEffect(() => {
  if (inputMode !== "push_to_talk") return;
  const down = (e: KeyboardEvent) => { if (e.code === "Space") setMuted(false); };
  const up   = (e: KeyboardEvent) => { if (e.code === "Space") setMuted(true);  };
  document.addEventListener("keydown", down);
  document.addEventListener("keyup",   up);
  return () => { document.removeEventListener("keydown", down); document.removeEventListener("keyup", up); };
}, [inputMode]);
```

### Audio device picker — Web

**Effort:** ~1 day

`navigator.mediaDevices.enumerateDevices()` (requires microphone permission). Store selected `deviceId` in context state. Re-call `getUserMedia({ audio: { deviceId: { exact: selectedDeviceId } } })` on change. For output: `AudioContext.setSinkId(deviceId)` (Chrome only; guard with `"setSinkId" in AudioContext.prototype`). Add a `<select>` in the `MicControls` component.

### Screen share — All platforms

**Effort:** 1–2 weeks per platform

Screen share requires a **second media track** alongside the audio track. Architecturally:

- **Capture:** `getDisplayMedia({ video: true, audio: false })` on web; `Tauri` screen-capture API on desktop; `flutter_screen_capture` on mobile.
- **Encode:** VP8 / VP9 / AV1 via WebCodecs `VideoEncoder` on web; Rust `vpx` crate on desktop.
- **Transport:** A second WebSocket connection to a new relay endpoint, e.g. `/huddle/{eph_id}/video`, using a similar binary frame protocol but with a video-specific header (frame type, timestamp, keyframe flag). Alternatively, extend the existing endpoint with a `flags` byte that differentiates audio vs. video frames — but a separate WS is cleaner for rate limiting and routing.
- **Relay changes:** The relay must handle a new `/huddle/{eph_id}/video` endpoint with its own room state, fan-out, and permission checks (only presenter sends; all peers receive).
- **Receive + render:** `VideoDecoder` → `<canvas>` or `ImageBitmap` on web; `rodio`-equivalent video output on desktop.

**Recommended wire protocol for video frames:**

```
Offset  Size   Field         Notes
 0       2     seq           u16 BE
 2       8     pts_90k       u64 BE  90 kHz presentation timestamp
10       1     flags         0x01=keyframe, 0x02=last_fragment, 0x04=screen_share
11       3     reserved      future use
12       N     vp8/vp9/av1   encoded video data (may be fragmented)
```

**Relay endpoint:**

```
wss://<host>/huddle/{eph_channel_id}/video
```

Same NIP-42 handshake. Only the huddle creator (or a designated presenter) should be admitted to send; all authenticated members receive.

### Video (camera) — All platforms

Same architecture as screen share but sourced from `getUserMedia({ video: true })` instead of `getDisplayMedia`. The relay endpoint and wire format are identical. The two can share the same `/video` endpoint with the `flags` byte distinguishing screen share vs. camera frames.

### Huddle notes — All platforms

**Effort:** 1 week

A collaborative text pad attached to a huddle session. Design options:

**Option A — Nostr-based (recommended):** Use a new replaceable event kind (e.g. `kind: 30810`) with `#e [started_event_id]` and `#h [channel_id]` tags. Each save publishes a new version; clients take the latest `created_at`. Simple, relay-stored, no extra infra.

**Option B — CRDT (OT/Yjs):** Full real-time collaborative editing. Requires a sync WebSocket endpoint on the relay or a sidecar. Significantly more complex.

**Recommended UI flow:**
1. Notes button in `HuddleBar` (notebook icon). Opens a side panel.
2. Panel has a textarea (Option A) or `<Editor>` component (Option B).
3. On `blur` or explicit save, publish the Nostr event.
4. Subscribe to `kind: 30810` with `#e [started_event_id]`; update textarea on new events from other participants.
5. Notes survive huddle end (stored on relay as a normal replaceable event).

**Proposed kind:**

```
kind:   30810
tags:   ["e", "<started_event_id>"], ["h", "<parent_channel_id>"]
content: plain text (markdown rendered client-side)
```

### STT / TTS — Web (Phase 2)

Desktop already ships Parakeet (STT) and Pocket (TTS). The web equivalent uses browser APIs:

- **STT:** `window.SpeechRecognition` / `webkitSpeechRecognition`. Accuracy and language support are browser-dependent and lower quality than Parakeet. Suitable for English-only MVP; a WASM Whisper model would be equivalent to desktop quality but is ~150 MB.
- **TTS:** `window.speechSynthesis`. Voice quality varies by OS. For parity with desktop, a WASM TTS model (e.g. Kokoro) can be loaded lazily on first TTS use.

Both are toggled independently and must not block the audio pipeline. Same Nostr events as desktop (kind 9 for transcripts).

### Mobile huddle (Phase 1)

See [Mobile section](#mobile-flutter) for package list and scope estimate.

---

## Security notes

- `level_dbov` in frame headers is **untrusted**. Never use it for admission or moderation decisions.
- NIP-42 auth must complete within 5 s or the relay closes the connection.
- The relay validates channel membership before admitting peers to a room. Clients that are not members of the ephemeral channel are rejected.
- Ephemeral channels are auto-created by the relay on `start_huddle` with the creator as owner. Membership is managed by the relay.
- For screen share / video: the relay MUST check that the sender is the designated presenter before forwarding video frames to prevent video injection attacks.
