import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_HUDDLE_STARTED } from "@/shared/constants/kinds";
import { HuddleAudioWs, type PeerInfo } from "./lib/huddleAudioWs";
import { createHuddleEncoder, type HuddleEncoder } from "./lib/huddleCodec";
import { HuddlePlayback } from "./lib/huddlePlayback";
import { pcmToDbov } from "./lib/huddleVad";
import {
  subscribeHuddleReactions,
  publishHuddleReaction,
  type HuddleReaction,
} from "./lib/huddleReactions";

const WORKLET_URL = new URL(
  "./worklets/huddle-capture-processor.js",
  import.meta.url,
).href;

export type HuddlePhase = "idle" | "connecting" | "active" | "leaving";

interface HuddleState {
  phase: HuddlePhase;
  parentChannelId: string | null;
  ephemeralChannelId: string | null;
  peers: PeerInfo[];
  activeSpeakerIndexes: number[];
  muted: boolean;
  micLevel: number;
  reactions: HuddleReaction[];
  error: string | null;
}

interface HuddleActions {
  startHuddle(parentChannelId: string): Promise<void>;
  joinHuddle(
    parentChannelId: string,
    ephemeralChannelId: string,
  ): Promise<void>;
  leaveHuddle(): Promise<void>;
  setMuted(v: boolean): void;
  sendReaction(emoji: string, senderName: string): Promise<void>;
  clearError(): void;
}

export type HuddleCtx = HuddleState & HuddleActions;

const HuddleContext = createContext<HuddleCtx | null>(null);

const INITIAL: HuddleState = {
  phase: "idle",
  parentChannelId: null,
  ephemeralChannelId: null,
  peers: [],
  activeSpeakerIndexes: [],
  muted: false,
  micLevel: 0,
  reactions: [],
  error: null,
};

export function HuddleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HuddleState>(INITIAL);
  const audioWsRef = useRef<HuddleAudioWs | null>(null);
  const encoderRef = useRef<HuddleEncoder | null>(null);
  const playbackRef = useRef<HuddlePlayback | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const tsRef = useRef(0);

  const cleanup = useCallback(async () => {
    unsubRef.current?.();
    unsubRef.current = null;
    workletRef.current?.disconnect();
    workletRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    encoderRef.current?.close();
    encoderRef.current = null;
    audioWsRef.current?.close();
    audioWsRef.current = null;
    await playbackRef.current?.close();
    playbackRef.current = null;
    await ctxRef.current?.close();
    ctxRef.current = null;
    tsRef.current = 0;
  }, []);

  const startPipeline = useCallback(
    async (_parentChanId: string, ephChanId: string) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 48000 });
      ctxRef.current = audioCtx;
      await audioCtx.audioWorklet.addModule(WORKLET_URL);
      const source = audioCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(
        audioCtx,
        "huddle-capture-processor",
      );
      workletRef.current = worklet;
      source.connect(worklet);

      encoderRef.current = await createHuddleEncoder();

      const playback = new HuddlePlayback((idxs) =>
        setState((s) => ({ ...s, activeSpeakerIndexes: idxs })),
      );
      playbackRef.current = playback;

      const ws = new HuddleAudioWs({
        wsUrl: relayWsUrl(),
        ephemeralChannelId: ephChanId,
        onPeers: (peers) => setState((s) => ({ ...s, peers })),
        onFrame: (frame) => void playback.handleFrame(frame),
        onError: (msg) => setState((s) => ({ ...s, error: msg })),
        onClose: () =>
          setState((s) =>
            s.phase === "active" ? { ...s, error: "Audio connection lost" } : s,
          ),
      });
      audioWsRef.current = ws;

      if (audioCtx.state === "suspended") await audioCtx.resume();
      await ws.connect();

      worklet.port.onmessage = (
        evt: MessageEvent<{ type: string; buffer: ArrayBuffer }>,
      ) => {
        if (evt.data.type !== "frame") return;
        const pcm = new Float32Array(evt.data.buffer);
        const dbov = pcmToDbov(pcm);
        const ts = tsRef.current;
        void encoderRef
          .current!.encode(pcm, ts)
          .then((opus) => ws.sendFrame(opus, ts, dbov));
        setState((s) => ({
          ...s,
          micLevel: Math.max(0, Math.min(1, (dbov + 90) / 90)),
        }));
        tsRef.current += 960;
      };

      unsubRef.current = subscribeHuddleReactions(ephChanId, (r) =>
        setState((s) => ({
          ...s,
          reactions: [...s.reactions.slice(-19), r],
        })),
      );
    },
    [],
  );

  const startHuddle = useCallback(
    async (parentChanId: string) => {
      const ephChanId = crypto.randomUUID();
      setState((s) => ({
        ...s,
        phase: "connecting",
        error: null,
        parentChannelId: parentChanId,
        ephemeralChannelId: ephChanId,
      }));
      try {
        const signed = await signNostrEvent({
          kind: KIND_HUDDLE_STARTED,
          content: JSON.stringify({ ephemeral_channel_id: ephChanId }),
          tags: [["h", parentChanId]],
        });
        getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
        await startPipeline(parentChanId, ephChanId);
        setState((s) => ({ ...s, phase: "active" }));
      } catch (e) {
        await cleanup();
        setState((s) => ({
          ...s,
          phase: "idle",
          parentChannelId: null,
          ephemeralChannelId: null,
          error: e instanceof Error ? e.message : "Failed to start huddle",
        }));
      }
    },
    [startPipeline, cleanup],
  );

  const joinHuddle = useCallback(
    async (parentChanId: string, ephChanId: string) => {
      setState((s) => ({
        ...s,
        phase: "connecting",
        error: null,
        parentChannelId: parentChanId,
        ephemeralChannelId: ephChanId,
      }));
      try {
        await startPipeline(parentChanId, ephChanId);
        setState((s) => ({ ...s, phase: "active" }));
      } catch (e) {
        await cleanup();
        setState((s) => ({
          ...s,
          phase: "idle",
          parentChannelId: null,
          ephemeralChannelId: null,
          error: e instanceof Error ? e.message : "Failed to join huddle",
        }));
      }
    },
    [startPipeline, cleanup],
  );

  const leaveHuddle = useCallback(async () => {
    setState((s) => ({ ...s, phase: "leaving" }));
    await cleanup();
    setState(INITIAL);
  }, [cleanup]);

  const setMuted = useCallback((v: boolean) => {
    workletRef.current?.port.postMessage({ type: "mute", value: v });
    setState((s) => ({ ...s, muted: v }));
  }, []);

  const sendReaction = useCallback(
    async (emoji: string, senderName: string) => {
      const { ephemeralChannelId } = state;
      if (ephemeralChannelId)
        await publishHuddleReaction(emoji, ephemeralChannelId, senderName);
    },
    [state],
  );

  const clearError = useCallback(
    () => setState((s) => ({ ...s, error: null })),
    [],
  );

  useEffect(() => {
    const h = () => void cleanup();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cleanup]);

  const value: HuddleCtx = {
    ...state,
    startHuddle,
    joinHuddle,
    leaveHuddle,
    setMuted,
    sendReaction,
    clearError,
  };
  return (
    <HuddleContext.Provider value={value}>{children}</HuddleContext.Provider>
  );
}

export function useHuddle(): HuddleCtx {
  const ctx = useContext(HuddleContext);
  if (!ctx) throw new Error("useHuddle must be used inside HuddleProvider");
  return ctx;
}
