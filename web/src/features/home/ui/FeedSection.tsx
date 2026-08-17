import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { KIND_STREAM_MESSAGE_V2 } from "@/shared/constants/kinds";
import { useProfile } from "@/features/profiles/use-profile";
import { useChannels } from "@/features/channels/use-channels";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface FeedEvent {
  id: string;
  pubkey: string;
  content: string;
  channelId: string;
  createdAt: number;
}

function FeedRow({
  event,
  channels,
}: {
  event: FeedEvent;
  channels: ReturnType<typeof useChannels>;
}) {
  const profile = useProfile(event.pubkey);
  const name = profile?.name ?? truncatePubkey(event.pubkey);
  const channel = channels.find((c) => c.id === event.channelId);

  const diffSec = Math.floor(Date.now() / 1000) - event.createdAt;
  const time =
    diffSec < 60
      ? "just now"
      : diffSec < 3600
        ? `${Math.floor(diffSec / 60)}m`
        : diffSec < 86400
          ? `${Math.floor(diffSec / 3600)}h`
          : `${Math.floor(diffSec / 86400)}d`;

  return (
    <div className="flex items-start gap-3 border-b border-black/5 px-4 py-2.5 dark:border-white/5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-semibold text-black/50 dark:bg-white/10 dark:text-white/50">
        {name[0]?.toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-black dark:text-white">
            {name}
          </span>
          {channel && (
            <span className="text-xs text-black/30 dark:text-white/30">
              #{channel.name}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-black/30 dark:text-white/30">
            {time}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-black/60 dark:text-white/60">
          {event.content}
        </p>
      </div>
    </div>
  );
}

export function FeedSection() {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const [events, setEvents] = useState<FeedEvent[]>([]);

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 86400;

    const unsub = client.subscribe({
      id: `home-feed-${communityId}`,
      filter: {
        kinds: [KIND_STREAM_MESSAGE_V2],
        "#h": [communityId],
        since,
        limit: 50,
      },
      onEvent: (raw) => {
        const id = raw.id as string;
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? "";
        const event: FeedEvent = {
          id,
          pubkey: raw.pubkey as string,
          content: raw.content as string,
          channelId,
          createdAt: raw.created_at as number,
        };
        setEvents((prev) => {
          if (prev.some((e) => e.id === id)) return prev;
          return [event, ...prev].slice(0, 100);
        });
      },
    });

    return () => {
      unsub();
      setEvents([]);
    };
  }, [communityId]);

  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Activity className="h-10 w-10 text-black/20 dark:text-white/20" />
        <div>
          <p className="text-sm font-medium text-black/50 dark:text-white/50">
            No activity yet
          </p>
          <p className="mt-1 text-xs text-black/30 dark:text-white/30">
            Recent messages from your workspace will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      {sorted.map((event) => (
        <FeedRow key={event.id} event={event} channels={channels} />
      ))}
    </div>
  );
}
