import { useEffect, useRef, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_FORUM_COMMENT,
  KIND_FORUM_POST,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

export interface PulseItem {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  channelId: string;
  createdAt: number;
}

const PULSE_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_FORUM_POST,
  KIND_FORUM_COMMENT,
];

export function usePulseFeed(communityId: string | null): PulseItem[] {
  const [items, setItems] = useState<Map<string, PulseItem>>(new Map());
  const since = useRef(Math.floor(Date.now() / 1000) - 86400 * 7);

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `pulse-feed-${communityId}`,
      filter: {
        kinds: PULSE_KINDS,
        "#h": [communityId],
        since: since.current,
        limit: 200,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? "";
        const item: PulseItem = {
          id: raw.id as string,
          kind: raw.kind as number,
          pubkey: raw.pubkey as string,
          content: raw.content as string,
          channelId,
          createdAt: raw.created_at as number,
        };
        setItems((prev) => {
          if (prev.has(item.id)) return prev;
          const next = new Map(prev);
          next.set(item.id, item);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setItems(new Map());
    };
  }, [communityId]);

  return Array.from(items.values()).sort((a, b) => b.createdAt - a.createdAt);
}
