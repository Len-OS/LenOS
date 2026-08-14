import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { PinnedMessage } from "./types";

export function usePinnedMessages(channelId: string): PinnedMessage[] {
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());
    const dTag = `pins:${channelId}`;
    const unsub = client.subscribe({
      id: `pins-${channelId}`,
      filter: { kinds: [30078], "#d": [dTag] },
      onEvent: (raw) => {
        try {
          const parsed = JSON.parse(raw.content as string) as {
            pins: PinnedMessage[];
          };
          setPins(parsed.pins ?? []);
        } catch {
          setPins([]);
        }
      },
    });
    return () => {
      unsub();
      setPins([]);
    };
  }, [channelId]);

  return pins;
}
