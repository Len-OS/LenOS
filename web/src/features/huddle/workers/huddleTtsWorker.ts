import { KokoroTTS } from "kokoro-js";

let tts: Awaited<ReturnType<typeof KokoroTTS.from_pretrained>> | null = null;

// postMessage with transfer — cast through MessagePort whose overloads accept
// (message, Transferable[]) unlike Window's targetOrigin-based overload
const workerPost = (message: unknown, transfer?: Transferable[]) =>
  (self as unknown as MessagePort).postMessage(message, transfer ?? []);

/** Flatten RawAudio.audio which may be a single Float32Array or an array of chunks */
function flattenAudio(
  raw: Float32Array<ArrayBufferLike> | Float32Array<ArrayBufferLike>[],
): Float32Array {
  if (!Array.isArray(raw)) return raw as Float32Array;
  const totalLen = raw.reduce((s, a) => s + a.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of raw) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

self.onmessage = async (
  evt: MessageEvent<{ type: string; text?: string; jobId?: number }>,
) => {
  const { type, text, jobId } = evt.data;

  if (type === "init") {
    try {
      tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0", {
        dtype: "q8",
      });
      workerPost({ type: "ready" });
    } catch (e) {
      workerPost({
        type: "error",
        message: e instanceof Error ? e.message : "TTS model load failed",
      });
    }
    return;
  }

  if (type === "speak" && text && tts) {
    try {
      const audio = await tts.generate(text, { voice: "af_heart" });
      const pcm = flattenAudio(audio.audio);
      // Slice to own buffer so the ArrayBuffer can be transferred without
      // sending the entire (possibly larger) backing ONNX buffer
      const buf = pcm.buffer.slice(
        pcm.byteOffset,
        pcm.byteOffset + pcm.byteLength,
      );
      workerPost(
        { type: "audio", buffer: buf, sampleRate: audio.sampling_rate, jobId },
        [buf],
      );
    } catch (e) {
      console.error("[TtsWorker]", e);
      // Signal completion even on error so the queue advances
      workerPost({ type: "audio_error", jobId });
    }
  }
};
