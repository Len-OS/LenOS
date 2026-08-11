# LenOS Web Huddle

**Status:** Design complete -- implementation pending  
**Branch target:** `feat/web-huddle`  
**Parity ref:** `docs/WEB_DESKTOP_PARITY.md` P5

---

## Overview

Desktop huddle is **not WebRTC**. It uses a custom relay-based audio pipeline: browser/Rust captures PCM from the microphone, encodes to Opus, and streams binary frames over a dedicated WebSocket endpoint (`/huddle/{channel_id}/audio`) on the LenOS relay. All participants connect to the same relay socket; mixing and fan-out happen server-side. This design means the web port is straightforward -- the relay protocol is already defined, no peer-to-peer signaling is needed.

### What the desktop has

| Feature | Desktop mechanism |
|---|---|
| Mic capture | `getUserMedia` + `AudioWorkletNode` + Tauri IPC + Rust PCM queue |
| Opus encode | Rust `opus` crate (20ms frames, 48kHz, mono) |
| Audio relay WS | `/huddle/{id}/audio` with NIP-42 auth + 8-byte frame header |
| Opus decode + playback | Rust `opus` decode + `rodio` native output |
| Voice activity detection | `earshot` VAD (Rust) |
| STT | Rust pipeline + transcription service |
| TTS | Rust pipeline + voice synthesis + `rodio` |
| PTT global shortcut | Tauri `Ctrl+Space` global shortcut |
| Active speaker detection | Per-peer frame counter in Rust |
| Emoji reactions | KIND_HUDDLE_REACTION (24810), ephemeral subscription |
| Nostr lifecycle events | KIND_HUDDLE_STARTED/JOINED/LEFT/ENDED (48100-48103) |

### Web equivalents

| Feature | Web mechanism | Gap vs desktop |
|---|---|---|
| Mic capture | `getUserMedia` + `AudioWorkletNode` (same) | None |
| Opus encode | `AudioEncoder` (WebCodecs API) | Chrome 94+ only; WASM fallback for others |
| Audio relay WS | Same WS endpoint + protocol | None |
| Opus decode + playback | `AudioDecoder` (WebCodecs) + `AudioContext` scheduler | None |
| Voice activity detection | Energy-based VAD in AudioWorklet | Less accurate than Earshot -- good enough for v1 |
| STT | `window.SpeechRecognition` (WebSpeech) | English-only, accuracy lower -- Phase 2 |
| TTS | `window.speechSynthesis` (WebSpeech) | Lower quality -- Phase 2 |
| PTT shortcut | `keydown`/`keyup` on `document` (tab-focus only) | No global OS shortcut |
| Active speaker detection | Energy threshold from AudioWorklet | Slightly higher latency |
| Emoji reactions | Same relay subscription | None |
| Nostr lifecycle events | Same events via relay-live-client | None |

---

## Architecture

```
Browser tab
├─ getUserMedia (48kHz, mono, echoCancellation, noiseSuppression, autoGainControl)
│
├─ AudioContext (48kHz)
│   ├─ MediaStreamSource -- GainNode -- HuddleCaptureWorklet (20ms batches)
│   │   MessagePort (Float32Array PCM, transferable)
│   ├─ Main thread: HuddleEncoder.encode(pcm) -> Uint8Array (Opus)
│   └─ HuddleAudioWs.send(frame) -- relay WS
│
├─ HuddleAudioWs (WebSocket to /huddle/{id}/audio)
│   ├─ Auth: NIP-42 challenge-response
│   ├─ Recv binary frames -- HuddleDecoder.decode(frame) -- PCM
│   └─ HuddlePlayback.schedule(peerIndex, pcm, ts) -- AudioBufferSourceNode
│
├─ HuddleContext (React)
│   ├─ useHuddle() hook surface
│   ├─ Nostr event publication (48100-48103)
│   └─ Relay subscription (lifecycle events + reactions)
│
└─ UI
    ├─ HuddleBar (app-level, fixed bottom)
    ├─ HuddleAttachment (timeline card)
    └─ HuddleIndicator (channel header icon)
```

---

## Relay WS Protocol

### Endpoint

```
wss://<workspace-relay>/huddle/<ephemeral_channel_id>/audio
```

### Handshake

```
1. Client connects
2. Relay -> Client (JSON text frame):
   { "type": "challenge", "challenge": "<random-string>" }
3. Client signs NIP-42 auth event:
   { kind: 22242, tags: [["relay", wsUrl], ["challenge", challenge]], ... }
4. Client -> Relay (JSON text frame):
   { "type": "auth", "event": <signed-nostr-event>, "protocol_version": 2 }
5. Relay -> Client (JSON text frame):
   { "type": "joined", "peers": [{ "peer_index": 0, "pubkey": "..." }, ...] }
```

After `joined`, all subsequent frames are **binary** (Opus audio).

### Binary Frame Format (Protocol v2)

Each WebSocket binary message is one Opus-encoded audio frame:

```
Byte offset   Length   Field         Description
──────────────────────────────────────────────────────────────
0             2        seq           u16 big-endian, frame sequence number
2             4        ts_48k        u32 big-endian, 48kHz timestamp
6             1        level_dbov    i8, speech level in dBov (0 = silence)
7             1        flags         u8, reserved (set to 0)
8+            varies   opus_payload  Opus-encoded audio (20ms @ 48kHz mono)
```

Encoding parameters:
- Sample rate: 48000 Hz
- Channels: 1 (mono)
- Frame size: 960 samples (20ms @ 48kHz)
- Bitrate: 32000 bps
- Application: VOIP

### Active Speaker Detection

A peer is "active" (speaking) when 5+ consecutive frames arrive with `level_dbov > -40`. Reset to inactive after 3 silent frames.

---

## Nostr Event Reference

### KIND_HUDDLE_STARTED (48100)

Published to the **parent channel** when a huddle is created. Renders a `HuddleAttachment` card in the channel timeline.

```ts
{
  kind: 48100,
  content: JSON.stringify({ ephemeral_channel_id: "<uuid>" }),
  tags: [["h", parentChannelId]]
}
```

