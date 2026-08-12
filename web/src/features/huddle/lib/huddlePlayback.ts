import { createHuddleDecoder, type HuddleDecoder } from "./huddleCodec";
import type { IncomingFrame } from "./huddleAudioWs";

const SR = 48000;
const FRAME_DUR = 0.02;
const JITTER = 3;
const SPEECH_THR = -40;
const SPEAK_MIN = 5;

interface Peer {
  decoder: HuddleDecoder;
  nextTime: number;
  frames: number;
}

export class HuddlePlayback {
  private ctx: AudioContext;
  private gain: GainNode;
  private peers = new Map<number, Peer>();
  private speaking = new Set<number>();
  private cb: (idxs: number[]) => void;

  constructor(onSpeakers: (idxs: number[]) => void) {
    this.ctx = new AudioContext({ sampleRate: SR });
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    this.cb = onSpeakers;
  }

  async addPeer(idx: number): Promise<void> {
    if (this.peers.has(idx)) return;
    this.peers.set(idx, {
      decoder: await createHuddleDecoder(),
      nextTime: this.ctx.currentTime + JITTER * FRAME_DUR,
      frames: 0,
    });
  }

  removePeer(idx: number): void {
    const p = this.peers.get(idx);
    if (!p) return;
    p.decoder.close();
    this.peers.delete(idx);
    this.speaking.delete(idx);
    this.cb([...this.speaking]);
  }

  async handleFrame(frame: IncomingFrame): Promise<void> {
    if (!this.peers.has(frame.peerIndex)) await this.addPeer(frame.peerIndex);
    const p = this.peers.get(frame.peerIndex)!;

    if (frame.levelDbov > SPEECH_THR) {
      p.frames++;
      if (p.frames >= SPEAK_MIN && !this.speaking.has(frame.peerIndex)) {
        this.speaking.add(frame.peerIndex);
        this.cb([...this.speaking]);
      }
    } else {
      if (p.frames > 0) p.frames--;
      if (p.frames === 0 && this.speaking.has(frame.peerIndex)) {
        this.speaking.delete(frame.peerIndex);
        this.cb([...this.speaking]);
      }
    }

    const pcm = await p.decoder.decode(frame.opus, frame.ts48k);
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const ab = this.ctx.createBuffer(1, pcm.length, SR);
    ab.getChannelData(0).set(pcm);
    const src = this.ctx.createBufferSource();
    src.buffer = ab;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    if (p.nextTime < now) p.nextTime = now + JITTER * FRAME_DUR;
    src.start(p.nextTime);
    p.nextTime += FRAME_DUR;
  }

  setVolume(v: number): void {
    this.gain.gain.value = Math.max(0, Math.min(2, v));
  }

  async close(): Promise<void> {
    for (const p of this.peers.values()) p.decoder.close();
    this.peers.clear();
    await this.ctx.close();
  }
}
