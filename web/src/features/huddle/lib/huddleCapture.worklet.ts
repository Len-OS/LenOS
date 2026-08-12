// AudioWorkletGlobalScope types — not part of lib.webworker, declared inline.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void;

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
      const toCopy = Math.min(
        FRAME_SAMPLES - this.writePos,
        input.length - offset,
      );
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