### KIND_HUDDLE_PARTICIPANT_JOINED (48101)

Relay-signed. Emitted when a participant joins.

```ts
{
  kind: 48101,
  pubkey: "<relay-pubkey>",
  content: JSON.stringify({ ephemeral_channel_id: "<uuid>" }),
  tags: [["p", participantPubkey], ["h", parentChannelId]]
}
```

### KIND_HUDDLE_PARTICIPANT_LEFT (48102)

Same shape as JOINED, kind 48102.

### KIND_HUDDLE_ENDED (48103)

```ts
{
  kind: 48103,
  content: JSON.stringify({ ephemeral_channel_id: "<uuid>" }),
  tags: [["h", parentChannelId]]
}
```

### KIND_HUDDLE_REACTION (24810)

```ts
{
  kind: 24810,
  content: "emoji-character",
  tags: [["h", ephemeralChannelId], ["reaction", "emoji-character"], ["sender_name", displayName]]
}
```

### Lifecycle Subscription Filter

```ts
{ kinds: [48100, 48101, 48102, 48103], "#h": [parentChannelId], limit: 100 }
```

### Reactions Subscription Filter

```ts
{ kinds: [24810], "#h": [ephemeralChannelId], limit: 0 }
```

---

## File Structure

```
web/src/features/huddle/
├─ HuddleContext.tsx                 React context, state, lifecycle
├─ useHuddle.ts                      Re-export of context hook
├─ lib/
│   ├─ huddleAudioWs.ts             WebSocket connection + frame protocol
│   ├─ huddleCodec.ts               AudioEncoder/AudioDecoder (WebCodecs + WASM fallback)
│   ├─ huddlePlayback.ts            Per-peer jitter buffer + AudioContext scheduler
│   ├─ huddleCapture.worklet.ts     AudioWorklet processor (20ms PCM batches)
│   ├─ huddleVad.ts                 Energy-based voice activity detection
│   ├─ huddleReactions.ts           Reaction publish + subscription
│   ├─ huddleLifecycle.ts           Lifecycle event subscribe + reconstruct state
│   └─ huddleCardState.ts           Staleness check (1h joinable window)
├─ ui/
│   ├─ HuddleBar.tsx                App-level controls bar (fixed bottom)
│   ├─ HuddleAttachment.tsx         Timeline card (channel message)
│   ├─ HuddleIndicator.tsx          Channel header icon + participant count
│   ├─ MicControls.tsx              Mute button + level meter
│   └─ HuddleParticipants.tsx       Participant popover with speaker highlights
└─ worklets/
    └─ huddle-capture-processor.js  Bundled AudioWorkletProcessor (separate Vite entry)
```

Existing files to modify:
```
web/src/app/routes/_workspace.tsx            Add HuddleProvider + HuddleBar
web/src/features/channels/ui/ChannelView.tsx Add HuddleIndicator + HuddleAttachment intercept
web/src/shared/constants/kinds.ts            Add KIND_HUDDLE_* constants if missing
```

---

## Implementation

### 1. `huddleCapture.worklet.ts`

AudioWorklet runs in a dedicated thread. Accumulates 20ms (960-sample) batches, posts them to main thread via transferable ArrayBuffer. Runs at 48kHz; 960 samples = 20ms per frame.

```ts
// web/src/features/huddle/lib/huddleCapture.worklet.ts
// Must be a separate Vite entry point -- NOT a normal ES module import.

const FRAME_SAMPLES = 960;

class HuddleCaptureProcessor extends AudioWorkletProcessor {
  private buffer = new Float32Array(FRAME_SAMPLES);
  private writePos = 0;
  private muted = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "mute") this.muted = e.data.value as boolean;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;
    let offset = 0;
    while (offset < input.length) {
      const toCopy = Math.min(FRAME_SAMPLES - this.writePos, input.length - offset);
      if (this.muted) {
        this.buffer.fill(0, this.writePos, this.writePos + toCopy);
      } else {
        this.buffer.set(input.subarray(offset, offset + toCopy), this.writePos);
      }
      this.writePos += toCopy;
      offset += toCopy;
      if (this.writePos === FRAME_SAMPLES) {
        const out = this.buffer.buffer.slice(0) as ArrayBuffer;
        this.port.postMessage({ type: "frame", buffer: out }, [out]);
        this.buffer = new Float32Array(FRAME_SAMPLES);
        this.writePos = 0;
      }
    }
    return true;
  }
}

registerProcessor("huddle-capture-processor", HuddleCaptureProcessor);
```

**Vite config** -- add to `build.rollupOptions` in `vite.config.ts`:

```ts
input: {
  "huddle-capture-processor": "src/features/huddle/worklets/huddle-capture-processor.js",
},
output: {
  entryFileNames: (chunk) =>
    chunk.name === "huddle-capture-processor"
      ? "assets/[name].js"
      : "assets/[name]-[hash].js",
},
```

Worklet entry file `worklets/huddle-capture-processor.js`:
```js
import "../lib/huddleCapture.worklet.ts";
```

Load in `HuddleContext.tsx`:
```ts
const WORKLET_URL = new URL("./worklets/huddle-capture-processor.js", import.meta.url).href;
await audioCtx.audioWorklet.addModule(WORKLET_URL);
```


---

### 2. `huddleCodec.ts`

Wraps WebCodecs `AudioEncoder`/`AudioDecoder`. Falls back to `@opus-codec/wasm` (lazy import) for Firefox and Safari < 17.4.

