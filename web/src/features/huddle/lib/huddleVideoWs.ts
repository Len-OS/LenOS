import { signNostrEvent, getCurrentPubkey } from "@/shared/lib/nostr-signer";

const VIDEO_HDR_V1 = 14;
const VIDEO_HDR_V2 = 46;
const MAX_FRAGMENT = 60 * 1024;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VideoFramePayload {
  seq: number;
  pts_us: number;
  flags: number;
  data: Uint8Array;
  senderPubkey: string;
}

export type VideoPublisherInfo = { pubkey: string; mode: "camera" | "screen" };

export interface HuddleVideoWsOptions {
  wsUrl: string;
  ephemeralChannelId: string;
  onPublishersUpdate: (publishers: VideoPublisherInfo[]) => void;
  onClose?: () => void;
}

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

interface ParsedFrame {
  seq: number;
  pts_us: number;
  flags: number;
  senderPubkey: string;
  payload: Uint8Array;
}

function parseIncomingFrame(data: ArrayBuffer): ParsedFrame | null {
  if (data.byteLength < VIDEO_HDR_V1) return null;
  const v = new DataView(data);
  const version = v.getUint8(0);
  if (version === 0x02 && data.byteLength >= VIDEO_HDR_V2) {
    const seq = v.getUint16(1, false);
    const pts_us = Number(v.getBigUint64(3, false));
    const flags = v.getUint8(11);
    const senderPkBytes = new Uint8Array(data, 13, 32);
    const senderPubkey = Array.from(senderPkBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const payload = new Uint8Array(data, VIDEO_HDR_V2);
    return { seq, pts_us, flags, senderPubkey, payload };
  }
  // v1 fallback
  const seq = v.getUint16(0, false);
  const pts_us = Number(v.getBigUint64(2, false));
  const flags = v.getUint8(10);
  const payload = new Uint8Array(data, VIDEO_HDR_V1);
  return { seq, pts_us, flags, senderPubkey: "unknown", payload };
}

// ── Main class ─────────────────────────────────────────────────────────────────

export class HuddleVideoWs {
  private ws: WebSocket | null = null;
  private closed = false;
  private encoder: VideoEncoder | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private localMediaStream: MediaStream | null = null;
  private seq = 0;
  private senderPkBytes: Uint8Array | null = null;
  private currentPublishers: VideoPublisherInfo[] = [];
  // per-sender fragment reassembly: senderPubkey → (seq → fragments[])
  private fragmentBuffers = new Map<string, Map<number, Uint8Array[]>>();

  getLocalStream(): MediaStream | null {
    return this.localMediaStream;
  }

  constructor(private opts: HuddleVideoWsOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const base = this.opts.wsUrl.replace(/\/$/, "");
      const url = `${base}/huddle/${this.opts.ephemeralChannelId}/video`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Video WS timed out"));
      }, 10_000);

      ws.addEventListener("message", async (evt) => {
        if (typeof evt.data === "string") {
          const msg = JSON.parse(evt.data) as Record<string, unknown>;
          if (msg.type === "challenge") {
            try {
              const signed = await signNostrEvent({
                kind: 22242,
                content: "",
                tags: [
                  ["relay", url],
                  ["challenge", msg.challenge as string],
                ],
              });
              ws.send(JSON.stringify({ type: "auth", event: signed }));
            } catch (e) {
              clearTimeout(timeout);
              ws.close();
              reject(e);
            }
          } else if (msg.type === "joined") {
            clearTimeout(timeout);
            const pubs =
              (msg.publishers as VideoPublisherInfo[] | undefined) ?? [];
            this.currentPublishers = pubs;
            this.opts.onPublishersUpdate([...pubs]);
            resolve();
          } else if (msg.type === "video_started") {
            this.handlePublisherEvent(msg, true);
          } else if (msg.type === "video_started_batch") {
            const pubs =
              (msg.publishers as VideoPublisherInfo[] | undefined) ?? [];
            this.currentPublishers = pubs;
            this.opts.onPublishersUpdate([...pubs]);
          } else if (msg.type === "video_stopped") {
            this.handlePublisherEvent(msg, false);
          } else if (msg.type === "error") {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(String(msg.message ?? "Video join rejected")));
          }
        } else {
          this.handleBinaryFrame(evt.data as ArrayBuffer);
        }
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        this.opts.onClose?.();
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Video WebSocket error"));
      });
    });
  }

  private handlePublisherEvent(
    msg: Record<string, unknown>,
    added: boolean,
  ): void {
    const pubkey = msg.pubkey as string | undefined;
    if (!pubkey) return;
    if (added) {
      const mode = (msg.mode === "screen" ? "screen" : "camera") as
        | "camera"
        | "screen";
      this.currentPublishers = [
        ...this.currentPublishers.filter((p) => p.pubkey !== pubkey),
        { pubkey, mode },
      ];
    } else {
      this.currentPublishers = this.currentPublishers.filter(
        (p) => p.pubkey !== pubkey,
      );
    }
    this.opts.onPublishersUpdate([...this.currentPublishers]);
  }

  private handleBinaryFrame(data: ArrayBuffer): void {
    const parsed = parseIncomingFrame(data);
    if (!parsed) return;
    const { seq, pts_us, flags, senderPubkey, payload } = parsed;

    if (!this.fragmentBuffers.has(senderPubkey)) {
      this.fragmentBuffers.set(senderPubkey, new Map());
    }
    const buf = this.fragmentBuffers.get(senderPubkey);
    if (!buf) return;
    if (!buf.has(seq)) buf.set(seq, []);
    buf.get(seq)?.push(new Uint8Array(payload));

    if ((flags & 0x02) !== 0) {
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

  private async ensureSenderPk(): Promise<Uint8Array> {
    if (this.senderPkBytes) return this.senderPkBytes;
    const pubkeyHex = await getCurrentPubkey();
    if (!pubkeyHex) throw new Error("Cannot get own pubkey for video send");
    this.senderPkBytes = hexToBytes(pubkeyHex);
    return this.senderPkBytes;
  }

  private sendVideoChunk(
    chunk: EncodedVideoChunk,
    isScreenShare: boolean,
    senderPkBytes: Uint8Array,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const isKeyFrame = chunk.type === "key";
    const pts_us = chunk.timestamp; // WebCodecs timestamps are already µs
    const chunkData = new Uint8Array(chunk.byteLength);
    chunk.copyTo(chunkData);

    let offset = 0;
    let firstFragment = true;
    while (offset < chunkData.length) {
      const end = Math.min(offset + MAX_FRAGMENT, chunkData.length);
      const fragment = chunkData.slice(offset, end);
      offset = end;
      const isLast = offset >= chunkData.length;

      let flags = isScreenShare ? 0x04 : 0x00;
      if (isKeyFrame && firstFragment) flags |= 0x01;
      if (isLast) flags |= 0x02;

      const header = buildHeaderV2(
        this.seq & 0xffff,
        pts_us,
        flags,
        senderPkBytes,
      );
      const wire = new Uint8Array(VIDEO_HDR_V2 + fragment.length);
      wire.set(header, 0);
      wire.set(fragment, VIDEO_HDR_V2);
      this.ws.send(wire.buffer);
      this.seq = (this.seq + 1) & 0xffff;
      firstFragment = false;
    }
  }

  private async startCapture(isScreenShare: boolean): Promise<void> {
    if (typeof VideoEncoder === "undefined") {
      throw new Error(
        isScreenShare
          ? "Screen share requires Chrome 94+ or Safari 17.4+"
          : "Camera share requires Chrome 94+ or Safari 17.4+",
      );
    }

    const mediaStream = isScreenShare
      ? await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        })
      : await navigator.mediaDevices.getUserMedia({
          video: { frameRate: { max: 15 } },
          audio: false,
        });

    const [track] = mediaStream.getVideoTracks();
    this.videoTrack = track;
    this.localMediaStream = mediaStream;
    track.addEventListener("ended", () => this.stopCapture());

    // Dimensions from track settings — never hardcoded
    const { width = 1280, height = 720 } = track.getSettings();
    const senderPkBytes = await this.ensureSenderPk();

    let frameCount = 0;
    const encoder = new VideoEncoder({
      output: (chunk) => {
        this.sendVideoChunk(chunk, isScreenShare, senderPkBytes);
      },
      error: (e) => console.error("[HuddleVideoWs]", e),
    });
    encoder.configure({
      codec: "vp8",
      width,
      height,
      bitrate: 500_000,
      framerate: 15,
    });
    this.encoder = encoder;

    const TrackProcessor = (globalThis as Record<string, unknown>)
      .MediaStreamTrackProcessor as
      | (new (opts: {
          track: MediaStreamTrack;
        }) => { readable: ReadableStream<VideoFrame> })
      | undefined;

    if (!TrackProcessor) {
      throw new Error("Requires MediaStreamTrackProcessor (Chrome 94+)");
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

  async startScreenShare(): Promise<void> {
    await this.startCapture(true);
  }

  async startCameraShare(): Promise<void> {
    await this.startCapture(false);
  }

  private stopCapture(): void {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.localMediaStream = null;
    this.encoder?.close();
    this.encoder = null;
  }

  stopScreenShare(): void {
    this.stopCapture();
  }

  stopCameraShare(): void {
    this.stopCapture();
  }

  close(): void {
    this.closed = true;
    this.stopCapture();
    this.ws?.close();
    this.ws = null;
  }
}
