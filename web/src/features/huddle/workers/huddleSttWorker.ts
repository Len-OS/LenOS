import { pipeline, env } from "@huggingface/transformers";

// Single-threaded WASM — no SharedArrayBuffer required
// @ts-expect-error: onnx backend types vary across versions
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
      const result = await (
        transcriber as (
          input: Float32Array,
          opts: {
            sampling_rate: number;
            language: string;
            return_timestamps: boolean;
          },
        ) => Promise<{ text: string }>
      )(pcm, {
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
