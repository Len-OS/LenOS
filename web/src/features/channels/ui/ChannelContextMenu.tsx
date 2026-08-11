import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Check,
  MoreHorizontal,
  Settings,
  Star,
} from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";

interface Props {
  isStarred: boolean;
  isMuted: boolean;
  isAdmin: boolean;
  onStar: () => void;
  onMute: () => void;
  onMarkRead: () => void;
  onSettings: () => void;
}

export function ChannelContextMenu({
  isStarred,
  isMuted,
  isAdmin,
  onStar,
  onMute,
  onMarkRead,
  onSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`absolute right-3 top-1/2 -translate-y-1/2 ${open ? "flex" : "hidden group-hover:flex"}`}
    >
      <button
        type="button"
        aria-label="Channel options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <DropdownMenuContent className="w-40">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onStar();
              setOpen(false);
            }}
          >
            <Star className="h-3.5 w-3.5" />
            {isStarred ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onMute();
              setOpen(false);
            }}
          >
            {isMuted ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            {isMuted ? "Unmute" : "Mute"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
              setOpen(false);
            }}
          >
            <Check className="h-3.5 w-3.5" />
            Mark as read
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSettings();
                  setOpen(false);
                }}
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      )}
    </div>
  );
}