```ts
// web/src/features/huddle/lib/huddleCodec.ts

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_SIZE = 960;
const BITRATE = 32000;

export interface HuddleEncoder {
  encode(pcm: Float32Array, timestamp: number): Promise<Uint8Array>;
  close(): void;
}

export interface HuddleDecoder {
  decode(opus: Uint8Array, timestamp: number): Promise<Float32Array>;
  close(): void;
}

function webCodecsSupported(): boolean {
  return typeof AudioEncoder !== "undefined" && typeof AudioDecoder !== "undefined";
}

class WebCodecsEncoder implements HuddleEncoder {
  private encoder: AudioEncoder;
  private pending = new Map<number, (data: Uint8Array) => void>();

  constructor() {
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        this.pending.get(chunk.timestamp)?.(buf);
        this.pending.delete(chunk.timestamp);
      },
      error: (e) => console.error("[HuddleEncoder]", e),
    });
    this.encoder.configure({ codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS, bitrate: BITRATE });
  }

  encode(pcm: Float32Array, timestamp: number): Promise<Uint8Array> {
    return new Promise((resolve) => {
      this.pending.set(timestamp, resolve);
      const data = new AudioData({
        format: "f32-planar", sampleRate: SAMPLE_RATE,
        numberOfChannels: CHANNELS, numberOfFrames: FRAME_SIZE, timestamp, data: pcm,
      });
      this.encoder.encode(data);
      data.close();
    });
  }

  close(): void { this.encoder.close(); }
}

class WebCodecsDecoder implements HuddleDecoder {
  private decoder: AudioDecoder;
  private pending = new Map<number, (pcm: Float32Array) => void>();

  constructor() {
    this.decoder = new AudioDecoder({
      output: (frame) => {
        const pcm = new Float32Array(frame.numberOfFrames);
        frame.copyTo(pcm, { planeIndex: 0 });
        this.pending.get(frame.timestamp)?.(pcm);
        this.pending.delete(frame.timestamp);
        frame.close();
      },
      error: (e) => console.error("[HuddleDecoder]", e),
    });
    this.decoder.configure({ codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS });
  }

  decode(opus: Uint8Array, timestamp: number): Promise<Float32Array> {
    return new Promise((resolve) => {
      this.pending.set(timestamp, resolve);
      this.decoder.decode(new EncodedAudioChunk({ type: "key", timestamp, data: opus }));
    });
  }

  close(): void { this.decoder.close(); }
}

// WASM fallback -- only loaded when WebCodecs unavailable. Add to package.json:
// "@opus-codec/wasm": "^0.4.0"
async function createWasmEncoder(): Promise<HuddleEncoder> {
  const { Encoder } = await import("@opus-codec/wasm");
  const enc = new Encoder(SAMPLE_RATE, CHANNELS, "voip");
  enc.setBitrate(BITRATE);
  return { encode: async (pcm) => new Uint8Array(enc.encode(pcm, FRAME_SIZE)), close: () => enc.delete() };
}

async function createWasmDecoder(): Promise<HuddleDecoder> {
  const { Decoder } = await import("@opus-codec/wasm");
  const dec = new Decoder(SAMPLE_RATE, CHANNELS);
  return { decode: async (opus) => dec.decode(opus, FRAME_SIZE), close: () => dec.delete() };
}

export async function createHuddleEncoder(): Promise<HuddleEncoder> {
  return webCodecsSupported() ? new WebCodecsEncoder() : createWasmEncoder();
}

export async function createHuddleDecoder(): Promise<HuddleDecoder> {
  return webCodecsSupported() ? new WebCodecsDecoder() : createWasmDecoder();
}
```


---

### 3. `huddleAudioWs.ts`

WS connection with NIP-42 auth handshake and 8-byte frame send/receive.

```ts
// web/src/features/huddle/lib/huddleAudioWs.ts

import { signNostrEvent } from "@/shared/lib/nostr-signer";

export interface PeerInfo { peerIndex: number; pubkey: string; }

export interface IncomingFrame {
  peerIndex: number; seq: number; ts48k: number; levelDbov: number; opus: Uint8Array;
}

export interface HuddleAudioWsOptions {
  wsUrl: string;
  ephemeralChannelId: string;
  onPeers: (peers: PeerInfo[]) => void;
  onFrame: (frame: IncomingFrame) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

const HDR = 8; // header bytes

export class HuddleAudioWs {
  private ws: WebSocket | null = null;
  private seq = 0;
  private closed = false;

  constructor(private opts: HuddleAudioWsOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const base = this.opts.wsUrl.replace(/\/$/, "");
      const url = base + "/huddle/" + this.opts.ephemeralChannelId + "/audio";
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      const timeout = setTimeout(() => { ws.close(); reject(new Error("Huddle WS timed out")); }, 10_000);

      ws.addEventListener("message", async (evt) => {
        if (typeof evt.data === "string") {
          const msg = JSON.parse(evt.data) as Record<string, unknown>;
          if (msg.type === "challenge") {
            try {
              const signed = await signNostrEvent({
                kind: 22242, content: "",
                tags: [["relay", url], ["challenge", msg.challenge as string]],
              });
              ws.send(JSON.stringify({ type: "auth", event: signed, protocol_version: 2 }));
            } catch (e) { clearTimeout(timeout); ws.close(); reject(e); }
          } else if (msg.type === "joined") {
            clearTimeout(timeout);
            this.opts.onPeers((msg.peers as PeerInfo[]) ?? []);
            resolve();
          } else if (msg.type === "error") {
            clearTimeout(timeout); ws.close();
            reject(new Error(String(msg.message ?? "Huddle join rejected")));
          }
        } else {
          const buf = evt.data as ArrayBuffer;
          if (buf.byteLength <= HDR) return;
          const v = new DataView(buf);
          this.opts.onFrame({
            peerIndex: 0,
            seq: v.getUint16(0, false),
            ts48k: v.getUint32(2, false),
            levelDbov: v.getInt8(6),
            opus: new Uint8Array(buf, HDR),
          });
        }
      });

      ws.addEventListener("close", () => { this.ws = null; if (!this.closed) this.opts.onClose(); });
      ws.addEventListener("error", () => { clearTimeout(timeout); this.opts.onError("WebSocket error"); });
    });
  }

  sendFrame(opus: Uint8Array, ts48k: number, levelDbov: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const buf = new ArrayBuffer(HDR + opus.byteLength);
    const v = new DataView(buf);
    v.setUint16(0, this.seq++ & 0xffff, false);
    v.setUint32(2, ts48k, false);
    v.setInt8(6, Math.max(-128, Math.min(127, levelDbov)));
    v.setUint8(7, 0);
    new Uint8Array(buf).set(opus, HDR);
    this.ws.send(buf);
  }

  close(): void { this.closed = true; this.ws?.close(); this.ws = null; }
}
```


