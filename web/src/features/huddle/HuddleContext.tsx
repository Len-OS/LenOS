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
import { HuddleVideoWs } from "./lib/huddleVideoWs";

const WORKLET_URL = new URL(
  "./worklets/huddle-capture-processor.js",
  import.meta.url,
).href;

export type HuddlePhase = "idle" | "connecting" | "active" | "leaving";
export type HuddleInputMode = "voice_activity" | "push_to_talk";

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
  inputMode: HuddleInputMode;
  audioDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  notesOpen: boolean;
  screenShareActive: boolean;
  remotePresenterPubkey: string | null;
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
  setInputMode(mode: HuddleInputMode): void;
  setSelectedDeviceId(id: string): void;
  setNotesOpen(v: boolean): void;
  setOutputDeviceId(id: string): void;
  setRemotePresenterPubkey(pubkey: string | null): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
}

export type HuddleCtx = HuddleState & HuddleActions;

const HuddleContext = createContext<HuddleCtx | null>(null);

function getInitialState(): HuddleState {
  return {
    phase: "idle",
    parentChannelId: null,
    ephemeralChannelId: null,
    peers: [],
    activeSpeakerIndexes: [],
    muted: false,
    micLevel: 0,
    reactions: [],
    error: null,
    inputMode:
      (localStorage.getItem("huddle_input_mode") as HuddleInputMode) ??
      "voice_activity",
    audioDevices: [],
    selectedDeviceId: localStorage.getItem("huddle_device_id") ?? "",
    notesOpen: false,
    screenShareActive: false,
    remotePresenterPubkey: null,
  };
}

export function HuddleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HuddleState>(getInitialState);
  const audioWsRef = useRef<HuddleAudioWs | null>(null);
  const encoderRef = useRef<HuddleEncoder | null>(null);
  const playbackRef = useRef<HuddlePlayback | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const tsRef = useRef(0);
  const videoWsRef = useRef<HuddleVideoWs | null>(null);
  // Used by hot-swap effect to skip initial mount
  const prevDeviceIdRef = useRef<string>("");

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
    videoWsRef.current?.close();
    videoWsRef.current = null;
  }, []);

  const startPipeline = useCallback(
    async (_parentChanId: string, ephChanId: string, deviceId?: string) => {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId) audioConstraints.deviceId = { exact: deviceId };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      streamRef.current = stream;

      // Enumerate devices after getUserMedia so mic permission is granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      setState((s) => ({ ...s, audioDevices: devices }));

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
      const deviceId = localStorage.getItem("huddle_device_id") ?? "";
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
        await startPipeline(parentChanId, ephChanId, deviceId || undefined);
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
      const deviceId = localStorage.getItem("huddle_device_id") ?? "";
      setState((s) => ({
        ...s,
        phase: "connecting",
        error: null,
        parentChannelId: parentChanId,
        ephemeralChannelId: ephChanId,
      }));
      try {
        await startPipeline(parentChanId, ephChanId, deviceId || undefined);
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
    setState(getInitialState);
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

  const setInputMode = useCallback((mode: HuddleInputMode) => {
    localStorage.setItem("huddle_input_mode", mode);
    if (mode === "push_to_talk") {
      workletRef.current?.port.postMessage({ type: "mute", value: true });
      setState((s) => ({ ...s, inputMode: mode, muted: true }));
    } else {
      workletRef.current?.port.postMessage({ type: "mute", value: false });
      setState((s) => ({ ...s, inputMode: mode, muted: false }));
    }
  }, []);

  const setSelectedDeviceId = useCallback((id: string) => {
    localStorage.setItem("huddle_device_id", id);
    setState((s) => ({ ...s, selectedDeviceId: id }));
  }, []);

  const setNotesOpen = useCallback(
    (v: boolean) => setState((s) => ({ ...s, notesOpen: v })),
    [],
  );

  const setOutputDeviceId = useCallback((id: string) => {
    localStorage.setItem("huddle_output_id", id);
    if ("setSinkId" in AudioContext.prototype && ctxRef.current) {
      void (
        ctxRef.current as AudioContext & {
          setSinkId(id: string): Promise<void>;
        }
      ).setSinkId(id);
    }
  }, []);

  const setRemotePresenterPubkey = useCallback(
    (pubkey: string | null) =>
      setState((s) => ({ ...s, remotePresenterPubkey: pubkey })),
    [],
  );

  const startScreenShare = useCallback(async () => {
    if (typeof VideoEncoder === "undefined") {
      throw new Error("Screen share requires Chrome 94+ or Safari 17.4+");
    }
    const { ephemeralChannelId } = state;
    if (!ephemeralChannelId) return;

    const ws = new HuddleVideoWs({
      wsUrl: relayWsUrl(),
      ephemeralChannelId,
      onPresenter: () => {},
      onPresenterLeft: () => {},
    });
    videoWsRef.current = ws;
    await ws.connect();
    await ws.startScreenShare();
    setState((s) => ({ ...s, screenShareActive: true }));
  }, [state]);

  const stopScreenShare = useCallback(() => {
    videoWsRef.current?.stopScreenShare();
    videoWsRef.current?.close();
    videoWsRef.current = null;
    setState((s) => ({ ...s, screenShareActive: false }));
  }, []);

  // PTT: Space key handler
  useEffect(() => {
    if (state.inputMode !== "push_to_talk" || state.phase !== "active") return;

    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      );
    };

    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTyping()) return;
      e.preventDefault();
      workletRef.current?.port.postMessage({ type: "mute", value: false });
      setState((s) => ({ ...s, muted: false }));
    };

    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      e.preventDefault();
      workletRef.current?.port.postMessage({ type: "mute", value: true });
      setState((s) => ({ ...s, muted: true }));
    };

    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, [state.inputMode, state.phase]);

  // Hot-swap audio device when selectedDeviceId changes while active
  useEffect(() => {
    const id = state.selectedDeviceId;
    if (prevDeviceIdRef.current === id) return;
    prevDeviceIdRef.current = id;

    if (
      state.phase !== "active" ||
      !streamRef.current ||
      !ctxRef.current ||
      !workletRef.current
    )
      return;

    const doSwap = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const constraints: MediaTrackConstraints = {
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (id) constraints.deviceId = { exact: id };
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: constraints,
          video: false,
        });
        streamRef.current = newStream;
        const newSource = ctxRef.current!.createMediaStreamSource(newStream);
        workletRef.current!.disconnect();
        newSource.connect(workletRef.current!);
      } catch (e) {
        setState((s) => ({
          ...s,
          error: e instanceof Error ? e.message : "Failed to switch device",
        }));
      }
    };
    void doSwap();
  }, [state.selectedDeviceId, state.phase]);

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
    setInputMode,
    setSelectedDeviceId,
    setNotesOpen,
    setOutputDeviceId,
    setRemotePresenterPubkey,
    startScreenShare,
    stopScreenShare,
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
