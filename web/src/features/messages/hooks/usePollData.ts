import { useState, useEffect } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface PollData {
  question: string;
  options: string[];
  createdAt: number;
}

export function usePollData(pollId: string | null): PollData | null {
  const [data, setData] = useState<PollData | null>(null);
  useEffect(() => {
    if (!pollId) return;
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `poll-data-${pollId}`,
      filter: { kinds: [30078], "#d": [`poll-${pollId}`], limit: 1 },
      onEvent: (event) => {
        try {
          setData(JSON.parse(event.content as string) as PollData);
        } catch {
          // ignore malformed events
        }
      },
    });
    return () => unsub();
  }, [pollId]);
  return data;
}
