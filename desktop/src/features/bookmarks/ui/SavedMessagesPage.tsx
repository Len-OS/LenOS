import * as React from "react";
import { Bookmark, BookmarkX } from "lucide-react";
import { useIdentityQuery } from "@/shared/api/hooks";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { TopChromeInsetHeader } from "@/shared/layout/TopChromeInsetHeader";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/UserAvatar";
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
  authorLabel,
  avatarUrl,
  onUnsave,
  isRemoving,
}: {
  message: SavedMessage;
  authorLabel: string;
  avatarUrl: string | null;
  onUnsave: (id: string) => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <UserAvatar
            avatarUrl={avatarUrl}
            displayName={authorLabel}
            size="xs"
          />
          <span className="text-xs font-medium text-foreground">
            {authorLabel}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatTimestamp(message.createdAt)}
          </span>
        </div>
        <p className="line-clamp-3 text-sm text-foreground/80">
          {message.content || "(no content)"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={isRemoving}
        onClick={() => onUnsave(message.eventId)}
        title="Remove bookmark"
        className="h-7 w-7 shrink-0 p-0"
        type="button"
      >
        <BookmarkX className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function SavedMessagesPage() {
  const identityQuery = useIdentityQuery();
  const currentPubkey = identityQuery.data?.pubkey ?? null;
  const { savedEvents, unsave, isLoading } = useBookmarks(currentPubkey);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const authorPubkeys = React.useMemo(
    () => [...new Set(savedEvents.map((m) => m.pubkey))],
    [savedEvents],
  );
  const usersBatchQuery = useUsersBatchQuery(authorPubkeys);
  const profiles = usersBatchQuery.data?.profiles;

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
    <section className="flex min-h-0 min-w-0 flex-col bg-background">
      <TopChromeInsetHeader flush>
        <div className="flex min-h-9 items-center gap-2 px-4 py-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Saved Messages</span>
          {savedEvents.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {savedEvents.length}
            </span>
          )}
        </div>
      </TopChromeInsetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : savedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Bookmark className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No saved messages yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Save messages from the message menu to find them here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {savedEvents.map((message) => {
              const profileKey = message.pubkey.toLowerCase();
              const profile = profiles?.[profileKey];
              const authorLabel =
                profile?.displayName ?? truncatePubkey(message.pubkey);
              const avatarUrl = profile?.avatarUrl ?? null;
              return (
                <SavedMessageRow
                  key={message.id}
                  message={message}
                  authorLabel={authorLabel}
                  avatarUrl={avatarUrl}
                  onUnsave={(id) => void handleUnsave(id)}
                  isRemoving={removingId === message.eventId}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
