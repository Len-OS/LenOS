import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface Reaction {
  id: string;
  pubkey: string;
  content: string;
  targetId: string;
}

export function useReactions(
  channelId: string | null,
  messageIds: string[],
): Reaction[] {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    if (!channelId || messageIds.length === 0) return;
    const client = getRelayClient(relayWsUrl());
    const subId = `reactions-${channelId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: { kinds: [7], "#e": messageIds, "#h": [channelId] },
      onEvent: (raw) => {
        const id = raw.id as string;
        const pubkey = raw.pubkey as string;
        const content = (raw.content as string) || "+";
        const tags = (raw.tags as string[][]) ?? [];
        const targetId = tags.find((t) => t[0] === "e")?.[1];
        if (!targetId) return;
        setReactions((prev) => {
          if (prev.some((r) => r.id === id)) return prev;
          return [...prev, { id, pubkey, content, targetId }];
        });
      },
    });

    return unsub;
  }, [channelId, messageIds]);

  return reactions;
}
