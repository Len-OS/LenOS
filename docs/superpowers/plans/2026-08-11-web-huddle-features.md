# Web Huddle — 4 Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add camera video, STT (Whisper WASM), TTS for agents (Kokoro WASM), and add-agent-dynamically to the web huddle feature, reaching desktop parity.

**Architecture:** Four self-contained features layered onto the existing `HuddleContext` state machine. Camera extends `HuddleVideoWs`. Add-agent (Task 2) adds `isAgent` tracking used by TTS (Task 4). STT and TTS each use a dedicated Web Worker so inference never blocks the audio pipeline.

**Tech Stack:** TypeScript, React 19, Vite 8, `@huggingface/transformers` (Whisper small q8 ~40 MB), `kokoro-js` (Kokoro TTS q8 ~80 MB), nostr-tools, lucide-react, Playwright (E2E only — no unit test runner).

## Global Constraints

- Verification per task: `cd web && pnpm typecheck` must pass; `pnpm build` must produce no errors.
- No unit test framework. Playwright E2E only (`pnpm test:e2e`). Include a manual verification step per task.
- All new files live under `web/src/features/huddle/`.
- Worker files imported via `new Worker(new URL("./workers/file.ts", import.meta.url), { type: "module" })` — Vite handles TypeScript workers natively with this pattern.
- Follow existing patterns: `signNostrEvent` + `getRelayClient(relayWsUrl()).publish()` for Nostr events, `getRelayClient(relayWsUrl()).subscribe()` for subscriptions.
- Active styles in HuddleBar: `"rounded-full p-2 transition-colors"` base class; active = `"bg-<color>-500/20 text-<color>-500"`; inactive = `"text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"`.
- Persist user preferences to `localStorage` (key pattern: `"huddle_<feature>_<setting>"`).
- `PeerInfo` is defined in `lib/huddleAudioWs.ts` — extend there, not in `HuddleContext.tsx`.

---

## Task 1: Camera Video

**Files:**
- Modify: `web/src/features/huddle/lib/huddleVideoWs.ts`
- Modify: `web/src/features/huddle/HuddleContext.tsx`
- Modify: `web/src/features/huddle/ui/HuddleBar.tsx`

**Interfaces:**
- Produces: `HuddleVideoWs.startCameraShare(): Promise<void>`, `HuddleVideoWs.stopCameraShare(): void`; `HuddleCtx.cameraShareActive: boolean`, `HuddleCtx.startCameraShare(): Promise<void>`, `HuddleCtx.stopCameraShare(): void`

---

- [ ] **Step 1: Add `startCameraShare` and `stopCameraShare` to `HuddleVideoWs`**

Open `web/src/features/huddle/lib/huddleVideoWs.ts`.

After the existing `stopScreenShare(): void` method (line ~172), add a `cameraTrack` field alongside the existing `videoTrack` field. Alternatively, reuse the same track field — camera and screen share are mutually exclusive. Add these two methods:

```ts
async startCameraShare(): Promise<void> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Camera share requires Chrome 94+ or Safari 17.4+");
  }

  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { max: 1280 },
      height: { max: 720 },
      frameRate: { max: 15 },
    },
    audio: false,
  });
  const [track] = cameraStream.getVideoTracks();
  this.videoTrack = track;
  track.addEventListener("ended", () => this.stopCameraShare());

  let frameCount = 0;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      void this.sendVideoChunk(chunk, false);
    },
    error: (e) => console.error("[HuddleVideoWs camera]", e),
  });
  encoder.configure({
    codec: "vp8",
    width: 1280,
    height: 720,
    bitrate: 500_000,
    framerate: 15,
  });
  this.encoder = encoder;

  const TrackProcessor = (globalThis as Record<string, unknown>)
    .MediaStreamTrackProcessor as
    | (new (opts: { track: MediaStreamTrack }) => {
        readable: ReadableStream<VideoFrame>;
      })
    | undefined;

  if (!TrackProcessor) {
    throw new Error(
      "Camera share requires MediaStreamTrackProcessor (Chrome 94+)",
    );
  }

  const processor = new TrackProcessor({ track });
  const reader = processor.readable.getReader();
  const readFrames = async () => {
    while (!this.closed && this.encoder) {
      const { done, value: frame } = await reader.read();
      if (done || !frame) break;
      if (encoder.encodeQueueSize <= 2) {
        encoder.encode(frame, { keyFrame: frameCount++ % 60 === 0 });
      }
      frame.close();
    }
  };
  void readFrames();
}

stopCameraShare(): void {
  this.videoTrack?.stop();
  this.videoTrack = null;
  this.encoder?.close();
  this.encoder = null;
}
```

Now refactor `sendVideoChunk` to accept an `isScreenShare: boolean` flag so both screen share and camera can call it:

Change the existing private method signature from:
```ts
private sendVideoChunk(chunk: EncodedVideoChunk): void {
```
to:
```ts
private sendVideoChunk(chunk: EncodedVideoChunk, isScreenShare = true): void {
```

Inside `sendVideoChunk`, change:
```ts
let flags = 0x04; // screen_share
```
to:
```ts
let flags = isScreenShare ? 0x04 : 0x00;
```

Also update the existing `startScreenShare` method's `output` callback to pass `true`:
```ts
output: (chunk) => {
  void this.sendVideoChunk(chunk, true);
},
```

- [ ] **Step 2: Add camera state and actions to `HuddleContext.tsx`**

In `HuddleContext.tsx`:

Add `cameraShareActive: boolean` to `HuddleState`:
```ts
cameraShareActive: boolean;
```

Add to `getInitialState()`:
```ts
cameraShareActive: false,
```

Add to `HuddleActions`:
```ts
startCameraShare(): Promise<void>;
stopCameraShare(): void;
```