---

### 4. `huddlePlayback.ts`

Per-peer jitter buffer + Web Audio scheduled playback. Each peer gets its own decoder. Tracks active speakers via per-peer frame energy counters.

```ts
// web/src/features/huddle/lib/huddlePlayback.ts

import { createHuddleDecoder, type HuddleDecoder } from "./huddleCodec";
import type { IncomingFrame } from "./huddleAudioWs";

const SR = 48000;
const FRAME_DUR = 0.020;
const JITTER = 3; // frames ahead = 60ms
const SPEECH_THR = -40; // dBov threshold
const SPEAK_MIN = 5;    // consecutive frames before marking active

interface Peer { decoder: HuddleDecoder; nextTime: number; frames: number; }

export class HuddlePlayback {
  private ctx: AudioContext;
  private gain: GainNode;
  private peers = new Map<number, Peer>();
  private speaking = new Set<number>();
  private cb: (idxs: number[]) => void;

  constructor(onSpeakers: (idxs: number[]) => void) {
    this.ctx = new AudioContext({ sampleRate: SR });
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    this.cb = onSpeakers;
  }

  async addPeer(idx: number): Promise<void> {
    if (this.peers.has(idx)) return;
    this.peers.set(idx, {
      decoder: await createHuddleDecoder(),
      nextTime: this.ctx.currentTime + JITTER * FRAME_DUR,
      frames: 0,
    });
  }

  removePeer(idx: number): void {
    const p = this.peers.get(idx);
    if (!p) return;
    p.decoder.close();
    this.peers.delete(idx);
    this.speaking.delete(idx);
    this.cb([...this.speaking]);
  }

  async handleFrame(frame: IncomingFrame): Promise<void> {
    if (!this.peers.has(frame.peerIndex)) await this.addPeer(frame.peerIndex);
    const p = this.peers.get(frame.peerIndex)!;

    if (frame.levelDbov > SPEECH_THR) {
      p.frames++;
      if (p.frames >= SPEAK_MIN && !this.speaking.has(frame.peerIndex)) {
        this.speaking.add(frame.peerIndex);
        this.cb([...this.speaking]);
      }
    } else {
      if (p.frames > 0) p.frames--;
      if (p.frames === 0 && this.speaking.has(frame.peerIndex)) {
        this.speaking.delete(frame.peerIndex);
        this.cb([...this.speaking]);
      }
    }

    const pcm = await p.decoder.decode(frame.opus, frame.ts48k);
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const ab = this.ctx.createBuffer(1, pcm.length, SR);
    ab.getChannelData(0).set(pcm);
    const src = this.ctx.createBufferSource();
    src.buffer = ab;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    if (p.nextTime < now) p.nextTime = now + JITTER * FRAME_DUR;
    src.start(p.nextTime);
    p.nextTime += FRAME_DUR;
  }

  setVolume(v: number): void { this.gain.gain.value = Math.max(0, Math.min(2, v)); }

  async close(): Promise<void> {
    for (const p of this.peers.values()) p.decoder.close();
    this.peers.clear();
    await this.ctx.close();
  }
}
```


---

### 5. `huddleVad.ts`

```ts
// web/src/features/huddle/lib/huddleVad.ts

export function pcmToDbov(pcm: Float32Array): number {
  if (pcm.length === 0) return -90;
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
  const rms = Math.sqrt(s / pcm.length);
  return rms === 0 ? -90 : 20 * Math.log10(rms);
}
```

---

### 6. `huddleReactions.ts`

```ts
// web/src/features/huddle/lib/huddleReactions.ts

import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_HUDDLE_REACTION } from "@/shared/constants/kinds";

export interface HuddleReaction { emoji: string; senderName: string; pubkey: string; }

export async function publishHuddleReaction(emoji: string, ephChanId: string, senderName: string): Promise<void> {
  const signed = await signNostrEvent({
    kind: KIND_HUDDLE_REACTION, content: emoji,
    tags: [["h", ephChanId], ["reaction", emoji], ["sender_name", senderName]],
  });
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
}

export function subscribeHuddleReactions(ephChanId: string, onReaction: (r: HuddleReaction) => void): () => void {
  return getRelayClient(relayWsUrl()).subscribe({
    id: "huddle-reactions-" + ephChanId,
    filter: { kinds: [KIND_HUDDLE_REACTION], "#h": [ephChanId], limit: 0 },
    onEvent: (raw) => {
      onReaction({
        emoji: raw.content as string,
        senderName: ((raw.tags as string[][]).find((t) => t[0] === "sender_name")?.[1]) ?? "",
        pubkey: raw.pubkey as string,
      });
    },
  });
}
```

---

### 7. `huddleLifecycle.ts`

