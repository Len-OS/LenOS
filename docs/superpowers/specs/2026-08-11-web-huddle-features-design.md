# Web Huddle — Remaining 4 Features Design

**Date:** 2026-08-11  
**Branch:** feat/web-onboarding-p0  
**Scope:** `web/src/features/huddle/`

---

## Context

Web huddle voice core is complete (audio WS, Opus encode/decode, screen share, notes, reactions, PTT, device picker). Four features remain to reach full web/desktop parity:

1. Camera video
2. STT — live transcription (follows desktop Parakeet pattern)
3. TTS for agents (follows desktop Pocket pattern)
4. Add agent dynamically

---

## Feature 1: Camera Video

**Effort:** ~1 day  
**Desktop parity:** Screen share ships desktop-first; camera is web-first here.

### Approach

`HuddleVideoWs` already implements screen share with `flags = 0x04 | keyframe | lastFragment`. Camera uses the same class, same relay endpoint (`/video`), same VP8 encoder config, same fragmentation logic. Only two things change:

- **Media source:** `getUserMedia({ video: { width:{max:1280}, height:{max:720}, frameRate:{max:15} }, audio:false })` instead of `getDisplayMedia`
- **Flags:** `0x00` (no `0x04` screen_share bit) for camera frames

The relay enforces one presenter per room. Camera and screen share are mutually exclusive — whichever claims the slot first wins; the other is disabled in UI while a presenter is active.

### API changes

**`huddleVideoWs.ts`**
```ts
async startCameraShare(): Promise<void>   // mirrors startScreenShare()
stopCameraShare(): void                   // mirrors stopScreenShare()
```

Track `ended` event auto-calls `stopCameraShare()` (user revokes camera permission).

**`HuddleContext.tsx`**  
New state: `cameraShareActive: boolean`  
New actions: `startCameraShare(): Promise<void>`, `stopCameraShare(): void`  
One `videoWsRef` per session — camera and screen share share the ref; starting one closes the other.

**`HuddleBar.tsx`**  
New `Video` icon button (lucide-react). Disabled when `screenShareActive || remotePresenterPubkey !== null`. Active style: `bg-purple-500/20 text-purple-500`.

### Error handling

- `VideoEncoder` absent → throw `"Camera share requires Chrome 94+ or Safari 17.4+"` (same guard as screen share)
- `getUserMedia` denial → surface in `state.error`
- Track `ended` (user stops via browser chrome) → `stopCameraShare()`, `setState cameraShareActive=false`

---

## Feature 2: STT — Live Transcription

**Effort:** ~1 week  
**Desktop parity:** Desktop uses Parakeet TDT-CTC 110M (sherpa-onnx), publishes kind:9 to parent channel.

### Package

`@xenova/transformers` with `whisper_small` (INT8-quantized, ~40 MB). Runs in a dedicated Web Worker — inference never blocks the main thread or audio pipeline.

### Architecture

```
AudioWorklet PCM frames (960-sample, Float32Array)
  ─► 3-second PCM accumulator (HuddleStt, main thread)
       ─► postMessage({ type:"pcm", buffer }) ─► SttWorker (Web Worker)
            ─► pipeline("automatic-speech-recognition", "Xenova/whisper_small")
            ─► { text: string }
       ◄─ postMessage({ type:"transcript", text })
  ─► signNostrEvent({ kind:9, content:text, tags:[["h",parentChannelId]] })
  ─► getRelayClient(relayWsUrl()).publish(event)
  ─► setState captions = [...captions.slice(-2), text]
```

The accumulator collects frames until either 3 s of audio is buffered or 500 ms of silence (RMS dBov ≤ −50 for 25+ frames) is detected, then flushes to the worker. This matches desktop's VAD-gated chunk strategy.

### New files

**`lib/huddleStt.ts`** — `HuddleStt` class
```ts
class HuddleStt {
  constructor(opts: { parentChannelId: string; onCaption(text: string): void })
  feedPcm(pcm: Float32Array): void   // called from worklet onmessage
  start(): Promise<void>             // creates worker, resolves after model warm-up
  stop(): void                       // terminates worker, clears accumulator
  readonly loading: boolean
}
```

**`workers/huddleSttWorker.ts`** — Web Worker  
Loads pipeline once on first message (`{ type:"init" }`). Subsequent `{ type:"pcm", buffer }` messages run inference and `postMessage({ type:"transcript", text })`. No concurrency — queues pending PCM while inference runs.

### HuddleContext additions