Add `startCameraShare` callback (after `stopScreenShare`):
```ts
const startCameraShare = useCallback(async () => {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Camera share requires Chrome 94+ or Safari 17.4+");
  }
  const { ephemeralChannelId } = state;
  if (!ephemeralChannelId) return;

  // Stop screen share if active
  if (state.screenShareActive) {
    videoWsRef.current?.stopScreenShare();
    videoWsRef.current?.close();
    videoWsRef.current = null;
    setState((s) => ({ ...s, screenShareActive: false }));
  }

  const ws = new HuddleVideoWs({
    wsUrl: relayWsUrl(),
    ephemeralChannelId,
    onPresenter: () => {},
    onPresenterLeft: () => {},
  });
  videoWsRef.current = ws;
  await ws.connect();
  await ws.startCameraShare();
  setState((s) => ({ ...s, cameraShareActive: true }));
}, [state]);

const stopCameraShare = useCallback(() => {
  videoWsRef.current?.stopCameraShare();
  videoWsRef.current?.close();
  videoWsRef.current = null;
  setState((s) => ({ ...s, cameraShareActive: false }));
}, []);
```

Add both to the `value` object and `HuddleCtx` type.

- [ ] **Step 3: Add Camera button to `HuddleBar.tsx`**

Add `Video` to the lucide-react import at the top of `HuddleBar.tsx`:
```ts
import { FileText, Keyboard, Monitor, Phone, Smile, Users, Video } from "lucide-react";
```

Destructure from `useHuddle()`:
```ts
cameraShareActive,
startCameraShare,
stopCameraShare,
```

Add the handler alongside `handleScreenShare`:
```ts
const handleCameraShare = () => {
  if (cameraShareActive) {
    stopCameraShare();
  } else {
    void startCameraShare().catch((err: unknown) => {
      console.error("[HuddleBar] camera share failed:", err);
    });
  }
};
```

Add the button after the screen-share button, before the Leave button:
```tsx
{/* Camera share */}
<button
  type="button"
  onClick={handleCameraShare}
  disabled={!cameraShareActive && (screenShareActive || remotePresenterPubkey !== null)}
  aria-label={
    cameraShareActive
      ? "Stop camera"
      : screenShareActive || remotePresenterPubkey !== null
        ? "Presenter slot occupied"
        : "Share camera"
  }
  className={
    "rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
    (cameraShareActive
      ? "bg-purple-500/20 text-purple-500"
      : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
  }
>
  <Video className="h-4 w-4" />
</button>
```

- [ ] **Step 4: Typecheck**

```bash
cd web && pnpm typecheck
```

Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 5: Build**

```bash
cd web && pnpm build
```

Expected: build completes with no errors.

- [ ] **Step 6: Manual verification**

Run `pnpm dev`, open huddle in Chrome 94+. Confirm:
- Camera button appears in HuddleBar
- Camera button disabled while someone else is presenting
- Starting camera opens browser permission dialog
- Stopping camera (button click or browser "Stop sharing") clears `cameraShareActive`
- Revoking permission via browser chrome calls `stopCameraShare`

- [ ] **Step 7: Commit**

```bash
cd web
git add src/features/huddle/lib/huddleVideoWs.ts \
        src/features/huddle/HuddleContext.tsx \
        src/features/huddle/ui/HuddleBar.tsx
git commit -m "feat(web): add camera video to huddle (VP8, flags=0x00, same /video endpoint)"
```

---

## Task 2: Add Agent Dynamically

**Files:**
- Create: `web/src/features/huddle/lib/huddleAgents.ts`
- Create: `web/src/features/huddle/ui/AddAgentDialog.tsx`
- Modify: `web/src/features/huddle/lib/huddleAudioWs.ts` (extend `PeerInfo`)
- Modify: `web/src/features/huddle/HuddleContext.tsx`
- Modify: `web/src/features/huddle/ui/HuddleBar.tsx`

**Interfaces:**
- Consumes: `signNostrEvent`, `getRelayClient`, `relayWsUrl` from shared lib; `useAgents(communityId)` from `features/agents/useAgents`
- Produces: `addAgentToHuddle(agentPubkey, ephChanId, parentChanId): Promise<AgentAddResult>`; `PeerInfo.isAgent?: boolean`; `HuddleCtx.agentPubkeys: string[]`, `HuddleCtx.addAgentDialogOpen: boolean`, `HuddleCtx.setAddAgentDialogOpen(v: boolean): void`, `HuddleCtx.addAgent(pubkey: string): Promise<AgentAddResult>`

---

- [ ] **Step 1: Extend `PeerInfo` in `huddleAudioWs.ts`**

In `web/src/features/huddle/lib/huddleAudioWs.ts`, change:
```ts
export interface PeerInfo {
  peerIndex: number;
  pubkey: string;
}
```
to:
```ts
export interface PeerInfo {
  peerIndex: number;
  pubkey: string;
  isAgent?: boolean;
}
```

- [ ] **Step 2: Create `lib/huddleAgents.ts`**

Create `web/src/features/huddle/lib/huddleAgents.ts`:

```ts
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface AgentAddResult {
  ephemeralAdded: boolean;
  parentAdded: boolean;
  parentError: string | null;
}

const KIND_NIP29_ADD_USER = 9000;

async function publishAddMember(
  channelId: string,
  agentPubkey: string,
): Promise<void> {
  const signed = await signNostrEvent({
    kind: KIND_NIP29_ADD_USER,
    content: "",
    tags: [
      ["h", channelId],
      ["p", agentPubkey, "", "bot"],
    ],
  });
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
}

export async function addAgentToHuddle(
  agentPubkey: string,
  ephemeralChannelId: string,
  parentChannelId: string,
): Promise<AgentAddResult> {
  // Ephemeral channel — required. Propagate failure.
  await publishAddMember(ephemeralChannelId, agentPubkey);

  // Parent channel — best-effort. Capture failure, don't propagate.
  let parentAdded = false;
  let parentError: string | null = null;
  try {
    await publishAddMember(parentChannelId, agentPubkey);
    parentAdded = true;
  } catch (e) {
    parentError = e instanceof Error ? e.message : String(e);
  }

  return { ephemeralAdded: true, parentAdded, parentError };
}
```

