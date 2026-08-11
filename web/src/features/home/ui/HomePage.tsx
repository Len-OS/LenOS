import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useChannels } from "@/features/channels/use-channels";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useHomeInbox, type InboxItem } from "../useHomeInbox";
import { InboxItemRow } from "./InboxItemRow";
import { InboxDetailPane } from "./InboxDetailPane";
import { LenGrowthWorkspaceWelcome } from "@/features/onboarding/ui/LenGrowthWorkspaceWelcome";

function dateLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(
  items: ReturnType<typeof useHomeInbox>["items"],
): [string, typeof items][] {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const label = dateLabel(item.createdAt);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return [...groups.entries()];
}

export function HomePage() {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  const { items, markRead, markAllRead } = useHomeInbox(currentPubkey);
  const unreadCount = items.filter((i) => !i.isRead).length;
  const groups = groupByDate(items);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-black/40 dark:text-white/40" />
            <span className="font-semibold text-black dark:text-white">
              Inbox
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <LenGrowthWorkspaceWelcome />
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Inbox className="h-10 w-10 text-black/20 dark:text-white/20" />
              <div>
                <p className="text-sm font-medium text-black/50 dark:text-white/50">
                  No mentions yet
                </p>
                <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                  Messages that mention you will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {groups.map(([label, groupItems]) => (
                <div key={label}>
                  <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
                    {label}
                  </div>
                  {groupItems.map((item) => (
                    <InboxItemRow
                      key={item.messageId}
                      item={item}
                      channels={channels}
                      active={selectedItem?.messageId === item.messageId}
                      onClick={() => {
                        markRead(item.messageId);
                        setSelectedItem(item);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <div className="w-[400px] shrink-0">
          <InboxDetailPane
            item={selectedItem}
            channels={channels}
            onClose={() => setSelectedItem(null)}
          />
        </div>
      )}
    </div>
  );
}