```ts
// web/src/features/huddle/lib/huddleLifecycle.ts

import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_HUDDLE_STARTED, KIND_HUDDLE_PARTICIPANT_JOINED,
  KIND_HUDDLE_PARTICIPANT_LEFT, KIND_HUDDLE_ENDED,
} from "@/shared/constants/kinds";

export interface HuddleLifecycle {
  ephemeralChannelId: string;
  participants: Set<string>;
  ended: boolean;
  startedAt: number;
}

export type LifecycleEvent = {
  kind: number; content: string; tags: string[][]; pubkey: string; created_at: number; id: string;
};

export function parseEphemeralChannelId(content: string): string | null {
  try {
    return (JSON.parse(content) as { ephemeral_channel_id?: string }).ephemeral_channel_id ?? null;
  } catch { return null; }
}

export function reconstructHuddleLifecycle(events: LifecycleEvent[], _parentChanId: string): HuddleLifecycle | null {
  const order: Record<number, number> = {
    [KIND_HUDDLE_STARTED]: 0, [KIND_HUDDLE_PARTICIPANT_JOINED]: 1,
    [KIND_HUDDLE_PARTICIPANT_LEFT]: 2, [KIND_HUDDLE_ENDED]: 3,
  };
  const sorted = [...events].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    const ao = order[a.kind] ?? 99, bo = order[b.kind] ?? 99;
    return ao !== bo ? ao - bo : a.id.localeCompare(b.id);
  });

  const started = sorted.find((e) => e.kind === KIND_HUDDLE_STARTED);
  if (!started) return null;
  const ephemeralChannelId = parseEphemeralChannelId(started.content);
  if (!ephemeralChannelId) return null;

  const participants = new Set<string>();
  let ended = false;

  for (const ev of sorted) {
    if (parseEphemeralChannelId(ev.content) !== ephemeralChannelId) continue;
    const pk = (ev.tags as string[][]).find((t) => t[0] === "p")?.[1];
    if (ev.kind === KIND_HUDDLE_PARTICIPANT_JOINED && pk) participants.add(pk);
    else if (ev.kind === KIND_HUDDLE_PARTICIPANT_LEFT && pk) participants.delete(pk);
    else if (ev.kind === KIND_HUDDLE_ENDED) ended = true;
  }

  return { ephemeralChannelId, participants, ended, startedAt: started.created_at };
}

export function subscribeHuddleLifecycle(
  parentChanId: string,
  store: LifecycleEvent[],
  onUpdate: (evs: LifecycleEvent[]) => void,
): () => void {
  return getRelayClient(relayWsUrl()).subscribe({
    id: "huddle-lifecycle-" + parentChanId,
    filter: {
      kinds: [KIND_HUDDLE_STARTED, KIND_HUDDLE_PARTICIPANT_JOINED, KIND_HUDDLE_PARTICIPANT_LEFT, KIND_HUDDLE_ENDED],
      "#h": [parentChanId],
      limit: 100,
    },
    onEvent: (raw) => {
      const ev = raw as LifecycleEvent;
      if (!store.some((e) => e.id === ev.id)) { store.push(ev); onUpdate([...store]); }
    },
  });
}
```

---

### 8. `huddleCardState.ts`

```ts
// web/src/features/huddle/lib/huddleCardState.ts
const JOINABLE_WINDOW_SECONDS = 3600;
export function isHuddleStale(startedAt: number): boolean {
  return Math.floor(Date.now() / 1000) - startedAt > JOINABLE_WINDOW_SECONDS;
}
```


---

### 9. `HuddleContext.tsx`

Central state provider. Manages mic capture, audio WS, codec, playback, and Nostr event publication.

```tsx
// web/src/features/huddle/HuddleContext.tsx

import {
  createContext, useCallback, useContext, useEffect,
  useRef, useState, type ReactNode,
} from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_HUDDLE_STARTED } from "@/shared/constants/kinds";
import { HuddleAudioWs, type PeerInfo } from "./lib/huddleAudioWs";
import { createHuddleEncoder, type HuddleEncoder } from "./lib/huddleCodec";
import { HuddlePlayback } from "./lib/huddlePlayback";
import { pcmToDbov } from "./lib/huddleVad";
import {
  subscribeHuddleReactions, publishHuddleReaction, type HuddleReaction,
} from "./lib/huddleReactions";

const WORKLET_URL = new URL(
  "./worklets/huddle-capture-processor.js",
  import.meta.url,
).href;

export type HuddlePhase = "idle" | "connecting" | "active" | "leaving";

interface HuddleState {
  phase: HuddlePhase;
  parentChannelId: string | null;
  ephemeralChannelId: string | null;
  peers: PeerInfo[];
  activeSpeakerIndexes: number[];
  muted: boolean;
  micLevel: number;
  reactions: HuddleReaction[];
  error: string | null;
}

interface HuddleActions {
  startHuddle(parentChannelId: string): Promise<void>;
  joinHuddle(parentChannelId: string, ephemeralChannelId: string): Promise<void>;
  leaveHuddle(): Promise<void>;
  setMuted(v: boolean): void;
  sendReaction(emoji: string, senderName: string): Promise<void>;
  clearError(): void;
}

export type HuddleCtx = HuddleState & HuddleActions;

const HuddleContext = createContext<HuddleCtx | null>(null);

const INITIAL: HuddleState = {
  phase: "idle", parentChannelId: null, ephemeralChannelId: null,
  peers: [], activeSpeakerIndexes: [], muted: false, micLevel: 0,
  reactions: [], error: null,
};
```


```tsx
// continued...

export function HuddleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HuddleState>(INITIAL);
  const audioWsRef = useRef<HuddleAudioWs | null>(null);
  const encoderRef = useRef<HuddleEncoder | null>(null);
  const playbackRef = useRef<HuddlePlayback | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const tsRef = useRef(0);

  const cleanup = useCallback(async () => {
    unsubRef.current?.();
    unsubRef.current = null;
    workletRef.current?.disconnect();
    workletRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    encoderRef.current?.close();
    encoderRef.current = null;
    audioWsRef.current?.close();
    audioWsRef.current = null;
    await playbackRef.current?.close();
    playbackRef.current = null;
    await ctxRef.current?.close();
    ctxRef.current = null;
    tsRef.current = 0;
  }, []);

  const startPipeline = useCallback(async (_parentChanId: string, ephChanId: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 48000 });
    ctxRef.current = audioCtx;
    await audioCtx.audioWorklet.addModule(WORKLET_URL);
    const source = audioCtx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioCtx, "huddle-capture-processor");
    workletRef.current = worklet;
    source.connect(worklet);

    encoderRef.current = await createHuddleEncoder();

    const playback = new HuddlePlayback((idxs) =>
      setState((s) => ({ ...s, activeSpeakerIndexes: idxs })),
    );
    playbackRef.current = playback;

    const ws = new HuddleAudioWs({
      wsUrl: relayWsUrl(),
      ephemeralChannelId: ephChanId,
      onPeers: (peers) => setState((s) => ({ ...s, peers })),
      onFrame: (frame) => void playback.handleFrame(frame),
      onError: (msg) => setState((s) => ({ ...s, error: msg })),
      onClose: () =>
        setState((s) =>
          s.phase === "active" ? { ...s, error: "Audio connection lost" } : s,
        ),
    });
    audioWsRef.current = ws;

    if (audioCtx.state === "suspended") await audioCtx.resume();
    await ws.connect();

    worklet.port.onmessage = (evt: MessageEvent<{ type: string; buffer: ArrayBuffer }>) => {
      if (evt.data.type !== "frame") return;
      const pcm = new Float32Array(evt.data.buffer);
      const dbov = pcmToDbov(pcm);
      const ts = tsRef.current;
      void encoderRef.current!.encode(pcm, ts).then((opus) => ws.sendFrame(opus, ts, dbov));
      setState((s) => ({ ...s, micLevel: Math.max(0, Math.min(1, (dbov + 90) / 90)) }));
      tsRef.current += 960;
    };

    unsubRef.current = subscribeHuddleReactions(ephChanId, (r) =>
      setState((s) => ({ ...s, reactions: [...s.reactions.slice(-19), r] })),
    );
  }, []);
```


