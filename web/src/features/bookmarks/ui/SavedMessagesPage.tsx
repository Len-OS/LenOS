import { useEffect, useState } from "react";
import { Bookmark, BookmarkX } from "lucide-react";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useProfile } from "@/features/profiles/use-profile";
import {
  useBookmarks,
  type SavedMessage,
} from "@/features/bookmarks/lib/useBookmarks";

function formatTimestamp(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SavedMessageRow({
  message,
  onUnsave,
  isRemoving,
}: {
  message: SavedMessage;
  onUnsave: (id: string) => void;
  isRemoving: boolean;
}) {
  const profile = useProfile(message.pubkey);
  const displayName = profile?.name || message.pubkey.slice(0, 8) + "...";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-black/50 dark:text-white/50">
          {displayName}
        </p>
        <p className="mt-1 line-clamp-3 text-sm text-black/80 dark:text-white/80">
          {message.content || "(no content)"}
        </p>
        <p className="mt-1 text-xs text-black/30 dark:text-white/30">
          {formatTimestamp(message.createdAt)}
        </p>
      </div>
      <button
        type="button"
        disabled={isRemoving}
        onClick={() => onUnsave(message.eventId)}
        aria-label="Remove bookmark"
        className="shrink-0 rounded p-1 text-black/30 hover:bg-black/5 hover:text-red-500 disabled:opacity-50 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-red-400"
      >
        <BookmarkX className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SavedMessagesPage() {
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { savedEvents, unsave, isLoading } = useBookmarks(currentPubkey);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  async function handleUnsave(eventId: string) {
    setRemovingId(eventId);
    try {
      await unsave(eventId);
    } catch {
      // ignore
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <Bookmark className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">
          Saved Messages
        </span>
        {savedEvents.length > 0 && (
          <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
            {savedEvents.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-black/5 dark:bg-white/5"
              />
            ))}
          </div>
        ) : savedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Bookmark className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No saved messages yet
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Save messages from the message menu to find them here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {savedEvents.map((message) => (
              <SavedMessageRow
                key={message.id}
                message={message}
                onUnsave={(id) => void handleUnsave(id)}
                isRemoving={removingId === message.eventId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
