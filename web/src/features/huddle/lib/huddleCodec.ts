const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_SIZE = 960;
const BITRATE = 32000;

export interface HuddleEncoder {
  encode(pcm: Float32Array, timestamp: number): Promise<Uint8Array>;
  close(): void;
}

export interface HuddleDecoder {
  decode(opus: Uint8Array, timestamp: number): Promise<Float32Array>;
  close(): void;
}

function webCodecsSupported(): boolean {
  return (
    typeof AudioEncoder !== "undefined" && typeof AudioDecoder !== "undefined"
  );
}

class WebCodecsEncoder implements HuddleEncoder {
  private encoder: AudioEncoder;
  private pending = new Map<number, (data: Uint8Array) => void>();

  constructor() {
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        this.pending.get(chunk.timestamp)?.(buf);
        this.pending.delete(chunk.timestamp);
      },
      error: (e) => console.error("[HuddleEncoder]", e),
    });
    this.encoder.configure({
      codec: "opus",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: BITRATE,
    });
  }

  encode(pcm: Float32Array, timestamp: number): Promise<Uint8Array> {
    return new Promise((resolve) => {
      this.pending.set(timestamp, resolve);
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfChannels: CHANNELS,
        numberOfFrames: FRAME_SIZE,
        timestamp,
        data: pcm as unknown as Float32Array<ArrayBuffer>,
      });
      this.encoder.encode(data);
      data.close();
    });
  }

  close(): void {
    this.encoder.close();
  }
}

class WebCodecsDecoder implements HuddleDecoder {
  private decoder: AudioDecoder;
  private pending = new Map<number, (pcm: Float32Array) => void>();

  constructor() {
    this.decoder = new AudioDecoder({
      output: (frame) => {
        const pcm = new Float32Array(frame.numberOfFrames);
        frame.copyTo(pcm, { planeIndex: 0 });
        this.pending.get(frame.timestamp)?.(pcm);
        this.pending.delete(frame.timestamp);
        frame.close();
      },
      error: (e) => console.error("[HuddleDecoder]", e),
    });
    this.decoder.configure({
      codec: "opus",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
    });
  }

  decode(opus: Uint8Array, timestamp: number): Promise<Float32Array> {
    return new Promise((resolve) => {
      this.pending.set(timestamp, resolve);
      this.decoder.decode(
        new EncodedAudioChunk({ type: "key", timestamp, data: opus }),
      );
    });
  }

  close(): void {
    this.decoder.close();
  }
}

// WASM fallback — only loaded when WebCodecs unavailable (Firefox, Safari < 17.4).
// Uses opusscript (Emscripten-compiled libopus). Input/output is Int16, so we
// convert Float32↔Int16 at the boundary.
type OpusScriptCtor = {
  new (
    rate: number,
    channels: number,
    application: number,
  ): {
    encode(pcm: Int16Array, frameSize: number): Uint8Array;
    decode(data: Uint8Array, frameSize?: number): Int16Array;
    encoder_ctl(ctl: number, value: number): void;
    delete(): void;
  };
  Application: { VOIP: number };
};

async function loadOpusScript(): Promise<OpusScriptCtor> {
  const mod = await import("opusscript");
  return ((mod as Record<string, unknown>).default ?? mod) as OpusScriptCtor;
}

function float32ToInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
  }
  return out;
}

function int16ToFloat32(int16: Int16Array): Float32Array {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    out[i] = int16[i] / 32768;
  }
  return out;
}

async function createWasmEncoder(): Promise<HuddleEncoder> {
  const OpusScript = await loadOpusScript();
  const enc = new OpusScript(
    SAMPLE_RATE,
    CHANNELS,
    OpusScript.Application.VOIP,
  );
  enc.encoder_ctl(4002 /* OPUS_SET_BITRATE_REQUEST */, BITRATE);
  return {
    encode: async (pcm) => enc.encode(float32ToInt16(pcm), FRAME_SIZE),
    close: () => enc.delete(),
  };
}

async function createWasmDecoder(): Promise<HuddleDecoder> {
  const OpusScript = await loadOpusScript();
  const dec = new OpusScript(
    SAMPLE_RATE,
    CHANNELS,
    OpusScript.Application.VOIP,
  );
  return {
    decode: async (opus) => int16ToFloat32(dec.decode(opus, FRAME_SIZE)),
    close: () => dec.delete(),
  };
}

export async function createHuddleEncoder(): Promise<HuddleEncoder> {
  return webCodecsSupported() ? new WebCodecsEncoder() : createWasmEncoder();
}

export async function createHuddleDecoder(): Promise<HuddleDecoder> {
  return webCodecsSupported() ? new WebCodecsDecoder() : createWasmDecoder();
}
