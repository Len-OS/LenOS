import { FileText, Keyboard, Monitor, Phone, Smile, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { useHuddle } from "../HuddleContext";
import { MicControls } from "./MicControls";
import { HuddleParticipants } from "./HuddleParticipants";
import { HuddleNotesPanel } from "./HuddleNotesPanel";
import { HuddleVideo } from "./HuddleVideo";

const EMOJI_CHARS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "💡", "🚀"];

export function HuddleBar() {
  const {
    phase,
    leaveHuddle,
    sendReaction,
    reactions,
    inputMode,
    setInputMode,
    muted,
    notesOpen,
    setNotesOpen,
    screenShareActive,
    remotePresenterPubkey,
    setRemotePresenterPubkey,
    startScreenShare,
    stopScreenShare,
    parentChannelId,
    ephemeralChannelId,
  } = useHuddle();
  const [showP, setShowP] = useState(false);
  const [showR, setShowR] = useState(false);

  // Stable presenter-change callback so HuddleVideo's useEffect doesn't thrash
  const handlePresenterChange = useCallback(
    (pk: string | null) => setRemotePresenterPubkey(pk),
    [setRemotePresenterPubkey],
  );

  if (phase === "idle") return null;

  const isPtt = inputMode === "push_to_talk";
  const isPttActive = isPtt && !muted;
  const hasVideo = screenShareActive || remotePresenterPubkey !== null;

  const handleScreenShare = () => {
    if (screenShareActive) {
      stopScreenShare();
    } else {
      void startScreenShare();
    }
  };

  return (
    <>
      {notesOpen && parentChannelId && ephemeralChannelId && (
        <HuddleNotesPanel
          startedEventId={ephemeralChannelId}
          parentChannelId={parentChannelId}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {/* HuddleVideo is always mounted when active so it can receive
          presenter_joined notifications; the panel is only visible when
          there is actually a presenter or local screen share is active. */}
      {phase === "active" && ephemeralChannelId && (
        <div
          className={
            "fixed bottom-14 left-0 right-0 z-40 border-t border-black/10 bg-white dark:border-white/10 dark:bg-[#111] " +
            (hasVideo ? "" : "hidden")
          }
        >
          <HuddleVideo
            ephemeralChannelId={ephemeralChannelId}
            screenShareActive={screenShareActive}
            remotePresenterPubkey={remotePresenterPubkey}
            onPresenterChange={handlePresenterChange}
          />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-t border-black/10 bg-white px-4 shadow-xl dark:border-white/10 dark:bg-[#111]">
        <div className="w-48 truncate text-xs text-black/40 dark:text-white/40">
          {phase === "connecting" ? (
            "Connecting..."
          ) : isPtt && muted ? (
            <span className="font-medium text-black/60 dark:text-white/60">
              Hold Space to talk
            </span>
          ) : (
            "In huddle"
          )}
        </div>

        <div className="flex items-center gap-2">
          <MicControls />

          {/* PTT toggle */}
          <button
            type="button"
            onClick={() =>
              setInputMode(isPtt ? "voice_activity" : "push_to_talk")
            }
            aria-label={
              isPtt
                ? "Switch to voice activity mode"
                : "Switch to push-to-talk mode"
            }
            className={
              "rounded-full p-2 transition-colors " +
              (isPttActive
                ? "bg-green-500/20 text-green-500"
                : isPtt
                  ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
                  : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
            }
          >
            <Keyboard className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowR((v) => !v)}
              className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              aria-label="Send reaction"
            >
              <Smile className="h-4 w-4" />
            </button>
            {showR && (
              <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl border border-black/10 bg-white px-3 py-2 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
                <div className="flex gap-1">
                  {EMOJI_CHARS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        void sendReaction(e, "user");
                        setShowR(false);
                      }}
                      className="rounded p-1 text-xl hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowP((v) => !v)}
              className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              aria-label="Participants"
            >
              <Users className="h-4 w-4" />
            </button>
            {showP && <HuddleParticipants onClose={() => setShowP(false)} />}
          </div>

          {/* Notes toggle */}
          <button
            type="button"
            onClick={() => setNotesOpen(!notesOpen)}
            aria-label="Huddle notes"
            className={
              "rounded-full p-2 transition-colors " +
              (notesOpen
                ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
                : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
            }
          >
            <FileText className="h-4 w-4" />
          </button>

          {/* Screen share */}
          <button
            type="button"
            onClick={handleScreenShare}
            disabled={!screenShareActive && remotePresenterPubkey !== null}
            aria-label={
              screenShareActive
                ? "Stop screen share"
                : remotePresenterPubkey !== null
                  ? "Someone else is sharing"
                  : "Share screen"
            }
            className={
              "rounded-full p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
              (screenShareActive
                ? "bg-blue-500/20 text-blue-500"
                : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
            }
          >
            <Monitor className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void leaveHuddle()}
            disabled={phase === "leaving"}
            className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            aria-label="Leave huddle"
          >
            <Phone className="h-4 w-4 rotate-[135deg]" />
            Leave
          </button>
        </div>

        <div className="flex w-48 justify-end gap-1 overflow-hidden">
          {reactions.slice(-5).map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className="animate-bounce text-xl">
              {r.emoji}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
