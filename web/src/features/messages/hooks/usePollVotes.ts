import { useState, useEffect } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function usePollVotes(
  pollEventId: string | null,
): Map<string, Set<string>> {
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    if (!pollEventId) return;
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `poll-votes-${pollEventId}`,
      filter: { kinds: [7], "#e": [pollEventId] },
      onEvent: (event) => {
        setVotes((prev) => {
          const next = new Map(prev);
          const optionIdx = event.content as string;
          const set = new Set(next.get(optionIdx) ?? []);
          set.add(event.pubkey as string);
          next.set(optionIdx, set);
          return next;
        });
      },
    });
    return () => unsub();
  }, [pollEventId]);
  return votes;
}