```tsx
// continued...

  const startHuddle = useCallback(async (parentChanId: string) => {
    const ephChanId = crypto.randomUUID();
    setState((s) => ({ ...s, phase: "connecting", error: null, parentChannelId: parentChanId, ephemeralChannelId: ephChanId }));
    try {
      const signed = await signNostrEvent({
        kind: KIND_HUDDLE_STARTED,
        content: JSON.stringify({ ephemeral_channel_id: ephChanId }),
        tags: [["h", parentChanId]],
      });
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      await startPipeline(parentChanId, ephChanId);
      setState((s) => ({ ...s, phase: "active" }));
    } catch (e) {
      await cleanup();
      setState((s) => ({
        ...s, phase: "idle", parentChannelId: null, ephemeralChannelId: null,
        error: e instanceof Error ? e.message : "Failed to start huddle",
      }));
    }
  }, [startPipeline, cleanup]);

  const joinHuddle = useCallback(async (parentChanId: string, ephChanId: string) => {
    setState((s) => ({ ...s, phase: "connecting", error: null, parentChannelId: parentChanId, ephemeralChannelId: ephChanId }));
    try {
      await startPipeline(parentChanId, ephChanId);
      setState((s) => ({ ...s, phase: "active" }));
    } catch (e) {
      await cleanup();
      setState((s) => ({
        ...s, phase: "idle", parentChannelId: null, ephemeralChannelId: null,
        error: e instanceof Error ? e.message : "Failed to join huddle",
      }));
    }
  }, [startPipeline, cleanup]);

  const leaveHuddle = useCallback(async () => {
    setState((s) => ({ ...s, phase: "leaving" }));
    await cleanup();
    setState(INITIAL);
  }, [cleanup]);

  const setMuted = useCallback((v: boolean) => {
    workletRef.current?.port.postMessage({ type: "mute", value: v });
    setState((s) => ({ ...s, muted: v }));
  }, []);

  const sendReaction = useCallback(async (emoji: string, senderName: string) => {
    const { ephemeralChannelId } = state;
    if (ephemeralChannelId) await publishHuddleReaction(emoji, ephemeralChannelId, senderName);
  }, [state]);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  useEffect(() => {
    const h = () => void cleanup();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cleanup]);

  const value: HuddleCtx = {
    ...state, startHuddle, joinHuddle, leaveHuddle, setMuted, sendReaction, clearError,
  };
  return <HuddleContext.Provider value={value}>{children}</HuddleContext.Provider>;
}

export function useHuddle(): HuddleCtx {
  const ctx = useContext(HuddleContext);
  if (!ctx) throw new Error("useHuddle must be used inside HuddleProvider");
  return ctx;
}
```


---

### 10. `HuddleBar.tsx`

Fixed bottom bar visible while a huddle is active. Renders when `phase !== "idle"`.

```tsx
// web/src/features/huddle/ui/HuddleBar.tsx

import { Phone, Smile, Users } from "lucide-react";
import { useState } from "react";
import { useHuddle } from "../HuddleContext";
import { MicControls } from "./MicControls";
import { HuddleParticipants } from "./HuddleParticipants";

const EMOJIS = ["thumbsup", "heart", "joy", "tada", "fire", "clap", "bulb", "rocket"];
const EMOJI_CHARS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "💡", "🚀"];

export function HuddleBar() {
  const { phase, leaveHuddle, sendReaction, reactions } = useHuddle();
  const [showP, setShowP] = useState(false);
  const [showR, setShowR] = useState(false);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-t border-black/10 bg-white px-4 shadow-xl dark:border-white/10 dark:bg-[#111]">
      <div className="w-48 text-xs text-black/40 dark:text-white/40 truncate">
        {phase === "connecting" ? "Connecting..." : "In huddle"}
      </div>

      <div className="flex items-center gap-2">
        <MicControls />

        <div className="relative">
          <button type="button" onClick={() => setShowR((v) => !v)}
            className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Send reaction">
            <Smile className="h-4 w-4" />
          </button>
          {showR && (
            <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl border border-black/10 bg-white px-3 py-2 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
              <div className="flex gap-1">
                {EMOJI_CHARS.map((e) => (
                  <button key={e} type="button"
                    onClick={() => { void sendReaction(e, "user"); setShowR(false); }}
                    className="rounded p-1 text-xl hover:bg-black/5 dark:hover:bg-white/5">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => setShowP((v) => !v)}
            className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Participants">
            <Users className="h-4 w-4" />
          </button>
          {showP && <HuddleParticipants onClose={() => setShowP(false)} />}
        </div>

        <button type="button" onClick={() => void leaveHuddle()} disabled={phase === "leaving"}
          className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          aria-label="Leave huddle">
          <Phone className="h-4 w-4 rotate-[135deg]" />
          Leave
        </button>
      </div>

      <div className="flex w-48 justify-end gap-1 overflow-hidden">
        {reactions.slice(-5).map((r, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className="animate-bounce text-xl">{r.emoji}</span>
        ))}
      </div>
    </div>
  );
}
```


