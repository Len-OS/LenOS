import { useState, useEffect } from "react";
import { relayClient } from "@/shared/api/relayClient";

export function usePollVotes(
  pollEventId: string | null,
): Map<string, Set<string>> {
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (!pollEventId) return;
    let disposed = false;
    let dispose: (() => void) | undefined;

    void relayClient
      .subscribeLive(
        { kinds: [7], "#e": [pollEventId], limit: 1000 },
        (event) => {
          if (disposed) return;
          setVotes((prev) => {
            const next = new Map(prev);
            const optionIdx = event.content as string;
            const set = new Set(next.get(optionIdx) ?? []);
            set.add(event.pubkey as string);
            next.set(optionIdx, set);
            return next;
          });
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
        console.error("Failed to subscribe to poll votes", error);
      });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [pollEventId]);

  return votes;
}
