/**
 * Desktop VP8 video relay over WebSocket.
 *
 * Wire frame format v2 (46-byte header, spec §Feature1):
 *   [0]     version   u8 = 0x02
 *   [1:3]   seq       u16 BE
 *   [3:11]  pts_us    u64 BE (microseconds since capture start)
 *   [11]    flags     u8  (0x01=keyframe, 0x02=last_fragment, 0x04=screen_share)
 *   [12]    reserved  u8 = 0x00
 *   [13:45] sender_pk [u8;32] own Nostr pubkey
 *   [45]    reserved  u8 = 0x00
 *   [46:]   VP8 payload (max 60 KB per fragment)
 *
 * v1 wire format (14-byte header) is accepted on receive for backward compat.
 *
 * NIP-42 auth uses signRelayEvent (Tauri invoke) to sign the challenge.
 * Relay URL comes from getRelayWsUrl (Tauri invoke).
 * Own pubkey comes from invoke("get_identity").
 */

import { invoke } from "@tauri-apps/api/core";
import { getRelayWsUrl, signRelayEvent } from "@/shared/api/tauri";

const MAX_FRAGMENT_BYTES = 60 * 1024;
const VIDEO_BITRATE = 500_000;
const KEYFRAME_INTERVAL = 60; // frames
const HANDSHAKE_TIMEOUT_MS = 5_000;
const VIDEO_HDR_V1 = 14;
const VIDEO_HDR_V2 = 46;

export const FLAG_KEYFRAME = 0x01;
export const FLAG_LAST_FRAGMENT = 0x02;
export const FLAG_SCREEN_SHARE = 0x04;

export type VideoFramePayload = {
  seq: number;
  pts_us: number;
  flags: number;
  data: Uint8Array;
  senderPubkey: string;
};

export type VideoPublisherInfo = { pubkey: string; mode: "camera" | "screen" };

// ── Module-level frame bus ─────────────────────────────────────────────────────

const frameHandlers = new Set<(frame: VideoFramePayload) => void>();

export function onVideoFrame(
  handler: (frame: VideoFramePayload) => void,
): () => void {
  frameHandlers.add(handler);
  return () => {
    frameHandlers.delete(handler);
  };
}

function dispatchVideoFrame(frame: VideoFramePayload): void {
  for (const h of frameHandlers) h(frame);
}

// ── Wire helpers ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function buildHeaderV2(
  seq: number,
  pts_us: number,
  flags: number,
  senderPkBytes: Uint8Array,
): Uint8Array {
  const buf = new ArrayBuffer(VIDEO_HDR_V2);
  const v = new DataView(buf);
  v.setUint8(0, 0x02);
  v.setUint16(1, seq & 0xffff, false);
  v.setBigUint64(3, BigInt(pts_us), false);
  v.setUint8(11, flags);
  v.setUint8(12, 0);
  new Uint8Array(buf, 13, 32).set(senderPkBytes);
  v.setUint8(45, 0);
  return new Uint8Array(buf);
}

// ── NIP-42 auth ────────────────────────────────────────────────────────────────

async function nip42Auth(ws: WebSocket, relayUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("video WS NIP-42 handshake timed out"));
    }, HANDSHAKE_TIMEOUT_MS);

    ws.onmessage = async (event) => {
      try {
        if (typeof event.data !== "string") return;
        const msg = JSON.parse(event.data) as {
          type: string;
          challenge?: string;
          message?: string;
          publishers?: VideoPublisherInfo[];
        };
        if (msg.type === "challenge" && msg.challenge) {
          const authEvent = await signRelayEvent({
            kind: 22242,
            content: "",
            tags: [
              ["relay", relayUrl],
              ["challenge", msg.challenge],
            ],
          });
          ws.send(JSON.stringify({ type: "auth", event: authEvent }));
        } else if (msg.type === "joined") {
          clearTimeout(timer);
          resolve();
        } else if (msg.type === "error") {
          clearTimeout(timer);
          reject(new Error(`video WS auth error: ${msg.message ?? ""}`));
        }
      } catch (e) {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("video WS connection error"));
    };
  });
}

