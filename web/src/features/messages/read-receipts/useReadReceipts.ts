import { useState, useEffect, useMemo } from "react";
import { useMembers } from "@/features/channels/useMembers";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { ReadReceipt } from "./types";

export function useReadReceipts(
  channelId: string | null,
): Map<string, ReadReceipt> {
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const members = useMembers(channelId);
  const memberPubkeys = useMemo(() => members.map((m) => m.pubkey), [members]);

  useEffect(() => {
    if (!channelId || memberPubkeys.length === 0) return;
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `read-receipts-${channelId}`,
      filter: {
        kinds: [30078],
        "#d": [`read:${channelId}`],
        authors: memberPubkeys,
      },
      onEvent: (event) => {
        try {
          const data = JSON.parse(event.content as string) as {
            last_read_event_id: string;
            last_read_at: number;
          };
          setReceipts((prev) => {
            const next = new Map(prev);
            next.set(event.pubkey as string, {
              pubkey: event.pubkey as string,
              ...data,
            });
            return next;
          });
        } catch {
          // ignore malformed events
        }
      },
    });
    return () => {
      unsub();
      setReceipts(new Map());
    };
  }, [channelId, memberPubkeys]);

  return receipts;
}
