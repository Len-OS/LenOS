import { useState, useEffect } from "react";
import { relayClient } from "@/shared/api/relayClient";

interface PollData {
  question: string;
  options: string[];
  createdAt: number;
}

export function usePollData(pollId: string | null): PollData | null {
  const [data, setData] = useState<PollData | null>(null);

  useEffect(() => {
    if (!pollId) return;
    let disposed = false;
    let dispose: (() => void) | undefined;

    void relayClient
      .subscribeLive(
        { kinds: [30078], "#d": [`poll-${pollId}`], limit: 1 },
        (event) => {
          if (disposed) return;
          try {
            setData(JSON.parse(event.content as string) as PollData);
          } catch {
            // ignore malformed events
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
        console.error("Failed to subscribe to poll data", error);
      });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, [pollId]);

  return data;
}
