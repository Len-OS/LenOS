import { useState } from "react";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/shared/ui/button";
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
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
      >
        <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {pins.length} pinned {pins.length === 1 ? "message" : "messages"}
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-border/50">
          {pins.map((pin) => (
            <div
              key={pin.eventId}
              className="flex items-center gap-2 px-3 py-1.5"
            >
              <p className="min-w-0 flex-1 truncate text-xs text-foreground/70">
                {pin.content ?? "Message"}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => onJumpTo(pin.eventId)}
              >
                Jump
              </Button>
              {isAdmin && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-destructive"
                  onClick={() => onUnpin(pin.eventId)}
                >
                  Unpin
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
