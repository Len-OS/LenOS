import { useEffect, useState } from "react";
import { Hash, Plus, Settings } from "lucide-react";
import { SettingsModal } from "@/features/settings/ui/SettingsModal";
import { CreateChannelModal } from "@/features/channels/ui/CreateChannelModal";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { hasUnread } from "@/features/channels/unreadChannelCounts";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";

const UNREAD_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
];

interface Props {
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelsSidebar({ activeChannelId, onSelectChannel }: Props) {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const workspace = useWorkspace();
  const [lastMsgAt, setLastMsgAt] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  // Subscribe to recent messages across all channels to detect unread state
  // biome-ignore lint/correctness/useExhaustiveDependencies: channels identity changes on every relay event; using channels.length+communityId avoids infinite loop
  useEffect(() => {
    if (channels.length === 0) return;
    const channelIds = channels.map((c) => c.id);
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 86400 * 30;
    const subId = "sidebar-unread";

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: UNREAD_KINDS,
        "#h": channelIds,
        since,
        limit: 500,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1];
        const ts = raw.created_at as number;
        if (!channelId || !ts) return;
        setLastMsgAt((prev) => {
          if ((prev[channelId] ?? 0) >= ts) return prev;
          return { ...prev, [channelId]: ts };
        });
      },
    });

    return unsub;
  }, [channels.length, communityId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="truncate font-semibold text-black dark:text-white">
          {workspaceName}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-1 flex items-center px-4">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
            Channels
          </span>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create channel"
            className="rounded p-0.5 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {channels.length === 0 && (
          <div className="px-4 py-2 text-sm text-black/40 dark:text-white/40">
            No channels yet
          </div>
        )}

        {channels.map((ch) => {
          const isActive = activeChannelId === ch.id;
          const isUnread = !isActive && hasUnread(ch.id, lastMsgAt[ch.id] ?? 0);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onSelectChannel(ch.id)}
              className={[
                "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white"
                  : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5",
              ].join(" ")}
            >
              <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <span className="truncate">{ch.name}</span>
              {isUnread && (
                <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-black/10 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <CreateChannelModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        communityId={communityId ?? ""}
      />
    </div>
  );
}
