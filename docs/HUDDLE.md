# LenOS Huddle — Complete Reference

**Last updated:** 2026-08-12  
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
8. [Roadmap — Desktop · Mobile](#roadmap)

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
                      │  /huddle/{eph_ch_id}/video    │
                      │   VP8 screen share + camera   │
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

### WebSocket endpoints

```
wss://<relay-host>/huddle/{ephemeral_channel_id}/audio
wss://<relay-host>/huddle/{ephemeral_channel_id}/video
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

### Binary frame layout — audio (v2)

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

### Binary frame layout — video

```
 Offset  Size   Field         Type      Notes
 ──────  ────   ────────────  ────────  ──────────────────────────────────────
  0      2      seq           u16 BE    Wraps at 65 535
  2      8      pts_90k       u64 BE    90 kHz presentation timestamp
 10      1      flags         u8        0x01=keyframe, 0x02=last_fragment, 0x04=screen_share
 11      3      reserved      bytes     Future use; zero
 14      N      vp8_payload   bytes     VP8 encoded video; may be fragmented (max 60 KB/fragment)
```

`flags=0x00` = camera frame. `flags=0x04` = screen share frame. The relay enforces one presenter per room; a second presenter is rejected until the first disconnects.

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
| 9     | KIND_STREAM_MESSAGE         | client    | STT transcript published to parent channel |
| 9000  | KIND_NIP29_ADD_USER         | client    | NIP-29 add-user; adds agent to ephemeral/parent channel |
| 30177 | KIND_MANAGED_AGENT          | agent     | Agent definition event; used to identify agent peers |

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
| Live transcription (STT) | ✅ | Parakeet TDT-CTC 110 M (sherpa-onnx); publishes kind:9 to channel |
| TTS for agents | ✅ | Pocket TTS; queued per-agent; barge-in cancels on human speech |
| Transcription toggle | ✅ | Captions button in HuddleBar; `set_huddle_transcription_enabled` Tauri command |
| TTS toggle | ✅ | Toggle in HuddleBar; `set_tts_enabled` command |
| Emoji reactions | ✅ | 8 presets; animated bounce; KIND_HUDDLE_REACTION |
| Participant list | ✅ | Agents + humans; agents have a remove button |
| Add agent dynamically | ✅ | `AddAgentDialog`; adds agent to ephemeral + parent channels |
| Model download UI | ✅ | Progress tracking for Parakeet + Pocket model files |
| Persistent timeline card | ✅ | `HuddleAttachment` in `MessageTimeline`; shows live/ended state + join button |
| HuddleIndicator in channel header | ✅ | Headphone icon; green when active; participant count badge |
| Screen share | 🔲 | Not implemented — see Roadmap |
| Video (camera) | 🔲 | Not implemented — see Roadmap |
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

**Status: Production (full feature parity with desktop, except output device UI)**  
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
| VAD | ✅ | Energy-based RMS dBov in AudioWorklet |
| Active-speaker detection | ✅ | Per-peer frame counter; 5-frame / 3-silent threshold |
| Emoji reactions | ✅ | 8 presets; animated bounce; KIND_HUDDLE_REACTION |
| Participant list | ✅ | Popover with avatars; green speaking ring |
| Persistent timeline card | ✅ | `HuddleAttachment`; live/ended state + join button |
| HuddleIndicator in channel header | ✅ | Headphone icon; green badge |
| Lifecycle subscription | ✅ | Subscribes to kinds 48100–48103 for in-channel UI state |
| Mute / unmute | ✅ | Worklet message; 8-bar level meter |
| beforeunload cleanup | ✅ | Leaves huddle on tab close |
| Push-to-talk | ✅ | Space key (configurable); PTT indicator in HuddleBar; localStorage persistence |
| Voice activity / PTT toggle | ✅ | `inputMode` state; persisted to localStorage |
| Input device picker | ✅ | `enumerateDevices()` after mic permission; hot-swap without leaving huddle |
| Huddle notes | ✅ | Side panel; kind:30810 Nostr-based; persists after huddle ends |
| Screen share | ✅ | WebCodecs VP8; `/video` WS endpoint; `flags=0x04`; relay presenter slot |
| Camera video | ✅ | WebCodecs VP8; same `/video` endpoint; `flags=0x00`; mutual exclusion with screen share |
| STT (live transcription) | ✅ | Whisper small INT8 WASM (`@huggingface/transformers`); Web Worker; VAD-gated; kind:9 publish |
| TTS for agents | ✅ | Kokoro-82M-v1.0 q8 WASM (`kokoro-js`); Web Worker; per-agent FIFO; barge-in on speech |
| Add agent dynamically | ✅ | NIP-29 kind:9000; `AddAgentDialog` filtered to online agents not in current huddle |
| Output device picker | ⚠️ | Chrome only via `AudioContext.setSinkId`; no UI yet |

### Browser compatibility

| Browser | Audio encode | Video encode | WASM (STT/TTS) | Notes |
|---------|-------------|--------------|-----------------|-------|
| Chrome 94+ | ✅ WebCodecs | ✅ VideoEncoder | ✅ | Full support |
| Edge 94+ | ✅ WebCodecs | ✅ VideoEncoder | ✅ | Full support |
| Safari 17.4+ | ✅ WebCodecs | ✅ VideoEncoder | ✅ (COOP/COEP required) | Full support |
| Firefox | ⚠️ opusscript | ❌ no VideoEncoder | ✅ | Audio works; camera/screen share blocked |

COOP/COEP headers are set in `vite.config.ts` (both `server` and `preview` blocks) to enable `SharedArrayBuffer` for the ONNX WASM runtime on Safari/Firefox.

### File map

```
web/src/features/huddle/
├── HuddleContext.tsx               State provider; all feature state + actions
├── useHuddle.ts                    Re-export of context hook
├── worklets/
│   └── huddle-capture-processor.js   Vite entry for the AudioWorklet bundle
├── lib/
│   ├── huddleCapture.worklet.ts    AudioWorklet processor (960-sample accumulation)
│   ├── huddleCodec.ts              WebCodecs + opusscript encoder/decoder
│   ├── huddleAudioWs.ts            Audio WS: NIP-42 auth, frame send/recv, PeerInfo
│   ├── huddleVideoWs.ts            Video WS: screen share + camera (VP8, flags byte)
│   ├── huddlePlayback.ts           Per-peer jitter buffer + AudioContext scheduler
│   ├── huddleVad.ts                pcmToDbov() — RMS energy to dBov
│   ├── huddleLifecycle.ts          Relay subscription + lifecycle state reconstruction
│   ├── huddleReactions.ts          Publish + subscribe KIND_HUDDLE_REACTION
│   ├── huddleCardState.ts          isHuddleStale() — 3 600 s threshold
│   ├── huddleAgents.ts             addAgentToHuddle() — kind:9000 NIP-29 publish
│   ├── huddleStt.ts                STT orchestrator: PCM accumulator, worker lifecycle, kind:9
│   └── huddleTts.ts                TTS orchestrator: relay sub, per-agent queue, barge-in
├── workers/
│   ├── huddleSttWorker.ts          Web Worker: Whisper small WASM inference
│   └── huddleTtsWorker.ts          Web Worker: Kokoro-82M-v1.0 q8 synthesis
└── ui/
    ├── HuddleBar.tsx               Fixed bottom bar: mute, PTT, STT, TTS, camera, screen share,
    │                               reactions, notes, add-agent, participants, leave
    ├── MicControls.tsx             8-bar level meter + mute button
    ├── HuddleParticipants.tsx      Popover participant list with speaking ring
    ├── HuddleAttachment.tsx        Timeline card for KIND_HUDDLE_STARTED events
    ├── HuddleIndicator.tsx         Channel header icon with participant count badge
    └── AddAgentDialog.tsx          Agent selector (online, not in current huddle)
```

### Vite build notes

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

STT and TTS workers are bundled as separate chunks via `new URL("../workers/huddleSttWorker.ts", import.meta.url)` — Vite handles this automatically without extra `rollupOptions` entries. The ONNX WASM runtime (~23.5 MB) is emitted as a dist asset; model weights (~40 MB for Whisper, ~80 MB for Kokoro) are fetched lazily from HuggingFace CDN on first use and browser-cached.

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
| Push-to-talk | ✅ | ✅ | 🔲 |
| Voice activity / PTT toggle | ✅ | ✅ | 🔲 |
| Input device picker | ✅ | ✅ | 🔲 |
| Output device picker | ✅ | ⚠️ Chrome only, no UI | 🔲 |
| STT (live transcription) | ✅ Parakeet | ✅ Whisper WASM | 🔲 |
| TTS (agent voice) | ✅ Pocket | ✅ Kokoro WASM | 🔲 |
| Add agent dynamically | ✅ | ✅ | 🔲 |
| Huddle notes | 🔲 | ✅ | 🔲 |
| Screen share | 🔲 | ✅ | 🔲 |
| Camera video | 🔲 | ✅ | 🔲 |

---

## Roadmap

### Desktop — Screen share, Camera video, Huddle notes

**Status:** Not implemented. Web shipped all three; desktop is next.

**Screen share / Camera video — Desktop**

- Capture: Tauri screen-capture API (screen share) / `getUserMedia` via webview (camera)
- Encode: Rust `vpx` crate (VP8); same wire protocol as web (`/video` endpoint, same flags byte)
- Relay: endpoint already live (`/huddle/{eph_id}/video`); desktop just needs the client
- Receive + render: VP8 decode → `<canvas>` or `ImageBitmap` overlay in the Tauri window

**Huddle notes — Desktop**

Port the web implementation: kind:30810 replaceable event, `#e [started_event_id]` + `#h [channel_id]` tags, textarea side panel. Desktop signs via existing Tauri Nostr signer.

### Desktop — Output device picker (web)

Web `AudioContext.setSinkId` (Chrome 110+) sets the output device without re-creating the context. A `<select>` in `MicControls` or a dedicated `SpeakerControls` component would complete parity. No relay changes needed.

### Mobile huddle (Phase 1)

See [Mobile section](#mobile-flutter) for package list and scope estimate.

---

## Security notes

- `level_dbov` in frame headers is **untrusted**. Never use it for admission or moderation decisions.
- NIP-42 auth must complete within 5 s or the relay closes the connection.
- The relay validates channel membership before admitting peers to a room. Clients that are not members of the ephemeral channel are rejected.
- Ephemeral channels are auto-created by the relay on `start_huddle` with the creator as owner. Membership is managed by the relay.
- For screen share / video: the relay MUST check that the sender is the designated presenter before forwarding video frames to prevent video injection attacks.
- STT transcripts (kind:9) are published to the **parent** channel, not the ephemeral channel — they are visible to channel members who were not in the huddle.