// ── Main class ─────────────────────────────────────────────────────────────────

export class HuddleVideoWs {
  private ws: WebSocket | null = null;
  private encoder: VideoEncoder | null = null;
  private stream: MediaStream | null = null;
  private seq = 0;
  private frameCount = 0;
  private startTime = 0;
  private stopped = false;
  private senderPkBytes: Uint8Array | null = null;
  private currentPublishers: VideoPublisherInfo[] = [];
  // per-sender fragment reassembly: senderPubkey → (seq → fragments[])
  private fragmentBuffers = new Map<string, Map<number, Uint8Array[]>>();

  constructor(
    private readonly onStop: () => void,
    private readonly onPublishersUpdate?: (pubs: VideoPublisherInfo[]) => void,
  ) {}

  getLocalStream(): MediaStream | null {
    return this.stream;
  }

  async startScreenShare(channelId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
    });
    this.stream = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => this.stop());
    await this.connect(channelId, stream, true);
  }

  async startCameraShare(channelId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { frameRate: 30 },
      audio: false,
    });
    this.stream = stream;
    await this.connect(channelId, stream, false);
  }

  private async connect(
    channelId: string,
    stream: MediaStream,
    isScreenShare: boolean,
  ): Promise<void> {
    if (typeof VideoEncoder === "undefined") {
      throw new Error(
        "WebCodecs VideoEncoder not available in this environment",
      );
    }

    // Cache own pubkey for v2 header
    if (!this.senderPkBytes) {
      try {
        const identity = await invoke<{ pubkey: string }>("get_identity");
        this.senderPkBytes = hexToBytes(identity.pubkey);
      } catch {
        this.senderPkBytes = new Uint8Array(32); // fallback zeros — relay will reject on pk mismatch
      }
    }

    const relayUrl = await getRelayWsUrl();
    const wsUrl = `${relayUrl}/huddle/${channelId}/video`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        nip42Auth(ws, relayUrl).then(resolve).catch(reject);
      };
      ws.onerror = () => reject(new Error("video WS connect failed"));
    });

    // After handshake: seed publishers from joined message (nip42Auth resolved after joined)
    // Parse the last onmessage payload captured during auth
    // Switch to runtime message handler
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleRemoteFrame(event.data);
      } else if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;
          this.handleCtrlMessage(msg);
        } catch {
          // ignore malformed text
        }
      }
    };
    ws.onclose = () => {
      if (!this.stopped) this.stop();
    };

    this.startEncoder(stream, isScreenShare);
  }

  private handleCtrlMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    if (type === "video_started") {
      const pubkey = msg.pubkey as string;
      const mode = (msg.mode === "screen" ? "screen" : "camera") as
        | "camera"
        | "screen";
      this.currentPublishers = [
        ...this.currentPublishers.filter((p) => p.pubkey !== pubkey),
        { pubkey, mode },
      ];
      this.onPublishersUpdate?.([...this.currentPublishers]);
    } else if (type === "video_started_batch") {
      const pubs = (msg.publishers as VideoPublisherInfo[] | undefined) ?? [];
      this.currentPublishers = pubs;
      this.onPublishersUpdate?.(pubs);
    } else if (type === "video_stopped") {
      const pubkey = msg.pubkey as string;
      this.currentPublishers = this.currentPublishers.filter(
        (p) => p.pubkey !== pubkey,
      );
      this.onPublishersUpdate?.([...this.currentPublishers]);
    } else if (type === "joined") {
      const pubs = (msg.publishers as VideoPublisherInfo[] | undefined) ?? [];
      this.currentPublishers = pubs;
      this.onPublishersUpdate?.(pubs);
    }
  }

  private startEncoder(stream: MediaStream, isScreenShare: boolean): void {
    const track = stream.getVideoTracks()[0];
    // Dimensions from track settings — never hardcoded
    const settings = track.getSettings();
    const width = settings.width ?? 1280;
    const height = settings.height ?? 720;

    this.encoder = new VideoEncoder({
      output: (chunk) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        const isKey = chunk.type === "key";
        const pts_us = chunk.timestamp;

        const payload = new Uint8Array(chunk.byteLength);
        chunk.copyTo(payload);

        const senderPk = this.senderPkBytes ?? new Uint8Array(32);

        let offset = 0;
        while (offset < payload.length) {
          const end = Math.min(offset + MAX_FRAGMENT_BYTES, payload.length);
          const slice = payload.subarray(offset, end);
          const isLast = end >= payload.length;
          let flags = 0;
          if (isKey && offset === 0) flags |= FLAG_KEYFRAME;
          if (isLast) flags |= FLAG_LAST_FRAGMENT;
          if (isScreenShare) flags |= FLAG_SCREEN_SHARE;
          const header = buildHeaderV2(
            this.seq & 0xffff,
            pts_us,
            flags,
            senderPk,
          );
          const wire = new Uint8Array(VIDEO_HDR_V2 + slice.length);
          wire.set(header, 0);
          wire.set(slice, VIDEO_HDR_V2);
          this.ws?.send(wire.buffer);
          this.seq = (this.seq + 1) & 0xffff;
          offset = end;
        }
      },
      error: (e) => console.error("[huddle] VP8 encode:", e),
    });

    this.encoder.configure({
      codec: "vp8",
      width,
      height,
      bitrate: VIDEO_BITRATE,
      framerate: 30,
    });

    this.startTime = performance.now();
    this.frameCount = 0;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    void video.play();

    const captureFrame = () => {
      if (this.stopped || !this.encoder || this.encoder.state === "closed")
        return;
      const pts_us = Math.round((performance.now() - this.startTime) * 1000);
      const keyFrameType =
        this.frameCount % KEYFRAME_INTERVAL === 0 ? "key" : "delta";
      try {
        const frame = new VideoFrame(video, { timestamp: pts_us });
        this.encoder?.encode(frame, { keyFrame: keyFrameType === "key" });
        frame.close();
      } catch {
        // frame may be invalid before video starts
      }
      this.frameCount++;
      if (!this.stopped) {
        setTimeout(captureFrame, 1000 / 30);
      }
    };
    video.addEventListener("playing", captureFrame, { once: true });
  }

  private handleRemoteFrame(data: ArrayBuffer): void {
    if (data.byteLength < VIDEO_HDR_V1) return;
    const view = new DataView(data);
    const version = view.getUint8(0);

    let seq: number;
    let pts_us: number;
    let flags: number;
    let senderPubkey: string;
    let payload: Uint8Array;

    if (version === 0x02 && data.byteLength >= VIDEO_HDR_V2) {
      seq = view.getUint16(1, false);
      pts_us = Number(view.getBigUint64(3, false));
      flags = view.getUint8(11);
      const pkBytes = new Uint8Array(data, 13, 32);
      senderPubkey = Array.from(pkBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      payload = new Uint8Array(data, VIDEO_HDR_V2);
    } else {
      // v1 fallback
      seq = view.getUint16(0, false);
      pts_us = Number(view.getBigUint64(2, false));
      flags = view.getUint8(10);
      senderPubkey = "unknown";
      payload = new Uint8Array(data, VIDEO_HDR_V1);
    }

    if (!this.fragmentBuffers.has(senderPubkey)) {
      this.fragmentBuffers.set(senderPubkey, new Map());
    }
    const buf =
      this.fragmentBuffers.get(senderPubkey) ?? new Map<number, Uint8Array[]>();
    if (!buf.has(seq)) buf.set(seq, []);
    buf.get(seq)?.push(new Uint8Array(payload));

    if ((flags & FLAG_LAST_FRAGMENT) !== 0) {
      const fragments = buf.get(seq) ?? [];
      buf.delete(seq);
      const totalLen = fragments.reduce((a, f) => a + f.length, 0);
      const complete = new Uint8Array(totalLen);
      let off = 0;
      for (const frag of fragments) {
        complete.set(frag, off);
        off += frag.length;
      }
      dispatchVideoFrame({ seq, pts_us, flags, data: complete, senderPubkey });
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.encoder?.close();
    } catch {
      /* already closed */
    }
    this.stream?.getTracks().forEach((t) => {
      t.stop();
    });
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.close();
    this.onStop();
  }
}
