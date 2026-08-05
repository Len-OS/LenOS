import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_FORUM_COMMENT } from "@/shared/constants/kinds";
import type { Message } from "./use-messages";

export function useThreadReplies(
  rootId: string | null,
  channelId: string | null,
): Message[] {
  const [replies, setReplies] = useState<Message[]>([]);

  useEffect(() => {
    if (!rootId || !channelId) return;
    const client = getRelayClient(relayWsUrl());
    const subId = `thread-${rootId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: [KIND_FORUM_COMMENT],
        "#e": [rootId],
        "#h": [channelId],
      },
      onEvent: (raw) => {
        setReplies((prev) => {
          const id = raw.id as string;
          if (prev.some((r) => r.id === id)) return prev;
          return [
            ...prev,
            {
              id,
              pubkey: (raw.pubkey as string) ?? "",
              content: (raw.content as string) ?? "",
              createdAt: (raw.created_at as number) ?? 0,
              kind: (raw.kind as number) ?? KIND_FORUM_COMMENT,
              tags: (raw.tags as string[][]) ?? [],
            },
          ].sort((a, b) => a.createdAt - b.createdAt);
        });
      },
    });

    return () => {
      unsub();
      setReplies([]);
    };
  }, [rootId, channelId]);

  return replies;
}