---

### 11. `MicControls.tsx`

```tsx
// web/src/features/huddle/ui/MicControls.tsx

import { Mic, MicOff } from "lucide-react";
import { useHuddle } from "../HuddleContext";

export function MicControls() {
  const { muted, setMuted, micLevel } = useHuddle();
  return (
    <div className="flex items-center gap-1">
      <div className="flex h-5 w-10 items-end gap-px overflow-hidden rounded">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex-1 rounded-sm transition-all duration-75"
            style={{
              backgroundColor: micLevel > i / 8
                ? (micLevel > 0.7 ? "#ef4444" : micLevel > 0.4 ? "#f59e0b" : "#22c55e")
                : "currentColor",
              opacity: micLevel > i / 8 ? 1 : 0.15,
              height: ((i + 1) * 12.5) + "%",
            }} />
        ))}
      </div>
      <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}
        className={"rounded-full p-2 transition-colors " + (muted
          ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
          : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")}>
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
    </div>
  );
}
```

---

### 12. `HuddleParticipants.tsx`

```tsx
// web/src/features/huddle/ui/HuddleParticipants.tsx

import { X } from "lucide-react";
import { useHuddle } from "../HuddleContext";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";

function ParticipantRow({ peerIndex, pubkey }: { peerIndex: number; pubkey: string }) {
  const { activeSpeakerIndexes } = useHuddle();
  const profile = useProfile(pubkey);
  const name = profile?.name ?? pubkey.slice(0, 8);
  const speaking = activeSpeakerIndexes.includes(peerIndex);
  return (
    <div className={"flex items-center gap-2 rounded-md px-2 py-1.5 " + (speaking ? "bg-green-500/10" : "")}>
      <div className={speaking ? "ring-2 ring-green-400 ring-offset-1 rounded-full" : ""}>
        <Avatar src={profile?.picture} name={name} size={28} />
      </div>
      <span className="text-sm text-black dark:text-white">{name}</span>
      {speaking && <span className="ml-auto text-xs text-green-500">speaking</span>}
    </div>
  );
}

export function HuddleParticipants({ onClose }: { onClose: () => void }) {
  const { peers } = useHuddle();
  return (
    <div className="absolute bottom-full right-0 mb-2 w-52 rounded-xl border border-black/10 bg-white py-2 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
          Participants -- {peers.length}
        </span>
        <button type="button" onClick={onClose}
          className="rounded p-0.5 text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white">
          <X className="h-3 w-3" />
        </button>
      </div>
      {peers.map((p) => (
        <ParticipantRow key={p.peerIndex} peerIndex={p.peerIndex} pubkey={p.pubkey} />
      ))}
    </div>
  );
}
```


---

### 13. `HuddleAttachment.tsx`

Renders in the channel timeline when a KIND_HUDDLE_STARTED (48100) event is received.

```tsx
// web/src/features/huddle/ui/HuddleAttachment.tsx

import { Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { useHuddle } from "../HuddleContext";
import {
  reconstructHuddleLifecycle, parseEphemeralChannelId,
  subscribeHuddleLifecycle, type LifecycleEvent,
} from "../lib/huddleLifecycle";
import { isHuddleStale } from "../lib/huddleCardState";

interface Props {
  channelId: string;
  startedEventContent: string;
  startedEventTags: string[][];
  startedAt: number;
  startedEventId: string;
  startedEventPubkey: string;
}

export function HuddleAttachment({ channelId, startedEventContent, startedEventTags, startedAt, startedEventId, startedEventPubkey }: Props) {
  const { phase, joinHuddle, ephemeralChannelId: activeEph } = useHuddle();
  const [events, setEvents] = useState<LifecycleEvent[]>([{
    kind: 48100, content: startedEventContent, tags: startedEventTags,
    pubkey: startedEventPubkey, created_at: startedAt, id: startedEventId,
  }]);

  const ephId = parseEphemeralChannelId(startedEventContent);
  const lifecycle = ephId ? reconstructHuddleLifecycle(events, channelId) : null;
  const ended = lifecycle?.ended ?? false;
  const count = lifecycle?.participants.size ?? 0;
  const stale = isHuddleStale(startedAt);
  const isIn = activeEph === ephId;
  const canJoin = !ended && !stale && !isIn && phase === "idle";

  useEffect(() => {
    if (!ephId) return;
    const store: LifecycleEvent[] = [...events];
    return subscribeHuddleLifecycle(channelId, store, setEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ephId, channelId]);

  return (
    <div className="my-1 flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full " + (ended ? "bg-black/10 dark:bg-white/10" : "bg-green-500/10")}>
        <Headphones className={"h-4 w-4 " + (ended ? "text-black/40 dark:text-white/40" : "text-green-500")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          {ended ? "Huddle - Ended" : "Huddle - In progress"}
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          {count} participant{count !== 1 ? "s" : ""}{stale && !ended ? " - expired" : ""}
        </p>
      </div>
      {canJoin && (
        <button type="button" onClick={() => void joinHuddle(channelId, ephId!)}
          className="shrink-0 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600">
          Join
        </button>
      )}
      {isIn && (
        <span className="shrink-0 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400">
          Joined
        </span>
      )}
    </div>
  );
}
```


---

### 14. `HuddleIndicator.tsx`

Headphone icon in the channel header. Click to start or join. Shows participant count badge when a huddle is active.

