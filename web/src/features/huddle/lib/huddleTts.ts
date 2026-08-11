import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_STREAM_MESSAGE = 9;

export class HuddleTts {
  private worker: Worker | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private speaking = false;
  private cancelled = false;
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
      const timeout = setTimeout(() => {
        this.worker?.terminate();
        this.worker = null;
        reject(new Error("TTS model load timed out after 120s"));
      }, 120_000);

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
          this.worker?.terminate();
          this.worker = null;
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
      // Drop stale audio if barge-in occurred during generation
      if (this.cancelled) {
        this.cancelled = false;
        this.speaking = false;
        return;
      }
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
        this.cancelled = false;
        this.worker.postMessage({ type: "speak", text });
        return;
      }
    }
  }

  onSpeaking(): void {
    if (!this.speaking) return;
    this.cancelled = true;
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
