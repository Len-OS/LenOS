import { Phone, Smile, Users } from "lucide-react";
import { useState } from "react";
import { useHuddle } from "../HuddleContext";
import { MicControls } from "./MicControls";
import { HuddleParticipants } from "./HuddleParticipants";

const EMOJI_CHARS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "💡", "🚀"];

export function HuddleBar() {
  const { phase, leaveHuddle, sendReaction, reactions } = useHuddle();
  const [showP, setShowP] = useState(false);
  const [showR, setShowR] = useState(false);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-t border-black/10 bg-white px-4 shadow-xl dark:border-white/10 dark:bg-[#111]">
      <div className="w-48 truncate text-xs text-black/40 dark:text-white/40">
        {phase === "connecting" ? "Connecting..." : "In huddle"}
      </div>

      <div className="flex items-center gap-2">
        <MicControls />

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
  );
}
