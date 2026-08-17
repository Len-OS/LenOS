import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRouterState } from "@tanstack/react-router";
import * as React from "react";

import { setupAudioWorklet, type AudioWorkletHandle } from "./lib/audioWorklet";

export type HuddleAudioQuality = "low" | "medium" | "high";
export type HuddleAudioSettings = {
  noiseSuppression: boolean;
  quality: HuddleAudioQuality;
};
import { useAudioDevices } from "./lib/useAudioDevices";
import { formatHuddleActionError } from "./lib/huddleError";
import { useTtsSubscription } from "./lib/useTtsSubscription";
import { HuddleVideoWs, type VideoPublisherInfo } from "./lib/huddleVideoWs";

/**
 * Huddle lifecycle (React context):
 *   startHuddle/joinHuddle → invoke(start/join_huddle) → getUserMedia + setupAudioWorklet
 *     → confirm_huddle_active
 *   TTS subscription: subscribeToChannelLive → filter agent pubkeys → speak_agent_message
 *   leaveHuddle: stop worklet → stop mic track → invoke(leave_huddle)
 *   Active speakers: Tauri "huddle-active-speakers" event (Rust backend emits)
 */

type HuddleJoinInfo = {
  ephemeral_channel_id: string;
};

type VoiceInputMode = "push_to_talk" | "voice_activity";

const MIC_ANALYSER_UPDATE_INTERVAL_MS = 33;
const PIPELINE_HOTSTART_INTERVAL_MS = 15_000;
const MIC_INITIAL_NOISE_FLOOR = 0.01;
const MIC_VOICE_GATE_ON_RMS = 0.018;
const MIC_VOICE_GATE_OFF_RMS = 0.012;
const MIC_VOICE_GATE_MARGIN_RMS = 0.012;
const MIC_LEVEL_ACTIVE_RANGE_RMS = 0.11;
const MIC_MIN_ACTIVE_LEVEL = 0.18;
const MIC_LEVEL_ATTACK = 0.58;
const MIC_ACTIVE_NOISE_FLOOR_RISE = 0.006;

