import { signNostrEvent } from "@/shared/lib/nostr-signer";

export interface PeerInfo {
  peerIndex: number;
  pubkey: string;
  isAgent?: boolean;
}

export interface IncomingFrame {
  peerIndex: number;
  seq: number;
  ts48k: number;
  levelDbov: number;
  opus: Uint8Array;
}

export interface HuddleAudioWsOptions {
  wsUrl: string;
  ephemeralChannelId: string;
  onPeers: (peers: PeerInfo[]) => void;
  onFrame: (frame: IncomingFrame) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

const HDR = 8;

export class HuddleAudioWs {
  private ws: WebSocket | null = null;
  private seq = 0;
  private closed = false;

  constructor(private opts: HuddleAudioWsOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const base = this.opts.wsUrl.replace(/\/$/, "");
      const url = `${base}/huddle/${this.opts.ephemeralChannelId}/audio`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Huddle WS timed out"));
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
              ws.send(
                JSON.stringify({
                  type: "auth",
                  event: signed,
                  protocol_version: 2,
                }),
              );
            } catch (e) {
              clearTimeout(timeout);
              ws.close();
              reject(e);
            }
          } else if (msg.type === "joined") {
            clearTimeout(timeout);
            this.opts.onPeers((msg.peers as PeerInfo[]) ?? []);
            resolve();
          } else if (msg.type === "error") {
            clearTimeout(timeout);
            ws.close();
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

      ws.addEventListener("close", () => {
        this.ws = null;
        if (!this.closed) this.opts.onClose();
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        this.opts.onError("WebSocket error");
        reject(new Error("WebSocket error"));
      });
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

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
