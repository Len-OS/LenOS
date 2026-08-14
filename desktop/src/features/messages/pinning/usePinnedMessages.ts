import { useEffect, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import type { PinnedMessage } from "./types";

export function usePinnedMessages(channelId: string | null): PinnedMessage[] {
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!channelId) return;
    let disposed = false;
    let dispose: (() => void) | undefined;

    void relayClient
      .subscribeLive(
        { kinds: [30078], "#d": [`pins:${channelId}`], limit: 1 },
        (raw) => {
          try {
            const parsed = JSON.parse(raw.content as string) as {
              pins: PinnedMessage[];
            };
            setPins(parsed.pins ?? []);
          } catch {
            setPins([]);
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
        console.error("Failed to subscribe to pinned messages", error);
      });

    return () => {
      disposed = true;
      dispose?.();
      setPins([]);
    };
  }, [channelId]);

  return pins;
}
