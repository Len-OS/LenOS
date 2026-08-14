import { useState } from "react";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import type { PinnedMessage } from "./types";

interface Props {
  pins: PinnedMessage[];
  isAdmin: boolean;
  onJumpTo: (eventId: string) => void;
  onUnpin: (eventId: string) => void;
}

export function PinnedMessagesBar({ pins, isAdmin, onJumpTo, onUnpin }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (pins.length === 0) return null;

  return (
    <div className="border-b border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Pin className="h-3.5 w-3.5 shrink-0 text-black/50 dark:text-white/50" />
        <span className="text-xs font-medium text-black/70 dark:text-white/70">
          {pins.length} pinned {pins.length === 1 ? "message" : "messages"}
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {pins.map((pin) => (
            <div
              key={pin.eventId}
              className="flex items-center gap-2 px-4 py-2"
            >
              <p className="min-w-0 flex-1 truncate text-xs text-black/70 dark:text-white/70">
                {pin.content ?? "Message"}
              </p>
              <button
                type="button"
                onClick={() => onJumpTo(pin.eventId)}
                className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Jump
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onUnpin(pin.eventId)}
                  className="shrink-0 text-xs text-red-500 hover:underline"
                >
                  Unpin
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