function isRedundantHuddlePhaseError(message: string): boolean {
  return /^cannot (?:start|join) huddle: already in phase /i.test(message);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface HuddleContextValue {
  /** Current local audio track (for mute toggle in HuddleBar) */
  localAudioTrack: MediaStreamTrack | null;
  /** Whether a huddle is being started (for button disabled state) */
  isStarting: boolean;
  /** Last start/join error message — display in UI and clear with clearHuddleError */
  huddleError: string | null;
  /** Dismiss the current huddleError */
  clearHuddleError: () => void;
  /** Whether the mic connection is live */
  micConnected: boolean;
  /** Current mic input level 0–1 (updated via requestAnimationFrame) */
  micLevel: number;
  /** Whether the PTT key is currently held (for UI feedback) */
  pttActive: boolean;
  /** Current voice input mode — push_to_talk or voice_activity */
  voiceInputMode: VoiceInputMode;
  /** Toggle voice input mode (persisted to Rust backend) */
  setVoiceInputMode: (mode: VoiceInputMode) => Promise<void>;
  /** Pubkeys of currently speaking participants (from Rust backend) */
  activeSpeakers: string[];
  /** Available audio input devices */
  audioDevices: MediaDeviceInfo[];
  /** Currently selected mic device ID (empty string = system default) */
  selectedDeviceId: string;
  /** Select a different mic — takes effect on next huddle start/join */
  setSelectedDeviceId: (id: string) => void;
  /** Mic input gain 0–1 */
  micGain: number;
  /** Adjust mic input gain — applied immediately to the active audio graph */
  setMicGain: (value: number) => void;
  /** Available audio output devices */
  outputDevices: { name: string; is_default: boolean }[];
  /** Currently selected output device name (empty = system default) */
  selectedOutputDevice: string;
  /** Select a different speaker — takes effect on next huddle start/join */
  setSelectedOutputDevice: (name: string) => void;
  /** Active ephemeral huddle channel ID, if this client is connected to one. */
  activeEphemeralChannelId: string | null;
  /** Whether screen share is currently active */
  screenShareActive: boolean;
  /** Whether camera share is currently active */
  cameraShareActive: boolean;
  /** Whether huddle notes panel is open */
  notesOpen: boolean;
  /** Toggle notes panel */
  setNotesOpen: (v: boolean) => void;
  /** Remote video publishers: pubkey → mode */
  remoteVideoPublishers: Map<string, "camera" | "screen">;
  /** Local video stream for preview (null when not sharing) */
  localVideoStream: MediaStream | null;
  /** Start screen share (stops camera if active) */
  startScreenShare: () => Promise<void>;
  /** Stop screen share */
  stopScreenShare: () => Promise<void>;
  /** Start camera share (stops screen share if active) */
  startCameraShare: () => Promise<void>;
  /** Stop camera share */
  stopCameraShare: () => Promise<void>;
  /** Start a new huddle — calls Rust start_huddle, then connects mic + AudioWorklet */
  startHuddle: (
    parentChannelId: string,
    memberPubkeys: string[],
    channelName?: string,
    dmPubkeys?: string[],
  ) => Promise<void>;
  /** Join an existing huddle — calls Rust join_huddle, then connects mic + AudioWorklet */
  joinHuddle: (
    parentChannelId: string,
    ephemeralChannelId: string,
  ) => Promise<void>;
  /** Leave the current huddle — stops worklet, stops mic, calls Rust leave_huddle.
   *  Returns true if backend cleanup succeeded, false if it failed (caller may retry). */
  leaveHuddle: () => Promise<boolean>;
  /** Whether the local mic is muted */
  isMuted: boolean;
  /** Toggle local mic mute */
  toggleMute: () => void;
  /** Whether the huddle is currently popped out into a PiP window */
  isPoppedOut: boolean;
  /** Re-initialize audio with new quality settings — only acts when mic is connected */
  reinitAudio: (settings: HuddleAudioSettings) => Promise<void>;
}

const HuddleContext = React.createContext<HuddleContextValue | null>(null);

export function HuddleProvider({ children }: { children: React.ReactNode }) {
  const workletRef = React.useRef<AudioWorkletHandle | null>(null);
  const tokenRef = React.useRef(0);
  const busyRef = React.useRef(false);
  /** True once Rust `start_huddle` or `join_huddle` has been invoked (even if JS-side refs aren't populated yet). */
  const rustActiveRef = React.useRef(false);
  const [localAudioTrack, setLocalAudioTrack] =
    React.useState<MediaStreamTrack | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [huddleError, setHuddleError] = React.useState<string | null>(null);
  const clearHuddleError = React.useCallback(() => setHuddleError(null), []);
  const [micConnected, setMicConnected] = React.useState(false);
  const [micLevel, setMicLevel] = React.useState(0);
  /** Whether the PTT key is currently held */
  const [pttActive, setPttActive] = React.useState(false);
  /** Current voice input mode */
  const [voiceInputMode, setVoiceInputModeState] =
    React.useState<VoiceInputMode>("voice_activity");
  /** Ref tracking latest voiceInputMode — read inside connectAndSetupMedia to
   *  avoid stale closure capture when the user toggles mode mid-start. */
  const voiceInputModeRef = React.useRef<VoiceInputMode>("voice_activity");
  voiceInputModeRef.current = voiceInputMode;
  /** Ephemeral channel ID — set after start_huddle/join_huddle, used for TTS subscription */
  const [ephemeralChannelId, setEphemeralChannelId] = React.useState<
    string | null
  >(null);
  /** Parent channel ID — stored to detect navigation away for auto pop-out */
  const [huddleParentChannelId, setHuddleParentChannelId] = React.useState<
    string | null
  >(null);
  /** Self pubkey — fetched once, used to filter out own messages from TTS */
  const selfPubkeyRef = React.useRef<string | null>(null);
  /** Pubkeys of participants currently speaking (from Rust backend via Tauri event) */
  const [activeSpeakers, setActiveSpeakers] = React.useState<string[]>([]);
  const [screenShareActive, setScreenShareActive] = React.useState(false);
  const [cameraShareActive, setCameraShareActive] = React.useState(false);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [remoteVideoPublishers, setRemoteVideoPublishers] = React.useState<
    Map<string, "camera" | "screen">
  >(new Map());
  const [localVideoStream, setLocalVideoStream] =
    React.useState<MediaStream | null>(null);
  const [isPoppedOut, setIsPoppedOut] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const huddleVideoRef = React.useRef<HuddleVideoWs | null>(null);
  const {
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    micGain,
    setMicGain,
  } = useAudioDevices(workletRef);
  /** Audio output devices from Rust backend */
  const [outputDevices, setOutputDevices] = React.useState<
    { name: string; is_default: boolean }[]
  >([]);
  const [selectedOutputDevice, setSelectedOutputDeviceState] =
    React.useState("");
  const setSelectedOutputDevice = React.useCallback((name: string) => {
    setSelectedOutputDeviceState(name);
    invoke("set_audio_output_device", { name }).catch(() => {
      /* best-effort */
    });
  }, []);

  // Fetch output devices on mount and when system devices change.
  React.useEffect(() => {
    function refreshOutputDevices() {
      invoke<{ name: string; is_default: boolean }[]>(
        "list_audio_output_devices",
      )
        .then(setOutputDevices)
        .catch(() => {
          /* best-effort */
        });
    }
    refreshOutputDevices();
    invoke<string>("get_audio_output_device")
      .then(setSelectedOutputDeviceState)
      .catch(() => {
        /* best-effort */
      });
    navigator.mediaDevices.addEventListener(
      "devicechange",
      refreshOutputDevices,
    );
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        refreshOutputDevices,
      );
    };
  }, []);

  /** Ref tracking latest micGain — read inside connectAndSetupMedia to
   *  avoid stale closure capture. */
  const micGainRef = React.useRef(1);
  micGainRef.current = micGain;

  // Bootstrap voice input mode from Rust backend on mount.
  // Ensures frontend stays in sync after remount/recovery.
  React.useEffect(() => {
    invoke<VoiceInputMode>("get_voice_input_mode")
      .then((mode) => setVoiceInputModeState(mode))
      .catch(() => {
        /* best-effort — default is voice_activity */
      });
  }, []);

  // Active speakers from Rust backend (emitted by the audio relay recv task).
  React.useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<string[]>("huddle-active-speakers", (event) => {
      if (!cancelled) setActiveSpeakers(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Track PiP window open/closed state via Tauri events emitted by pop_out_huddle / pop_in_huddle.
  React.useEffect(() => {
    let cancelled = false;
    let unlistenOpen: (() => void) | null = null;
    let unlistenClose: (() => void) | null = null;
    listen("huddle-pip-opened", () => {
      if (!cancelled) setIsPoppedOut(true);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenOpen = fn;
    });
    listen("huddle-pip-closed", () => {
      if (!cancelled) setIsPoppedOut(false);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenClose = fn;
    });
    return () => {
      cancelled = true;
      unlistenOpen?.();
      unlistenClose?.();
    };
  }, []);

  // Auto pop-out when navigating away from the huddle channel, auto pop-in on return.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  React.useEffect(() => {
    if (!ephemeralChannelId || !huddleParentChannelId) return;
    const onHuddleChannel = pathname.includes(huddleParentChannelId);
    if (!onHuddleChannel && !isPoppedOut) {
      void invoke("pop_out_huddle").catch(() => {
        /* best-effort */
      });
    } else if (onHuddleChannel && isPoppedOut) {
      void invoke("pop_in_huddle").catch(() => {
        /* best-effort */
      });
    }
  }, [pathname, ephemeralChannelId, huddleParentChannelId, isPoppedOut]);

  // Persistent AudioContext for PTT audio cues — reused across all PTT presses
  // to avoid exhausting the browser's ~6 concurrent AudioContext limit.
  const pttAudioCtxRef = React.useRef<AudioContext | null>(null);

  // PTT state from Rust (Ctrl+Space). UI feedback + 50ms audio cue when mic active.
  // Actual audio gating is in audioWorklet.ts → worklet.js.
  React.useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<boolean>("ptt-state", (event) => {
      if (cancelled) return;
      setPttActive(event.payload);
      if (micConnected) {
        try {
          if (
            !pttAudioCtxRef.current ||
            pttAudioCtxRef.current.state === "closed"
          ) {
            pttAudioCtxRef.current = new AudioContext();
          }
          const ac = pttAudioCtxRef.current;
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.connect(g);
          g.connect(ac.destination);
          osc.frequency.value = event.payload ? 880 : 440;
          g.gain.value = 0.05;
          osc.start();
          osc.stop(ac.currentTime + 0.05);
        } catch {
          /* best-effort */
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      // Close the PTT AudioContext when the effect is cleaned up.
      if (pttAudioCtxRef.current && pttAudioCtxRef.current.state !== "closed") {
        void pttAudioCtxRef.current.close();
        pttAudioCtxRef.current = null;
      }
    };
  }, [micConnected]);

  // Toggle voice input mode — persists to Rust backend and updates worklet gating.
  const setVoiceInputMode = React.useCallback(async (mode: VoiceInputMode) => {
    await invoke("set_voice_input_mode", { mode });
    setVoiceInputModeState(mode);
    workletRef.current?.setMode(mode);
  }, []);

  const startScreenShare = React.useCallback(async () => {
    // Mutual exclusion: stop active camera share first
    if (huddleVideoRef.current) {
      huddleVideoRef.current.stop();
      huddleVideoRef.current = null;
    }
    setCameraShareActive(false);
    // Rust validates huddle is active
    await invoke("start_screen_share");
    const channelId = ephemeralChannelId;
    if (!channelId) throw new Error("no ephemeral channel");
    const ws = new HuddleVideoWs(
      () => {
        setScreenShareActive(false);
        setLocalVideoStream(null);
        huddleVideoRef.current = null;
      },
      (pubs: VideoPublisherInfo[]) => {
        const map = new Map<string, "camera" | "screen">();
        for (const p of pubs) map.set(p.pubkey, p.mode);
        setRemoteVideoPublishers(map);
      },
    );
    await ws.startScreenShare(channelId);
    huddleVideoRef.current = ws;
    setScreenShareActive(true);
    setLocalVideoStream(ws.getLocalStream());
  }, [ephemeralChannelId]);

  const stopScreenShare = React.useCallback(async () => {
    huddleVideoRef.current?.stop();
    huddleVideoRef.current = null;
    setScreenShareActive(false);
    setLocalVideoStream(null);
  }, []);

  const startCameraShare = React.useCallback(async () => {
    // Mutual exclusion: stop active screen share first
    if (huddleVideoRef.current) {
      huddleVideoRef.current.stop();
      huddleVideoRef.current = null;
    }
    setScreenShareActive(false);
    // Rust validates huddle is active
    await invoke("start_camera_share");
    const channelId = ephemeralChannelId;
    if (!channelId) throw new Error("no ephemeral channel");
    const ws = new HuddleVideoWs(
      () => {
        setCameraShareActive(false);
        setLocalVideoStream(null);
        huddleVideoRef.current = null;
      },
      (pubs: VideoPublisherInfo[]) => {
        const map = new Map<string, "camera" | "screen">();
        for (const p of pubs) map.set(p.pubkey, p.mode);
        setRemoteVideoPublishers(map);
      },
    );
    await ws.startCameraShare(channelId);
    huddleVideoRef.current = ws;
    setCameraShareActive(true);
    setLocalVideoStream(ws.getLocalStream());
  }, [ephemeralChannelId]);

  const stopCameraShare = React.useCallback(async () => {
    huddleVideoRef.current?.stop();
    huddleVideoRef.current = null;
    setCameraShareActive(false);
    setLocalVideoStream(null);
  }, []);

  const toggleMute = React.useCallback(() => {
    const track = audioTrackRef.current;
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  const reinitAudio = React.useCallback(
    async (settings: HuddleAudioSettings) => {
      localStorage.setItem(
        "huddle_noise_suppression",
        String(settings.noiseSuppression),
      );
      localStorage.setItem("huddle_audio_quality", settings.quality);

      // Only restart media if mic is currently connected
      const track = audioTrackRef.current;
      const worklet = workletRef.current;
      if (!track || !worklet) return;

      // Stop existing worklet and track
      try {
        worklet.stop();
      } catch {
        /* best-effort */
      }
      workletRef.current = null;
      track.stop();
      setLocalAudioTrack(null);
      setMicConnected(false);

      const sampleRateMap: Record<HuddleAudioQuality, number> = {
        low: 16000,
        medium: 24000,
        high: 48000,
      };
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: settings.noiseSuppression,
        noiseSuppression: settings.noiseSuppression,
        sampleRate: sampleRateMap[settings.quality],
      };
      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
        const newTrack = stream.getAudioTracks()[0];
        setLocalAudioTrack(newTrack);
        setMicConnected(true);

        const initialTransmitting =
          voiceInputModeRef.current !== "push_to_talk";
        const newWorklet = await setupAudioWorklet(
          newTrack,
          initialTransmitting,
        );
        newWorklet.setGain(micGainRef.current);
        workletRef.current = newWorklet;
      } catch (e) {
        console.error("[HuddleContext] reinitAudio failed:", e);
        // Mic stays disconnected — user can rejoin to recover
      }
    },
    [selectedDeviceId],
  );

  // Ref-track the current audio track so disconnectMedia is stable (no
  // dependency on localAudioTrack state). This prevents the unmount-cleanup
  // effect from re-firing mid-startup when setLocalAudioTrack triggers a
  // leaveHuddle dependency chain update.
  const audioTrackRef = React.useRef<MediaStreamTrack | null>(null);
  audioTrackRef.current = localAudioTrack;

  /** Stop AudioWorklet and mic track. Best-effort on all steps. */
  const disconnectMedia = React.useCallback(async () => {
    // Invalidate any in-flight startHuddle/joinHuddle
    tokenRef.current += 1;
    try {
      workletRef.current?.stop();
    } catch {
      /* best-effort */
    }
    workletRef.current = null;
    audioTrackRef.current?.stop();
    setLocalAudioTrack(null);
    setMicConnected(false);
    setIsMuted(false);
    setEphemeralChannelId(null);
    setHuddleParentChannelId(null);
    setActiveSpeakers([]);
  }, []); // Stable — reads track from ref, not state.

  const leaveHuddle = React.useCallback(async (): Promise<boolean> => {
    await disconnectMedia();
    try {
      // `leave_huddle` is idempotent in Rust. Always call it so a provider
      // remount cannot leave Rust's huddle state active while this ref is false.
      await invoke("leave_huddle");
      rustActiveRef.current = false;
    } catch {
      return false; // Signal that backend cleanup failed
    }
    return true; // Backend cleanup succeeded (or was not needed)
  }, [disconnectMedia]);

  /**
   * Clean up a partially-established huddle. Best-effort on every step.
   *
   * Takes explicit worklet/stream args (not from refs) because startHuddle/joinHuddle
   * may have local variables that differ from the refs mid-flight.
   */
  const cleanupFailedStart = React.useCallback(
    async (worklet: AudioWorkletHandle | null, isCreator: boolean) => {
      try {
        worklet?.stop();
      } catch {
        /* best-effort */
      }
      setLocalAudioTrack(null);
      setMicConnected(false);
      setEphemeralChannelId(null);
      setActiveSpeakers([]);
      if (rustActiveRef.current) {
        if (isCreator) {
          try {
            await invoke("end_huddle");
            rustActiveRef.current = false;
          } catch {
            try {
              await invoke("leave_huddle");
              rustActiveRef.current = false;
            } catch {}
          }
        } else {
          try {
            await invoke("leave_huddle");
            rustActiveRef.current = false;
          } catch {}
        }
      }
    },
    [],
  );

  /**
   * Clean up only this provider's media after its start token is superseded.
   * The action that changed the token owns backend teardown; issuing a global
   * leave here could terminate a replacement huddle started by a new provider.
   */
  const cleanupSupersededStart = React.useCallback(
    (worklet: AudioWorkletHandle | null) => {
      try {
        worklet?.stop();
      } catch {
        /* best-effort */
      }
      workletRef.current = null;
      rustActiveRef.current = false;
      setLocalAudioTrack(null);
      setMicConnected(false);
      setEphemeralChannelId(null);
      setActiveSpeakers([]);
    },
    [],
  );

  /** Shared media setup: get mic, setup AudioWorklet, confirm active.
   *  Used by both startHuddle and joinHuddle after the Rust backend call succeeds. */
  const connectAndSetupMedia = React.useCallback(
    async (
      joinInfo: HuddleJoinInfo,
      myToken: number,
    ): Promise<{
      worklet: AudioWorkletHandle;
      stream: MediaStream;
    }> => {
      // Fetch self pubkey once for TTS filtering
      if (!selfPubkeyRef.current) {
        try {
          const identity = await invoke<{ pubkey: string }>("get_identity");
          selfPubkeyRef.current = identity.pubkey;
        } catch {
          /* best-effort */
        }
      }

      if (tokenRef.current !== myToken) throw new Error("superseded");

      // Get mic — Rust backend owns the audio WS connection.
      // Request sample rate based on quality setting; default 48 kHz for high quality.
      const noiseSuppression =
        localStorage.getItem("huddle_noise_suppression") !== "false";
      const quality =
        (localStorage.getItem("huddle_audio_quality") as HuddleAudioQuality) ??
        "high";
      const sampleRateMap: Record<HuddleAudioQuality, number> = {
        low: 16000,
        medium: 24000,
        high: 48000,
      };
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: noiseSuppression,
        noiseSuppression: noiseSuppression,
        sampleRate: sampleRateMap[quality],
      };
      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      const audioTrack = stream.getAudioTracks()[0];

      // Wrap post-getUserMedia steps so the stream is always cleaned up on
      // failure — prevents the mic permission light staying on after errors.
      try {
        if (tokenRef.current !== myToken) {
          throw new Error("superseded");
        }

        setLocalAudioTrack(audioTrack);
        setMicConnected(true);

        // Setup AudioWorklet — PCM goes to Rust via push_audio_pcm
        const initialTransmitting =
          voiceInputModeRef.current !== "push_to_talk";
        const worklet = await setupAudioWorklet(
          audioTrack,
          initialTransmitting,
        );
        worklet.setGain(micGainRef.current);

        if (tokenRef.current !== myToken) {
          worklet.stop();
          throw new Error("superseded");
        }

        workletRef.current = worklet;
        setEphemeralChannelId(joinInfo.ephemeral_channel_id);
        await invoke("confirm_huddle_active");

        return { worklet, stream };
      } catch (err) {
        // Always stop the mic stream on any failure path.
        stream.getTracks().forEach((t) => {
          t.stop();
        });
        setLocalAudioTrack(null);
        setMicConnected(false);
        throw err;
      }
    },
    [selectedDeviceId],
  );

  const startHuddle = React.useCallback(
    async (
      parentChannelId: string,
      memberPubkeys: string[],
      channelName?: string,
      dmPubkeys?: string[],
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;

      tokenRef.current += 1;
      const myToken = tokenRef.current;

      setHuddleError(null);
      setIsStarting(true);
      try {
        const joinInfo = await invoke<HuddleJoinInfo>("start_huddle", {
          parentChannelId,
          memberPubkeys,
          channelName,
          dmPubkeys: dmPubkeys ?? null,
        });
        rustActiveRef.current = true;
        setHuddleParentChannelId(parentChannelId);
        try {
          await connectAndSetupMedia(joinInfo, myToken);
        } catch (e) {
          if (e instanceof Error && e.message === "superseded") {
            cleanupSupersededStart(workletRef.current);
            return;
          }
          throw e;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isRedundantHuddlePhaseError(msg)) {
          setHuddleError(null);
          return;
        }

        const w = workletRef.current;
        workletRef.current = null;
        await cleanupFailedStart(w, true);
        setHuddleError(formatHuddleActionError(e, "start"));
        console.error("Failed to start huddle:", e);
        throw e;
      } finally {
        setIsStarting(false);
        busyRef.current = false;
      }
    },
    [cleanupFailedStart, cleanupSupersededStart, connectAndSetupMedia],
  );

  const joinHuddle = React.useCallback(
    async (parentChannelId: string, ephemeralChannelId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      tokenRef.current += 1;
      const myToken = tokenRef.current;
      setHuddleError(null);
      setIsStarting(true);

      try {
        const joinInfo = await invoke<HuddleJoinInfo>("join_huddle", {
          parentChannelId,
          ephemeralChannelId,
        });
        rustActiveRef.current = true;
        setHuddleParentChannelId(parentChannelId);

        try {
          await connectAndSetupMedia(joinInfo, myToken);
        } catch (e) {
          if (e instanceof Error && e.message === "superseded") {
            cleanupSupersededStart(workletRef.current);
            return;
          }
          throw e;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isRedundantHuddlePhaseError(msg)) {
          setHuddleError(null);
          return;
        }

        const w = workletRef.current;
        workletRef.current = null;
        await cleanupFailedStart(w, false);
        setHuddleError(formatHuddleActionError(e, "join"));
        console.error("Failed to join huddle:", e);
        throw e;
      } finally {
        setIsStarting(false);
        busyRef.current = false;
      }
    },
    [cleanupFailedStart, cleanupSupersededStart, connectAndSetupMedia],
  );

  useTtsSubscription(ephemeralChannelId, selfPubkeyRef);

  // Pipeline hot-start — check if voice models finished downloading mid-huddle
  React.useEffect(() => {
    if (!ephemeralChannelId) return;
    const id = window.setInterval(() => {
      invoke("check_pipeline_hotstart").catch(() => {
        /* best-effort */
      });
    }, PIPELINE_HOTSTART_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [ephemeralChannelId]);

  // Mic level analyser — drives the voice activity indicator
  React.useEffect(() => {
    if (!localAudioTrack || !micConnected) {
      setMicLevel(0);
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(
      new MediaStream([localAudioTrack]),
    );
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    let raf = 0;
    let lastUpdate = 0;
    let voiceActive = false;
    let noiseFloor = MIC_INITIAL_NOISE_FLOOR;
    let smoothedLevel = 0;
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (now - lastUpdate < MIC_ANALYSER_UPDATE_INTERVAL_MS) return;
      lastUpdate = now;
      analyser.getFloatTimeDomainData(buf);

      let sumSquares = 0;
      for (let i = 0; i < buf.length; i += 1) {
        sumSquares += buf[i] * buf[i];
      }

      const rms = Math.sqrt(sumSquares / buf.length);
      const activeThreshold = Math.max(
        MIC_VOICE_GATE_ON_RMS,
        noiseFloor + MIC_VOICE_GATE_MARGIN_RMS,
      );
      const idleThreshold = Math.max(
        MIC_VOICE_GATE_OFF_RMS,
        noiseFloor + MIC_VOICE_GATE_MARGIN_RMS * 0.55,
      );
      voiceActive = voiceActive ? rms > idleThreshold : rms > activeThreshold;

      const floorRate =
        rms < noiseFloor
          ? 0.18
          : voiceActive
            ? MIC_ACTIVE_NOISE_FLOOR_RISE
            : 0.025;
      noiseFloor += (rms - noiseFloor) * floorRate;

      if (!voiceActive) {
        smoothedLevel = 0;
        setMicLevel(0);
        return;
      }

      const normalized = clamp01(
        (rms - noiseFloor) / MIC_LEVEL_ACTIVE_RANGE_RMS,
      );
      const targetLevel = Math.max(normalized, MIC_MIN_ACTIVE_LEVEL);
      smoothedLevel += (targetLevel - smoothedLevel) * MIC_LEVEL_ATTACK;
      setMicLevel(smoothedLevel);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    };
  }, [localAudioTrack, micConnected]);

  // Cleanup on unmount only — stable ref prevents re-firing mid-startup.
  const leaveHuddleRef = React.useRef(leaveHuddle);
  leaveHuddleRef.current = leaveHuddle;
  React.useEffect(() => {
    return () => {
      void leaveHuddleRef.current();
    };
  }, []);

  // Unexpected audio-owner/pod disconnects are recoverable: keep the huddle,
  // mic, and voice pipelines live while Rust reconnects only the audio WS.
  // `tokenRef` makes an intentional leave/start supersede this loop, and the
  // in-flight guard collapses duplicate disconnect events from failed dials.
  const audioReconnectInFlightRef = React.useRef(false);
  React.useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen("huddle-audio-disconnected", () => {
      if (cancelled || audioReconnectInFlightRef.current) return;
      audioReconnectInFlightRef.current = true;
      const reconnectToken = tokenRef.current;

      void (async () => {
        // Keep a long enough tail for Kubernetes Service endpoint removal after
        // a draining pod flips readiness. Early retries make remote-owner
        // handoff fast; the two 2s attempts prevent a client connected to the
        // draining pod itself from exhausting before kube-proxy converges.
        const delaysMs = [0, 100, 250, 500, 1_000, 2_000, 2_000];
        for (const delayMs of delaysMs) {
          if (cancelled || tokenRef.current !== reconnectToken) return;
          if (delayMs > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delayMs));
          }
          if (cancelled || tokenRef.current !== reconnectToken) return;
          try {
            await invoke("reconnect_huddle_audio");
            // Success installs a live replacement pipeline. If it later fails,
            // its Tauri event arrives after this loop releases the in-flight
            // guard and starts a fresh bounded recovery cycle. Repeating those
            // cycles is intentional while the relay remains connectable.
            return;
          } catch {
            // A draining pod may still receive the first retry before Service
            // endpoints converge. Keep the bounded backoff client-local.
          }
        }

        if (!cancelled && tokenRef.current === reconnectToken) {
          await leaveHuddleRef.current();
        }
      })().finally(() => {
        audioReconnectInFlightRef.current = false;
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <HuddleContext.Provider
      value={{
        localAudioTrack,
        isStarting,
        huddleError,
        clearHuddleError,
        micConnected,
        micLevel,
        pttActive,
        voiceInputMode,
        setVoiceInputMode,
        activeSpeakers,
        audioDevices,
        selectedDeviceId,
        setSelectedDeviceId,
        micGain,
        setMicGain,
        outputDevices,
        selectedOutputDevice,
        setSelectedOutputDevice,
        activeEphemeralChannelId: ephemeralChannelId,
        startHuddle,
        joinHuddle,
        leaveHuddle,
        screenShareActive,
        cameraShareActive,
        notesOpen,
        setNotesOpen,
        remoteVideoPublishers,
        localVideoStream,
        startScreenShare,
        stopScreenShare,
        startCameraShare,
        stopCameraShare,
        isPoppedOut,
        isMuted,
        toggleMute,
        reinitAudio,
      }}
    >
      {children}
    </HuddleContext.Provider>
  );
}

export function useHuddle(): HuddleContextValue {
  const ctx = React.useContext(HuddleContext);
  if (!ctx) {
    throw new Error("useHuddle must be used within a HuddleProvider");
  }
  return ctx;
}
