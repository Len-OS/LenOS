import { signNostrEvent } from "@/shared/lib/nostr-signer";

const VIDEO_HDR = 14;
const MAX_FRAGMENT = 60 * 1024;

export interface HuddleVideoWsOptions {
  wsUrl: string;
  ephemeralChannelId: string;
  onPresenter: (pubkey: string) => void;
  onPresenterLeft: () => void;
  onFrame?: (data: ArrayBuffer) => void;
}

export class HuddleVideoWs {
  private ws: WebSocket | null = null;
  private closed = false;
  private encoder: VideoEncoder | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private seq = 0;

  constructor(private opts: HuddleVideoWsOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const base = this.opts.wsUrl.replace(/\/$/, "");
      const url = base + "/huddle/" + this.opts.ephemeralChannelId + "/video";
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
            resolve();
          } else if (msg.type === "presenter_joined") {
            this.opts.onPresenter(msg.pubkey as string);
          } else if (msg.type === "presenter_left") {
            this.opts.onPresenterLeft();
          } else if (msg.type === "error") {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(String(msg.message ?? "Video join rejected")));
          }
        } else {
          this.opts.onFrame?.(evt.data as ArrayBuffer);
        }
      });

      ws.addEventListener("close", () => {
        this.ws = null;
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Video WebSocket error"));
      });
    });
  }

  async startScreenShare(): Promise<void> {
    if (typeof VideoEncoder === "undefined") {
      throw new Error("Screen share requires Chrome 94+ or Safari 17.4+");
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    const [track] = displayStream.getVideoTracks();
    this.videoTrack = track;
    track.addEventListener("ended", () => this.stopScreenShare());

    let frameCount = 0;
    const encoder = new VideoEncoder({
      output: (chunk) => {
        void this.sendVideoChunk(chunk, true);
      },
      error: (e) => console.error("[HuddleVideoWs]", e),
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
      | (new (opts: {
          track: MediaStreamTrack;
        }) => {
          readable: ReadableStream<VideoFrame>;
        })
      | undefined;

    if (!TrackProcessor) {
      throw new Error(
        "Screen share requires MediaStreamTrackProcessor (Chrome 94+)",
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

  private sendVideoChunk(chunk: EncodedVideoChunk, isScreenShare = true): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const isKeyFrame = chunk.type === "key";
    const pts90k = BigInt(Math.round((chunk.timestamp * 90_000) / 1_000_000));
    const chunkData = new Uint8Array(chunk.byteLength);
    chunk.copyTo(chunkData);

    let offset = 0;
    let firstFragment = true;
    while (offset < chunkData.length) {
      const fragment = chunkData.slice(offset, offset + MAX_FRAGMENT);
      offset += MAX_FRAGMENT;
      const isLast = offset >= chunkData.length;

      const buf = new ArrayBuffer(VIDEO_HDR + fragment.byteLength);
      const v = new DataView(buf);
      v.setUint16(0, this.seq++ & 0xffff, false);
      v.setBigUint64(2, pts90k, false);
      let flags = isScreenShare ? 0x04 : 0x00;
      if (isKeyFrame && firstFragment) flags |= 0x01;
      if (isLast) flags |= 0x02;
      v.setUint8(10, flags);
      // bytes 11-13 reserved (zero)
      new Uint8Array(buf).set(fragment, VIDEO_HDR);
      this.ws.send(buf);
      firstFragment = false;
    }
  }

  private _stopCapture(): void {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.encoder?.close();
    this.encoder = null;
  }

  stopScreenShare(): void {
    this._stopCapture();
  }

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
      | (new (opts: {
          track: MediaStreamTrack;
        }) => {
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
    this._stopCapture();
  }

  close(): void {
    this.closed = true;
    this._stopCapture();
    this.ws?.close();
    this.ws = null;
  }
}
