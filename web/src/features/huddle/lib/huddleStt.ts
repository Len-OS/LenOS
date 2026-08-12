import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

// 3 seconds of audio at 48 kHz = 144 000 samples
const TARGET_SAMPLES = 48_000 * 3;
// 500 ms silence = 25 frames at 960 samples/frame
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
      const timeout = setTimeout(() => {
        this.worker?.terminate();
        this.worker = null;
        reject(new Error("STT model load timed out after 120s"));
      }, 120_000);

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
          this.worker?.terminate();
          this.worker = null;
          reject(new Error(evt.data.message ?? "STT init failed"));
        }
      };

      this.worker?.postMessage({ type: "init" });
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