```tsx
// web/src/features/huddle/ui/HuddleIndicator.tsx

import { Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { useHuddle } from "../HuddleContext";
import {
  reconstructHuddleLifecycle, subscribeHuddleLifecycle, type LifecycleEvent,
} from "../lib/huddleLifecycle";
import { isHuddleStale } from "../lib/huddleCardState";

export function HuddleIndicator({ channelId }: { channelId: string }) {
  const { phase, startHuddle, joinHuddle, ephemeralChannelId: activeEph } = useHuddle();
  const [events, setEvents] = useState<LifecycleEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    const store: LifecycleEvent[] = [];
    const unsub = subscribeHuddleLifecycle(channelId, store, setEvents);
    return () => { unsub(); setEvents([]); };
  }, [channelId]);

  const lifecycle = reconstructHuddleLifecycle(events, channelId);
  const active = lifecycle && !lifecycle.ended && !isHuddleStale(lifecycle.startedAt)
    ? lifecycle : null;

  const handleClick = () => {
    if (phase !== "idle") return;
    if (active) void joinHuddle(channelId, active.ephemeralChannelId);
    else void startHuddle(channelId);
  };

  const isInThis = active && activeEph === active.ephemeralChannelId;

  return (
    <button type="button" onClick={handleClick}
      disabled={phase !== "idle" && !isInThis}
      title={active ? "Join huddle (" + active.participants.size + " in)" : "Start a huddle"}
      className={"relative rounded p-1.5 transition-colors disabled:opacity-40 " + (
        active
          ? "text-green-500 hover:bg-green-500/10"
          : "text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
      )}
      aria-label={active ? "Join huddle" : "Start huddle"}>
      <Headphones className="h-4 w-4" />
      {active && active.participants.size > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">
          {active.participants.size}
        </span>
      )}
    </button>
  );
}
```

---

## Wiring into Existing Files

### `_workspace.tsx`

```tsx
import { HuddleProvider } from "@/features/huddle/HuddleContext";
import { HuddleBar } from "@/features/huddle/ui/HuddleBar";

// Inside WorkspaceLayout return, wrap with HuddleProvider:
return (
  <OnboardingGate>
    <HuddleProvider>
      <ProfilePanelProvider>
        <WorkspaceLayoutInner ... />
        <HuddleBar />
      </ProfilePanelProvider>
    </HuddleProvider>
  </OnboardingGate>
);
```

### `ChannelView.tsx`

```tsx
import { HuddleIndicator } from "@/features/huddle/ui/HuddleIndicator";
import { HuddleAttachment } from "@/features/huddle/ui/HuddleAttachment";
import { KIND_HUDDLE_STARTED } from "@/shared/constants/kinds";

// In channel header buttons (e.g. next to search/settings):
<HuddleIndicator channelId={channelId} />

// In message render, intercept KIND_HUDDLE_STARTED:
if (message.kind === KIND_HUDDLE_STARTED) {
  return (
    <HuddleAttachment
      channelId={channelId}
      startedEventContent={message.content}
      startedEventTags={message.tags}
      startedAt={message.createdAt}
      startedEventId={message.id}
      startedEventPubkey={message.pubkey}
    />
  );
}
```

### `kinds.ts`

Add if not already present:

```ts
export const KIND_HUDDLE_STARTED = 48100;
export const KIND_HUDDLE_PARTICIPANT_JOINED = 48101;
export const KIND_HUDDLE_PARTICIPANT_LEFT = 48102;
export const KIND_HUDDLE_ENDED = 48103;
export const KIND_HUDDLE_REACTION = 24810;
```

---

## Package additions

```sh
pnpm --filter lenos-web add @opus-codec/wasm
```

This is a dynamic import (lazy loaded) only when WebCodecs audio is unavailable. Chrome/Edge 94+ and Safari 17.4+ use the native WebCodecs path and never touch the WASM bundle.

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| AudioWorklet | 66+ | 76+ | 14.1+ |
| AudioEncoder/Decoder (WebCodecs) | 94+ | No | 17.4+ |
| WASM fallback (`@opus-codec/wasm`) | Yes | Yes | Yes |
| getUserMedia | Yes | Yes | Yes |
| navigator.registerProtocolHandler | Yes | Yes | No |

Firefox always uses the WASM codec path. All other audio and WS infrastructure is browser-agnostic.

---

## Parity Gaps vs Desktop

| Desktop feature | Web status | Notes |
|---|---|---|
| Voice Activity Detection (Earshot) | Energy-based only | Good enough for v1 |
| STT / live transcription | Phase 2 | `window.SpeechRecognition` |
| TTS agent responses | Phase 2 | `window.speechSynthesis` |
| PTT global shortcut | Tab-focus only | `keydown` on `document` |
| Output device selection | Chrome only | `AudioContext.setSinkId` |
| Gain / echo control | Same | AudioWorklet GainNode |
| Multiple input devices | Same | `enumerateDevices` |

---

## Implementation Order

1. `huddleCapture.worklet.ts` + Vite entry (mic capture)
2. `huddleCodec.ts` (Opus encode/decode -- WebCodecs, then verify with test tones)
3. `huddleAudioWs.ts` (WS connect + NIP-42 auth)
4. `huddlePlayback.ts` (decode + schedule per peer)
5. `HuddleContext.tsx` (wire everything, verify round-trip audio)
6. `HuddleBar.tsx` + `MicControls.tsx` (controls UI)
7. `HuddleIndicator.tsx` (start/join from channel header)
8. `HuddleAttachment.tsx` (timeline card with live participant count)
9. Wire into `_workspace.tsx` + `ChannelView.tsx`
10. Phase 2: STT via WebSpeech, TTS via speechSynthesis, output device selector

---

## Known Limitations

- **No global PTT**: `Ctrl+Space` only works when the browser tab has focus. Add an in-bar hold-button for mouse users.
- **AudioContext autoplay policy**: Browsers start `AudioContext` suspended until a user gesture. `startPipeline` calls `ctx.resume()` inside the user-triggered click path -- satisfies the policy correctly.
- **Tab close**: `beforeunload` fires `cleanup()` but the relay may not receive a graceful WS close before the page unloads. The relay must treat abrupt disconnects as a leave after a short TTL and emit KIND_HUDDLE_PARTICIPANT_LEFT (48102) server-side.
- **Single-tab enforcement**: Two tabs in the same huddle produce two mic streams from the same pubkey. Consider a `BroadcastChannel`-based single-tab guard in `HuddleContext.tsx`.
- **HTTPS required**: `getUserMedia` and `AudioWorklet` require a secure context (`https://` or `localhost`).