```ts
// state
sttEnabled: boolean          // persisted to localStorage "huddle_stt_enabled"
sttLoading: boolean          // true while model downloads/warms up
captions: string[]           // last 3 transcript lines
// actions
setSttEnabled(v: boolean): void
```

`setSttEnabled(true)` constructs `HuddleStt`, calls `start()`, sets `sttLoading=true` until warm-up resolves, wires `feedPcm` into the worklet message handler. `setSttEnabled(false)` calls `stop()` and clears captions.

The existing worklet message handler already runs per PCM frame — adding `huddleSttRef.current?.feedPcm(pcm)` is a one-liner addition with no performance cost (the guard is a nullable ref check).

### UI

**`HuddleBar.tsx`**  
New `Subtitles` icon button. Shows spinner when `sttLoading`. Active style matches desktop captions button.

Caption overlay: `<div>` fixed above HuddleBar (`bottom-14`, `z-39`), max 2 lines, 12px text, fades after 6 s (CSS transition opacity). Renders `captions.slice(-2)`.

### Browser compatibility

| Browser | Support |
|---------|---------|
| Chrome 94+ | ✅ (SharedArrayBuffer required for transformers.js WASM) |
| Edge 94+ | ✅ |
| Safari 17+ | ✅ (with COOP/COEP headers) |
| Firefox | ✅ with correct headers |

Required HTTP headers (must be set by the dev server / CDN):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Fallback

If `Worker` or `WebAssembly` is unavailable, `start()` throws and `setSttEnabled` surfaces the error string in `state.error`. No silent degradation.

---

## Feature 3: TTS for Agents

**Effort:** ~3 days  
**Desktop parity:** Desktop uses Pocket TTS, per-agent queue, barge-in on human speech.

### Package

`kokoro-js` npm package (~80 MB model, browser-optimized Kokoro TTS). Runs in a Web Worker.

### Architecture

```
Nostr sub { kinds:[9], "#h":[ephemeralChannelId] } via relay live client
  ─► filter: event.pubkey ∈ agentPubkeys (peers[] where peer.isAgent)
  ─► per-agent FIFO queue: Map<pubkey, string[]>
       ─► postMessage({ type:"speak", text, pubkey }) ─► TtsWorker
            ─► kokoro.generate(text) → Float32Array PCM
       ◄─ postMessage({ type:"audio", buffer, pubkey })
  ─► AudioContext.decodeAudioData(buffer)
  ─► AudioBufferSourceNode.start() → playback via existing AudioContext (ctxRef)
  ─► on ended: dequeue next item for same pubkey

Barge-in:
  worklet PCM dbov > −40 for 3 consecutive frames
  ─► huddleTtsRef.current?.onSpeaking()
  ─► currentNode.stop() + drain pending queue for all agents
```

### Agent identification

`peers[]` in `HuddleContext` already carries `{ pubkey, name }` from the audio WS handshake. Agents publish kind:30177 events with an `agent_type` tag. The add-agent feature (Feature 4) updates `peers[]` to include an `isAgent: boolean` field derived from kind:30177 subscription.

If `isAgent` is unknown (agent joined before kind:30177 was fetched), TTS still speaks — it errs toward speaking rather than silently dropping.

### New files

**`lib/huddleTts.ts`** — `HuddleTts` class
```ts
class HuddleTts {
  constructor(opts: {
    ephemeralChannelId: string
    audioCtx: AudioContext          // shared with playback pipeline
    onLoading(v: boolean): void
  })
  start(agentPubkeys: string[]): Promise<void>
  stop(): void
  onSpeaking(): void                // barge-in trigger
  updateAgentPubkeys(keys: string[]): void
}
```

**`workers/huddleTtsWorker.ts`** — Web Worker  
Loads Kokoro model once. Processes `{ type:"speak", text }` messages sequentially. Returns `{ type:"audio", buffer: ArrayBuffer }` (WAV/PCM).

### HuddleContext additions

```ts
// state
ttsEnabled: boolean          // persisted to localStorage "huddle_tts_enabled"
ttsLoading: boolean
// actions
setTtsEnabled(v: boolean): void
```

`setTtsEnabled(true)` creates `HuddleTts` and calls `start(agentPubkeys)`. Agent pubkeys are derived from `peers` — re-passed to `updateAgentPubkeys` whenever `peers` changes.

Barge-in hook: in the worklet `onmessage` handler, alongside the existing `sendFrame` call:
```ts
if (dbov > -40) huddleTtsRef.current?.onSpeaking();
```

