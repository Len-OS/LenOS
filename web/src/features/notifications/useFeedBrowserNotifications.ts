import { useEffect, useRef } from "react";
import { nip19 } from "nostr-tools";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
import type { Channel } from "@/features/channels/use-channels";
import { showNotification } from "@/features/notifications/lib/browser";
import {
  resolveNotificationChannelLabel,
  truncateNotificationBody,
  formatNotificationTitle,
} from "@/features/notifications/lib/notificationFormat";

interface Props {
  channels: Channel[];
  currentPubkey: string | null;
  communityId: string | null;
}

export function useFeedBrowserNotifications({
  channels,
  currentPubkey,
  communityId,
}: Props) {
  const startedAt = useRef(Math.floor(Date.now() / 1000));

  // biome-ignore lint/correctness/useExhaustiveDependencies: channels identity changes on every relay event; channels.length+communityId+currentPubkey drive resubscription
  useEffect(() => {
    if (!communityId || !currentPubkey) return;

    const channelIds = channels.map((c) => c.id);
    if (channelIds.length === 0) return;

    let npub: string | null = null;
    try {
      npub = nip19.npubEncode(currentPubkey);
    } catch {}

    const client = getRelayClient(relayWsUrl());
    const since = startedAt.current;

    const unsub = client.subscribe({
      id: `feed-notif-${communityId}`,
      filter: {
        kinds: [...CHANNEL_TIMELINE_CONTENT_KINDS],
        "#h": channelIds,
        since,
      },
      onEvent: (raw) => {
        const ts = raw.created_at as number;
        if (ts < since) return;
        if ((raw.pubkey as string) === currentPubkey) return;

        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? null;
        const content = (raw.content as string) ?? "";

        const isMention =
          tags.some(
            (t) =>
              t[0] === "p" &&
              t[1]?.toLowerCase() === currentPubkey.toLowerCase(),
          ) ||
          (npub !== null && content.includes(npub));

        if (!isMention) return;

        const channelLabel = resolveNotificationChannelLabel(
          channelId,
          channels,
        );
        const title = formatNotificationTitle({
          prefix: "New mention",
          channelLabel,
        });
        const body = truncateNotificationBody(content, "New message");
        showNotification(title, body);
      },
    });

    return unsub;
  }, [communityId, currentPubkey, channels.length]);
}
