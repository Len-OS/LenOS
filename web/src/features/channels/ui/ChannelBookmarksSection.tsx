import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, ChevronRight, X } from "lucide-react";
import { useChannelBookmarks } from "@/features/bookmarks/lib/useChannelBookmarks";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { relativeTime } from "@/shared/lib/relative-time";
import type { NostrEvent } from "@/shared/lib/nostr-client";

interface Props {
  channelId: string;
  currentPubkey: string | null;
  onJumpToMessage: (messageId: string) => void;
}

export function ChannelBookmarksSection({
  channelId,
  currentPubkey,
  onJumpToMessage,
}: Props) {
  const { bookmarkedIds, unbookmark } = useChannelBookmarks(
    currentPubkey,
    channelId,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [events, setEvents] = useState<Map<string, NostrEvent>>(new Map());

  useEffect(() => {
    if (bookmarkedIds.size === 0) {
      setEvents(new Map());
      return;
    }

    const ids = Array.from(bookmarkedIds);
    queryEvents(relayWsUrl(), { ids, limit: ids.length })
      .then((fetched) => {
        setEvents(new Map(fetched.map((e) => [e.id, e])));
      })
      .catch(() => {});
  }, [bookmarkedIds]);

  if (bookmarkedIds.size === 0) return null;

  return (
    <div className="border-t border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
        <Bookmark className="h-3 w-3 shrink-0" />
        <span className="flex-1">Bookmarks</span>
        <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
          {bookmarkedIds.size}
        </span>
      </button>

      {!collapsed && (
        <div className="pb-2">
          {Array.from(bookmarkedIds).map((id) => {
            const event = events.get(id);
            return (
              <div
                key={id}
                className="group relative mx-2 mb-0.5 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <button
                  type="button"
                  onClick={() => onJumpToMessage(id)}
                  className="w-full text-left"
                >
                  <p className="truncate text-xs text-black/80 dark:text-white/80">
                    {event
                      ? event.content.slice(0, 80) || "(no text)"
                      : `${id.slice(0, 12)}…`}
                  </p>
                  {event && (
                    <p className="mt-0.5 text-[10px] text-black/40 dark:text-white/40">
                      {relativeTime(event.created_at)}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Remove bookmark"
                  onClick={() => void unbookmark(id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-black/30 opacity-0 hover:bg-black/10 hover:text-black group-hover:opacity-100 dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