- [ ] **Step 3: Create `ui/AddAgentDialog.tsx`**

Create `web/src/features/huddle/ui/AddAgentDialog.tsx`:

```tsx
import { Bot } from "lucide-react";
import { useState } from "react";
import { useAgents } from "@/features/agents/useAgents";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { AgentAddResult } from "../lib/huddleAgents";

interface AddAgentDialogProps {
  parentChannelId: string;
  currentAgentPubkeys: string[];
  onAdd: (pubkey: string) => Promise<AgentAddResult>;
  onClose: () => void;
}

export function AddAgentDialog({
  parentChannelId,
  currentAgentPubkeys,
  onAdd,
  onClose,
}: AddAgentDialogProps) {
  const agents = useAgents(parentChannelId);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const available = agents.filter(
    (a) => a.status === "online" && !currentAgentPubkeys.includes(a.pubkey),
  );

  async function handleAdd(pubkey: string) {
    if (adding) return;
    setAdding(pubkey);
    setError(null);
    setWarning(null);
    try {
      const result = await onAdd(pubkey);
      if (result.parentError) {
        setWarning(
          `Added to huddle, but parent channel add failed: ${result.parentError}`,
        );
      } else {
        onClose();
      }
    } catch (e) {
      setError(`Failed to add agent: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[60vh] max-w-sm flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Add Agent to Huddle</DialogTitle>
          <DialogDescription>
            Select an online agent to join the huddle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {warning && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <span>{warning}</span>
              <button
                className="shrink-0 font-medium underline-offset-2 hover:underline"
                onClick={onClose}
                type="button"
              >
                Dismiss
              </button>
            </div>
          )}

          {available.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {agents.filter((a) => a.status === "online").length > 0
                ? "All online agents are already in this huddle."
                : "No online agents found."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {available.map((agent) => (
                <li key={agent.pubkey}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    disabled={adding === agent.pubkey}
                    onClick={() => void handleAdd(agent.pubkey)}
                    type="button"
                  >
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{agent.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">online</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-6 py-4">
          <Button className="w-full" onClick={onClose} variant="outline">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add agent state and actions to `HuddleContext.tsx`**

Add to `HuddleState`:
```ts
agentPubkeys: string[];
addAgentDialogOpen: boolean;
```

Add to `getInitialState()`:
```ts
agentPubkeys: [],
addAgentDialogOpen: false,
```

Add to `HuddleActions`:
```ts
setAddAgentDialogOpen(v: boolean): void;
addAgent(pubkey: string): Promise<AgentAddResult>;
```

Add imports at the top of `HuddleContext.tsx`:
```ts
import { addAgentToHuddle, type AgentAddResult } from "./lib/huddleAgents";
import { KIND_MANAGED_AGENT } from "@/shared/constants/kinds";
```

Add a ref for the agent pubkeys subscription:
```ts
const agentUnsubRef = useRef<(() => void) | null>(null);
```

In the `cleanup` function, add:
```ts
agentUnsubRef.current?.();
agentUnsubRef.current = null;
```

Add the `setAddAgentDialogOpen` callback:
```ts
const setAddAgentDialogOpen = useCallback(
  (v: boolean) => setState((s) => ({ ...s, addAgentDialogOpen: v })),
  [],
);
```

Add the `addAgent` callback:
```ts
const addAgent = useCallback(
  async (pubkey: string): Promise<AgentAddResult> => {
    const { ephemeralChannelId, parentChannelId } = state;
    if (!ephemeralChannelId || !parentChannelId) {
      return { ephemeralAdded: false, parentAdded: false, parentError: "Not in a huddle" };
    }
    const result = await addAgentToHuddle(pubkey, ephemeralChannelId, parentChannelId);
    if (result.ephemeralAdded) {
      setState((s) => ({
        ...s,
        agentPubkeys: s.agentPubkeys.includes(pubkey)
          ? s.agentPubkeys
          : [...s.agentPubkeys, pubkey],
      }));
    }
    return result;
  },
  [state],
);
```

Subscribe to kind:30177 (managed agents) when a huddle becomes active, to identify which peers are agents. Add inside `startPipeline`, after `ws.connect()` resolves:

```ts
// Subscribe to agent definitions to mark agent peers
agentUnsubRef.current = getRelayClient(relayWsUrl()).subscribe({
  id: `huddle-agents-${ephChanId}`,
  filter: { kinds: [KIND_MANAGED_AGENT], limit: 100 },
  onEvent: (raw) => {
    const agentPubkey = (raw.tags as string[][]).find((t) => t[0] === "d")?.[1];
    if (!agentPubkey) return;
    setState((s) => ({
      ...s,
      agentPubkeys: s.agentPubkeys.includes(agentPubkey)
        ? s.agentPubkeys
        : [...s.agentPubkeys, agentPubkey],
      peers: s.peers.map((p) =>
        p.pubkey === agentPubkey ? { ...p, isAgent: true } : p,
      ),
    }));
  },
});
```

Add both new callbacks to the `value` object and the `HuddleCtx` type.

- [ ] **Step 5: Add Add-Agent button and dialog to `HuddleBar.tsx`**

Add `Bot` to lucide-react import:
```ts
import { Bot, FileText, Keyboard, Monitor, Phone, Smile, Users, Video } from "lucide-react";
```

Destructure from `useHuddle()`:
```ts
agentPubkeys,
addAgentDialogOpen,
setAddAgentDialogOpen,
addAgent,
```

Add the dialog and button (inside the `<>` fragment, alongside `HuddleNotesPanel`):

```tsx
{addAgentDialogOpen && parentChannelId && (
  <AddAgentDialog
    parentChannelId={parentChannelId}
    currentAgentPubkeys={agentPubkeys}
    onAdd={addAgent}
    onClose={() => setAddAgentDialogOpen(false)}
  />
)}
```

Add the button in the button row (after the Notes button):
```tsx
{/* Add agent */}
<button
  type="button"
  onClick={() => setAddAgentDialogOpen(true)}
  aria-label="Add agent to huddle"
  className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
>
  <Bot className="h-4 w-4" />
</button>
```

Add `AddAgentDialog` import:
```ts
import { AddAgentDialog } from "./AddAgentDialog";
```

- [ ] **Step 6: Typecheck and build**

```bash
cd web && pnpm typecheck && pnpm build
```

Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `pnpm dev`. In an active huddle, click the Bot icon. Confirm:
- Dialog opens showing online agents
- Agents already in the huddle are excluded
- Selecting an agent calls `addAgentToHuddle` and publishes kind:9000
- Dialog closes on success; shows warning if parent channel add fails

- [ ] **Step 8: Commit**

```bash
cd web
git add src/features/huddle/lib/huddleAgents.ts \
        src/features/huddle/ui/AddAgentDialog.tsx \
        src/features/huddle/lib/huddleAudioWs.ts \
        src/features/huddle/HuddleContext.tsx \
        src/features/huddle/ui/HuddleBar.tsx
git commit -m "feat(web): add agent dynamically to huddle via NIP-29 kind:9000"
```

---

## Task 3: STT — Live Transcription (Whisper WASM)

**Files:**
- Modify: `web/vite.config.ts` (COOP/COEP headers)
- Create: `web/src/features/huddle/workers/huddleSttWorker.ts`
- Create: `web/src/features/huddle/lib/huddleStt.ts`
- Modify: `web/src/features/huddle/HuddleContext.tsx`
- Modify: `web/src/features/huddle/ui/HuddleBar.tsx`

**Interfaces:**
- Consumes: `pcmToDbov` from `lib/huddleVad` (already imported in `HuddleContext`); `signNostrEvent`, `getRelayClient`, `relayWsUrl`
- Produces: `HuddleStt` class with `feedPcm(pcm: Float32Array, dbov: number): void`, `start(): Promise<void>`, `stop(): void`, `loading: boolean`; `HuddleCtx.sttEnabled: boolean`, `HuddleCtx.sttLoading: boolean`, `HuddleCtx.captions: string[]`, `HuddleCtx.setSttEnabled(v: boolean): void`

---

- [ ] **Step 1: Install `@huggingface/transformers`**

```bash
cd web && pnpm add @huggingface/transformers
```

- [ ] **Step 2: Add COOP/COEP headers to `vite.config.ts`**

`@huggingface/transformers` uses ONNX Runtime WASM. Single-threaded mode (no SharedArrayBuffer) is used by setting `numThreads = 1` in the worker, but headers are still recommended for Safari. Add to `vite.config.ts`:

Inside `defineConfig`, add a `server.headers` block alongside the existing `server.port`:
```ts
server: {
  port: parseInt(process.env.VITE_PORT || "5173", 10),
  strictPort: true,
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
},
```

Also add a `preview.headers` block:
```ts
preview: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
},
```

- [ ] **Step 3: Create the STT Web Worker**

Create `web/src/features/huddle/workers/huddleSttWorker.ts`:

```ts
import { pipeline, env } from "@huggingface/transformers";

// Single-threaded WASM — no SharedArrayBuffer required
env.backends.onnx.wasm.numThreads = 1;

type AnyPipeline = Awaited<ReturnType<typeof pipeline>>;

let transcriber: AnyPipeline | null = null;
let inferencing = false;
const queue: Float32Array[] = [];

async function processQueue(): Promise<void> {
  if (!transcriber) return;
  inferencing = true;
  while (queue.length > 0) {
    const pcm = queue.shift();
    if (!pcm) continue;
    try {
      const result = await (transcriber as (
        input: Float32Array,
        opts: { sampling_rate: number; language: string; return_timestamps: boolean },
      ) => Promise<{ text: string }>)(pcm, {
        sampling_rate: 48000,
        language: "english",
        return_timestamps: false,
      });
      if (result.text.trim()) {
        self.postMessage({ type: "transcript", text: result.text.trim() });
      }
    } catch (e) {
      console.error("[SttWorker]", e);
    }
  }
  inferencing = false;
}

self.onmessage = async (
  evt: MessageEvent<{ type: string; buffer?: ArrayBuffer }>,
) => {
  const { type, buffer } = evt.data;

  if (type === "init") {
    try {
      transcriber = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-small",
        { dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } },
      );
      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: e instanceof Error ? e.message : "STT model load failed",
      });
    }
    return;
  }

  if (type === "pcm" && buffer) {
    queue.push(new Float32Array(buffer));
    if (!inferencing) void processQueue();
  }
};
```

- [ ] **Step 4: Create `lib/huddleStt.ts`**

Create `web/src/features/huddle/lib/huddleStt.ts`:

```ts
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

// 3 seconds of audio at 48 kHz = 144 000 samples = 150 frames at 960 samples/frame
const TARGET_SAMPLES = 48_000 * 3;
// 500 ms silence = 25 frames
const SILENCE_FRAMES = 25;
// Minimum utterance length: 200 ms = 9 600 samples
const MIN_UTTERANCE_SAMPLES = 9_600;
const SILENCE_DBOV_THRESHOLD = -50;
const KIND_STREAM_MESSAGE = 9;

export class HuddleStt {
  private worker: Worker | null = null;
  private buffer = new Float32Array(TARGET_SAMPLES);
  private bufferLen = 0;
  private silenceCount = 0;
  loading = false;

  constructor(
    private readonly parentChannelId: string,
    private readonly onCaption: (text: string) => void,
    private readonly onLoadingChange: (v: boolean) => void,
  ) {}

  async start(): Promise<void> {
    this.loading = true;
    this.onLoadingChange(true);

    this.worker = new Worker(
      new URL("../workers/huddleSttWorker.ts", import.meta.url),
      { type: "module" },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("STT model load timed out after 120s")),
        120_000,
      );

      this.worker!.onmessage = (
        evt: MessageEvent<{ type: string; text?: string; message?: string }>,
      ) => {
        if (evt.data.type === "ready") {
          clearTimeout(timeout);
          this.loading = false;
          this.onLoadingChange(false);
          this.worker!.onmessage = this.handleWorkerMessage.bind(this);
          resolve();
        } else if (evt.data.type === "error") {
          clearTimeout(timeout);
          reject(new Error(evt.data.message ?? "STT init failed"));
        }
      };

      this.worker!.postMessage({ type: "init" });
    });
  }

  private handleWorkerMessage(
    evt: MessageEvent<{ type: string; text?: string }>,
  ): void {
    if (evt.data.type === "transcript" && evt.data.text) {
      this.onCaption(evt.data.text);
      void this.publishTranscript(evt.data.text);
    }
  }

  private async publishTranscript(text: string): Promise<void> {
    try {
      const signed = await signNostrEvent({
        kind: KIND_STREAM_MESSAGE,
        content: text,
        tags: [["h", this.parentChannelId]],
      });
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
    } catch (e) {
      console.error("[HuddleStt] publish failed:", e);
    }
  }

  feedPcm(pcm: Float32Array, dbov: number): void {
    if (!this.worker) return;

    // Accumulate samples
    const toCopy = Math.min(pcm.length, TARGET_SAMPLES - this.bufferLen);
    this.buffer.set(pcm.subarray(0, toCopy), this.bufferLen);
    this.bufferLen += toCopy;

    // Track silence
    if (dbov <= SILENCE_DBOV_THRESHOLD) {
      this.silenceCount++;
    } else {
      this.silenceCount = 0;
    }

    const silenceFlush =
      this.silenceCount >= SILENCE_FRAMES &&
      this.bufferLen >= MIN_UTTERANCE_SAMPLES;
    const fullFlush = this.bufferLen >= TARGET_SAMPLES;

    if (fullFlush || silenceFlush) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.bufferLen < MIN_UTTERANCE_SAMPLES || !this.worker) return;
    const chunk = this.buffer.slice(0, this.bufferLen).buffer;
    this.worker.postMessage({ type: "pcm", buffer: chunk }, [chunk]);
    this.buffer = new Float32Array(TARGET_SAMPLES);
    this.bufferLen = 0;
    this.silenceCount = 0;
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.buffer = new Float32Array(TARGET_SAMPLES);
    this.bufferLen = 0;
    this.silenceCount = 0;
    this.loading = false;
    this.onLoadingChange(false);
  }
}
```

- [ ] **Step 5: Add STT state, actions, and PCM hook to `HuddleContext.tsx`**

Add imports:
```ts
import { HuddleStt } from "./lib/huddleStt";
```

Add to `HuddleState`:
```ts
sttEnabled: boolean;
sttLoading: boolean;
captions: string[];
```

Add to `getInitialState()`:
```ts
sttEnabled: (localStorage.getItem("huddle_stt_enabled") === "true"),
sttLoading: false,
captions: [],
```

Add to `HuddleActions`:
```ts
setSttEnabled(v: boolean): void;
```

Add a ref alongside the other refs:
```ts
const huddleSttRef = useRef<HuddleStt | null>(null);
```

In `cleanup`, add:
```ts
huddleSttRef.current?.stop();
huddleSttRef.current = null;
```

In `startPipeline`, after `setState((s) => ({ ...s, phase: "active" }))` is called in `startHuddle`/`joinHuddle`, STT auto-starts if enabled. To do this cleanly, expose STT start from `startPipeline`. Add at the end of `startPipeline`, after `ws.connect()` succeeds (just before the function returns), return a flag for the caller to start STT:

Actually, the cleanest pattern is: start STT inside `startPipeline` itself when `sttEnabled` is true. Since `state` is captured in closure, read from a ref. Add a `sttEnabledRef`:

```ts
const sttEnabledRef = useRef(
  localStorage.getItem("huddle_stt_enabled") === "true",
);
```

At the end of `startPipeline`, after `unsubRef.current = subscribeHuddleReactions(...)`:

```ts
if (sttEnabledRef.current && _parentChanId) {
  const stt = new HuddleStt(
    _parentChanId,
    (text) => setState((s) => ({ ...s, captions: [...s.captions.slice(-2), text] })),
    (loading) => setState((s) => ({ ...s, sttLoading: loading })),
  );
  huddleSttRef.current = stt;
  void stt.start().catch((e: unknown) => {
    setState((s) => ({
      ...s,
      sttLoading: false,
      error: e instanceof Error ? e.message : "STT failed to start",
    }));
  });
}
```

In the worklet `onmessage` handler, add after the existing `setState` for `micLevel`:
```ts
huddleSttRef.current?.feedPcm(pcm, dbov);
```

Add `setSttEnabled` callback:
```ts
const setSttEnabled = useCallback(
  (v: boolean) => {
    localStorage.setItem("huddle_stt_enabled", String(v));
    sttEnabledRef.current = v;
    setState((s) => ({ ...s, sttEnabled: v, captions: v ? s.captions : [] }));

    if (!v) {
      huddleSttRef.current?.stop();
      huddleSttRef.current = null;
      return;
    }

    // Start STT if huddle is already active
    const { parentChannelId } = state;
    if (state.phase === "active" && parentChannelId && !huddleSttRef.current) {
      const stt = new HuddleStt(
        parentChannelId,
        (text) => setState((s) => ({ ...s, captions: [...s.captions.slice(-2), text] })),
        (loading) => setState((s) => ({ ...s, sttLoading: loading })),
      );
      huddleSttRef.current = stt;
      void stt.start().catch((e: unknown) => {
        setState((s) => ({
          ...s,
          sttLoading: false,
          error: e instanceof Error ? e.message : "STT failed to start",
        }));
      });
    }
  },
  [state],
);
```

Add to `value` and `HuddleCtx` type.

- [ ] **Step 6: Add STT button and caption overlay to `HuddleBar.tsx`**

Add `Subtitles` to lucide-react import:
```ts
import { Bot, FileText, Keyboard, Monitor, Phone, Smile, Subtitles, Users, Video } from "lucide-react";
```

Destructure from `useHuddle()`:
```ts
sttEnabled,
sttLoading,
captions,
setSttEnabled,
```

Add caption overlay just before the main HuddleBar `<div>` (below the video div):
```tsx
{phase === "active" && captions.length > 0 && (
  <div className="fixed bottom-14 left-1/2 z-39 max-w-xl -translate-x-1/2 space-y-0.5 pb-1">
    {captions.map((c, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <p
        key={i}
        className="rounded bg-black/70 px-2 py-0.5 text-center text-xs text-white"
      >
        {c}
      </p>
    ))}
  </div>
)}
```

Add STT toggle button (after the Notes button, before the Screen share button):
```tsx
{/* STT toggle */}
<button
  type="button"
  onClick={() => setSttEnabled(!sttEnabled)}
  aria-label={sttEnabled ? "Disable live transcription" : "Enable live transcription"}
  className={
    "rounded-full p-2 transition-colors " +
    (sttEnabled
      ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
      : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
  }
>
  {sttLoading ? (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  ) : (
    <Subtitles className="h-4 w-4" />
  )}
</button>
```

- [ ] **Step 7: Typecheck and build**

```bash
cd web && pnpm typecheck && pnpm build
```

Expected: no errors. If TypeScript complains about `@huggingface/transformers` types, check the package ships its own `.d.ts` files — it does in v3. If `env.backends.onnx` types are missing, use `// @ts-expect-error` with a comment.

- [ ] **Step 8: Manual verification**

Run `pnpm dev`. In Chrome 94+, join a huddle and click the Subtitles button:
- Button shows spinner while model downloads (~40 MB first time)
- Spinner disappears when model is ready
- Speak into mic — transcript text appears in caption overlay above HuddleBar
- Transcripts are also published as kind:9 to the parent channel (verify in browser devtools Network tab → WS frames)
- Toggling off clears captions and stops the worker

- [ ] **Step 9: Commit**

```bash
cd web
git add vite.config.ts \
        src/features/huddle/workers/huddleSttWorker.ts \
        src/features/huddle/lib/huddleStt.ts \
        src/features/huddle/HuddleContext.tsx \
        src/features/huddle/ui/HuddleBar.tsx \
        package.json pnpm-lock.yaml
git commit -m "feat(web): add STT live transcription to huddle (Whisper small WASM, kind:9 publish)"
```

---

## Task 4: TTS for Agents (Kokoro WASM)

**Files:**
- Create: `web/src/features/huddle/workers/huddleTtsWorker.ts`
- Create: `web/src/features/huddle/lib/huddleTts.ts`
- Modify: `web/src/features/huddle/HuddleContext.tsx`
- Modify: `web/src/features/huddle/ui/HuddleBar.tsx`

**Interfaces:**
- Consumes: `agentPubkeys: string[]` from HuddleContext state (set by Task 2); `ctxRef.current: AudioContext` (set in `startPipeline`); `relayWsUrl`, `getRelayClient`; `dbov` in worklet message handler (already computed)
- Produces: `HuddleTts` class with `start(ephemeralChannelId: string, agentPubkeys: string[], audioCtx: AudioContext): Promise<void>`, `stop(): void`, `onSpeaking(): void`, `updateAgentPubkeys(keys: string[]): void`; `HuddleCtx.ttsEnabled: boolean`, `HuddleCtx.ttsLoading: boolean`, `HuddleCtx.setTtsEnabled(v: boolean): void`

---

- [ ] **Step 1: Install `kokoro-js`**

```bash
cd web && pnpm add kokoro-js
```

- [ ] **Step 2: Create the TTS Web Worker**

Create `web/src/features/huddle/workers/huddleTtsWorker.ts`:

```ts
import { KokoroTTS } from "kokoro-js";

let tts: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;

self.onmessage = async (
  evt: MessageEvent<{ type: string; text?: string }>,
) => {
  const { type, text } = evt.data;

  if (type === "init") {
    try {
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0", {
        dtype: "q8",
      });
      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: e instanceof Error ? e.message : "TTS model load failed",
      });
    }
    return;
  }

  if (type === "speak" && text && tts) {
    try {
      const audio = await tts.generate(text, { voice: "af_heart" });
      const buf = audio.audio.buffer.slice(0) as ArrayBuffer;
      self.postMessage(
        { type: "audio", buffer: buf, sampleRate: audio.sampling_rate },
        [buf],
      );
    } catch (e) {
      console.error("[TtsWorker]", e);
      // Signal completion even on error so the queue advances
      self.postMessage({ type: "audio_error" });
    }
  }
};
```

- [ ] **Step 3: Create `lib/huddleTts.ts`**

Create `web/src/features/huddle/lib/huddleTts.ts`:

```ts
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_STREAM_MESSAGE = 9;

export class HuddleTts {
  private worker: Worker | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private speaking = false;
  private perAgentQueue = new Map<string, string[]>();
  private agentPubkeys: Set<string>;
  private unsub: (() => void) | null = null;
  private audioCtx: AudioContext | null = null;

  constructor(private readonly onLoadingChange: (v: boolean) => void) {
    this.agentPubkeys = new Set();
  }

  async start(
    ephemeralChannelId: string,
    agentPubkeys: string[],
    audioCtx: AudioContext,
  ): Promise<void> {
    this.audioCtx = audioCtx;
    this.agentPubkeys = new Set(agentPubkeys);
    this.onLoadingChange(true);

    this.worker = new Worker(
      new URL("../workers/huddleTtsWorker.ts", import.meta.url),
      { type: "module" },
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("TTS model load timed out after 120s")),
        120_000,
      );

      this.worker!.onmessage = (
        evt: MessageEvent<{
          type: string;
          buffer?: ArrayBuffer;
          sampleRate?: number;
          message?: string;
        }>,
      ) => {
        const { type } = evt.data;
        if (type === "ready") {
          clearTimeout(timeout);
          this.onLoadingChange(false);
          this.worker!.onmessage = this.handleWorkerMessage.bind(this);
          resolve();
        } else if (type === "error") {
          clearTimeout(timeout);
          reject(new Error(evt.data.message ?? "TTS init failed"));
        }
      };

      this.worker!.postMessage({ type: "init" });
    });

    // Subscribe to kind:9 messages from agents in this huddle
    this.unsub = getRelayClient(relayWsUrl()).subscribe({
      id: `huddle-tts-${ephemeralChannelId}`,
      filter: {
        kinds: [KIND_STREAM_MESSAGE],
        "#h": [ephemeralChannelId],
        limit: 0,
      },
      onEvent: (raw) => {
        const pubkey = raw.pubkey as string;
        if (!this.agentPubkeys.has(pubkey)) return;
        const text = (raw.content as string)?.trim();
        if (!text) return;
        if (!this.perAgentQueue.has(pubkey)) {
          this.perAgentQueue.set(pubkey, []);
        }
        this.perAgentQueue.get(pubkey)!.push(text);
        this.dequeue();
      },
    });
  }

  private handleWorkerMessage(
    evt: MessageEvent<{
      type: string;
      buffer?: ArrayBuffer;
      sampleRate?: number;
    }>,
  ): void {
    if (
      (evt.data.type === "audio" && evt.data.buffer && evt.data.sampleRate) ||
      evt.data.type === "audio_error"
    ) {
      if (evt.data.type === "audio" && evt.data.buffer) {
        void this.playAudio(evt.data.buffer, evt.data.sampleRate!);
      } else {
        this.speaking = false;
        this.dequeue();
      }
    }
  }

  private async playAudio(
    buffer: ArrayBuffer,
    sampleRate: number,
  ): Promise<void> {
    if (!this.audioCtx) return;

    const pcm = new Float32Array(buffer);
    const audioBuffer = this.audioCtx.createBuffer(1, pcm.length, sampleRate);
    audioBuffer.copyToChannel(pcm, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);
    this.currentSource = source;

    source.onended = () => {
      this.currentSource = null;
      this.speaking = false;
      this.dequeue();
    };

    source.start();
  }

  private dequeue(): void {
    if (this.speaking || !this.worker) return;
    for (const [, queue] of this.perAgentQueue) {
      const text = queue.shift();
      if (text) {
        this.speaking = true;
        this.worker.postMessage({ type: "speak", text });
        return;
      }
    }
  }

  onSpeaking(): void {
    if (!this.speaking) return;
    try {
      this.currentSource?.stop();
    } catch {
      // Already stopped
    }
    this.currentSource = null;
    this.speaking = false;
    // Drain all queues on barge-in (matches desktop behavior)
    this.perAgentQueue.clear();
  }

  updateAgentPubkeys(keys: string[]): void {
    this.agentPubkeys = new Set(keys);
  }

  stop(): void {
    this.onSpeaking();
    this.unsub?.();
    this.unsub = null;
    this.worker?.terminate();
    this.worker = null;
    this.audioCtx = null;
    this.perAgentQueue.clear();
  }
}
```

- [ ] **Step 4: Add TTS state, actions, and barge-in hook to `HuddleContext.tsx`**

Add import:
```ts
import { HuddleTts } from "./lib/huddleTts";
```

Add to `HuddleState`:
```ts
ttsEnabled: boolean;
ttsLoading: boolean;
```

Add to `getInitialState()`:
```ts
ttsEnabled: (localStorage.getItem("huddle_tts_enabled") === "true"),
ttsLoading: false,
```

Add to `HuddleActions`:
```ts
setTtsEnabled(v: boolean): void;
```

Add refs:
```ts
const huddleTtsRef = useRef<HuddleTts | null>(null);
const ttsEnabledRef = useRef(
  localStorage.getItem("huddle_tts_enabled") === "true",
);
```

In `cleanup`, add:
```ts
huddleTtsRef.current?.stop();
huddleTtsRef.current = null;
```

At the end of `startPipeline`, after the STT auto-start block (Task 3), add:

```ts
if (ttsEnabledRef.current) {
  const tts = new HuddleTts(
    (loading) => setState((s) => ({ ...s, ttsLoading: loading })),
  );
  huddleTtsRef.current = tts;
  const currentAgentPubkeys = agentUnsubRef.current ? [] : []; // will be updated by agentPubkeys state
  void tts.start(ephChanId, currentAgentPubkeys, ctxRef.current!).catch(
    (e: unknown) => {
      setState((s) => ({
        ...s,
        ttsLoading: false,
        error: e instanceof Error ? e.message : "TTS failed to start",
      }));
    },
  );
}
```

In the worklet `onmessage` handler, add alongside the STT feed:
```ts
if (dbov > -40) {
  huddleTtsRef.current?.onSpeaking();
}
```

Keep `agentPubkeys` in sync with `HuddleTts` by updating it whenever `state.agentPubkeys` changes. Add a `useEffect`:
```ts
useEffect(() => {
  huddleTtsRef.current?.updateAgentPubkeys(state.agentPubkeys);
}, [state.agentPubkeys]);
```

Add `setTtsEnabled` callback:
```ts
const setTtsEnabled = useCallback(
  (v: boolean) => {
    localStorage.setItem("huddle_tts_enabled", String(v));
    ttsEnabledRef.current = v;
    setState((s) => ({ ...s, ttsEnabled: v }));

    if (!v) {
      huddleTtsRef.current?.stop();
      huddleTtsRef.current = null;
      return;
    }

    // Start TTS if huddle is already active
    if (
      state.phase === "active" &&
      state.ephemeralChannelId &&
      ctxRef.current &&
      !huddleTtsRef.current
    ) {
      const tts = new HuddleTts(
        (loading) => setState((s) => ({ ...s, ttsLoading: loading })),
      );
      huddleTtsRef.current = tts;
      void tts
        .start(state.ephemeralChannelId, state.agentPubkeys, ctxRef.current)
        .catch((e: unknown) => {
          setState((s) => ({
            ...s,
            ttsLoading: false,
            error: e instanceof Error ? e.message : "TTS failed to start",
          }));
        });
    }
  },
  [state],
);
```

Add to `value` and `HuddleCtx` type.

- [ ] **Step 5: Add TTS toggle button to `HuddleBar.tsx`**

Add `Volume2` and `VolumeX` to lucide-react import:
```ts
import { Bot, FileText, Keyboard, Monitor, Phone, Smile, Subtitles, Users, Video, Volume2, VolumeX } from "lucide-react";
```

Destructure from `useHuddle()`:
```ts
ttsEnabled,
ttsLoading,
setTtsEnabled,
```

Add TTS toggle button (after the STT button, before Screen share):
```tsx
{/* TTS toggle */}
<button
  type="button"
  onClick={() => setTtsEnabled(!ttsEnabled)}
  aria-label={ttsEnabled ? "Disable agent voice" : "Enable agent voice"}
  className={
    "rounded-full p-2 transition-colors " +
    (ttsEnabled
      ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
      : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
  }
>
  {ttsLoading ? (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  ) : ttsEnabled ? (
    <Volume2 className="h-4 w-4" />
  ) : (
    <VolumeX className="h-4 w-4" />
  )}
</button>
```

- [ ] **Step 6: Typecheck and build**

```bash
cd web && pnpm typecheck && pnpm build
```

Expected: no errors. If `kokoro-js` lacks TypeScript types, check its package — it ships `.d.ts`. If not, add `declare module "kokoro-js"` to a `src/types/kokoro-js.d.ts` file with minimal typings:

```ts
declare module "kokoro-js" {
  export class KokoroTTS {
    static from_pretrained(
      model: string,
      opts?: { dtype?: string },
    ): Promise<KokoroTTS>;
    generate(
      text: string,
      opts?: { voice?: string },
    ): Promise<{ audio: Float32Array; sampling_rate: number }>;
  }
}
```

- [ ] **Step 7: Manual verification**

Run `pnpm dev`. In Chrome 94+ with an agent in the huddle:
- Enable TTS toggle — spinner shows while model downloads (~80 MB first time)
- Agent sends a kind:9 message → should be spoken via Kokoro voice
- Speaking into mic cancels agent speech (barge-in)
- Toggling off stops playback and drains queue
- TTS and STT can both be active simultaneously

- [ ] **Step 8: Commit**

```bash
cd web
git add src/features/huddle/workers/huddleTtsWorker.ts \
        src/features/huddle/lib/huddleTts.ts \
        src/features/huddle/HuddleContext.tsx \
        src/features/huddle/ui/HuddleBar.tsx \
        package.json pnpm-lock.yaml
git commit -m "feat(web): add TTS for agents to huddle (Kokoro WASM, barge-in on speech)"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Camera video — Task 1
- [x] STT (Whisper WASM, kind:9 publish, captions overlay) — Task 3
- [x] TTS (Kokoro, per-agent queue, barge-in) — Task 4
- [x] Add agent dynamically (kind:9000 NIP-29, AddAgentDialog) — Task 2
- [x] Build order: Task 2 adds `agentPubkeys` + `isAgent` needed by Task 4 ✓
- [x] COOP/COEP headers for WASM — Task 3 Step 2 ✓
- [x] Worker files use `new Worker(new URL(...), { type: "module" })` ✓
- [x] All localStorage persistence keys documented ✓
- [x] `cleanup()` tears down all new refs ✓
- [x] `startPipeline` auto-starts STT/TTS when pre-enabled ✓
- [x] `setSttEnabled`/`setTtsEnabled` start services mid-huddle when toggled on ✓
- [x] Barge-in: `dbov > -40` in worklet handler → `huddleTtsRef.current?.onSpeaking()` ✓
- [x] `PeerInfo.isAgent` extended in `huddleAudioWs.ts` ✓

**Type consistency:**
- `AgentAddResult` defined in `huddleAgents.ts` and imported in `HuddleContext.tsx` and `AddAgentDialog.tsx` ✓
- `HuddleStt` constructor takes `(parentChannelId, onCaption, onLoadingChange)` — matches Task 3 usage ✓
- `HuddleTts.start(ephemeralChannelId, agentPubkeys, audioCtx)` — matches Task 4 usage ✓
- `HuddleCtx` type extended in each task with new fields ✓
