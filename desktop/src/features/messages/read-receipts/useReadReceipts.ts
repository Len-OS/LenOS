import { useEffect, useMemo, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import type { ReadReceipt } from "./types";

export function useReadReceipts(
  channelId: string | null,
): Map<string, ReadReceipt> {
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const { data: members } = useRelayMembersQuery();
  const memberPubkeys = useMemo(
    () => (members ?? []).map((m) => m.pubkey),
    [members],
  );

  useEffect(() => {
    if (!channelId || memberPubkeys.length === 0) return;
    let disposed = false;
    let dispose: (() => void) | undefined;

    void relayClient
      .subscribeLive(
        {
          kinds: [30078],
          "#d": [`read:${channelId}`],
          authors: memberPubkeys,
          limit: 1,
        },
        (event) => {
          if (disposed) return;
          try {
            const data = JSON.parse(event.content as string) as {
              last_read_event_id: string;
              last_read_at: number;
            };
            setReceipts((prev) => {
              const next = new Map(prev);
              next.set(event.pubkey, { pubkey: event.pubkey, ...data });
              return next;
            });
          } catch {
            // ignore malformed
          }
        },
      )
      .then((unsubscribe) => {
        if (disposed) {
          void unsubscribe();
        } else {
          dispose = () => {
            void unsubscribe();
          };
        }
      })
      .catch((error) => {
        console.error("Failed to subscribe to read receipts", error);
      });

    return () => {
      disposed = true;
      dispose?.();
      setReceipts(new Map());
    };
  }, [channelId, memberPubkeys]);

  return receipts;
}