### UI

**`HuddleBar.tsx`**  
New `Volume2` / `VolumeX` toggle icon. Spinner on `ttsLoading`. Placement: between notes and screen-share buttons (matches desktop HuddleBar order).

---

## Feature 4: Add Agent Dynamically

**Effort:** ~2 days  
**Desktop parity:** Desktop `AddAgentDialog` + `add_agent_to_huddle` (kind:9000 NIP-29 publish).

### Approach

Web publishes kind:9000 (NIP-29 add-user) directly via `signNostrEvent` + `getRelayClient().publish()`. No HTTP relay API needed — same Nostr-event path as desktop.

Agent list comes from `useAgents(parentChannelId)` which already subscribes kind:30177. Filter: `status === "online"` and pubkey not already in `peers[]`.

### Event shape (kind:9000 — NIP-29 add-user)

```json
{
  "kind": 9000,
  "content": "",
  "tags": [
    ["h", "<channelId>"],
    ["p", "<agentPubkey>", "", "bot"]
  ]
}
```

Published twice: once for ephemeral channel (required), once for parent channel (best-effort, failure captured not propagated).

### New files

**`lib/huddleAgents.ts`**
```ts
interface AgentAddResult {
  ephemeralAdded: boolean
  parentAdded: boolean
  parentError: string | null
}

async function addAgentToHuddle(
  agentPubkey: string,
  ephemeralChannelId: string,
  parentChannelId: string,
): Promise<AgentAddResult>
```

**`ui/AddAgentDialog.tsx`** — port from `desktop/src/features/huddle/components/AddAgentDialog.tsx`
- Replaces `invoke("list_managed_agents")` with `useAgents(parentChannelId)` prop
- Replaces `onAdd` Tauri result with `addAgentToHuddle` return type
- Rest of the UI is identical (Dialog, agent list, loading/error/warning states)

### HuddleContext additions

```ts
// state
addAgentDialogOpen: boolean
// actions
setAddAgentDialogOpen(v: boolean): void
addAgent(pubkey: string): Promise<AgentAddResult>
```

`addAgent` calls `addAgentToHuddle(pubkey, ephemeralChannelId, parentChannelId)`. On success, the running agent process auto-subscribes to the new channel when it receives the kind:9000 membership notification (same as desktop — no extra signalling needed).

### UI

**`HuddleBar.tsx`**  
New `Bot` icon button (matches desktop). Opens `AddAgentDialog` inline (rendered in the HuddleBar fragment, same as `HuddleNotesPanel`).

---

## File map summary

### Modified

| File | Changes |
|------|---------|
| `lib/huddleVideoWs.ts` | `startCameraShare()`, `stopCameraShare()`; camera uses `getUserMedia`, `flags=0x00` |
| `HuddleContext.tsx` | camera state + actions; STT state + actions + feedPcm hook; TTS state + actions + barge-in hook; add-agent state + actions |
| `ui/HuddleBar.tsx` | Camera (`Video`), STT (`Subtitles`), TTS (`Volume2`), Add-agent (`Bot`) buttons; caption overlay |

### New

| File | Purpose |
|------|---------|
| `lib/huddleStt.ts` | STT orchestrator — PCM accumulator, worker lifecycle, kind:9 publish |
| `workers/huddleSttWorker.ts` | Web Worker — Whisper inference |
| `lib/huddleTts.ts` | TTS orchestrator — Nostr sub, per-agent queue, barge-in |
| `workers/huddleTtsWorker.ts` | Web Worker — Kokoro synthesis |
| `lib/huddleAgents.ts` | `addAgentToHuddle` — kind:9000 publish to ephemeral + parent |
| `ui/AddAgentDialog.tsx` | Port of desktop dialog; uses `useAgents` instead of Tauri invoke |

---

## Build notes

Worker files must be imported via `new URL("../workers/huddleSttWorker.ts", import.meta.url)` so Vite bundles them as separate chunks. No special `rollupOptions` entry needed — Vite handles `new URL(...)` worker imports automatically.

`@xenova/transformers` and `kokoro-js` ship their own WASM; no extra Vite config required beyond the COOP/COEP headers (needed for SharedArrayBuffer).

---

## Out of scope

- Firefox camera/screen share (VideoEncoder not supported — existing screen share guard covers this)
- STT language switching (English-only for Whisper small MVP)
- Agent TTS voice selection per-agent (single Kokoro voice; desktop parity post-MVP)
- Camera-only mode without audio (camera always joins an active audio huddle)
