import { useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { PinnedMessage } from "./types";

export function usePinMessage(channelId: string, currentPins: PinnedMessage[]) {
  const publish = useCallback(
    async (newPins: PinnedMessage[]) => {
      const signed = await signNostrEvent(
        {
          kind: 30078,
          content: JSON.stringify({ pins: newPins }),
          tags: [["d", `pins:${channelId}`]],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [channelId],
  );

  const pin = useCallback(
    async (eventId: string, pinnedBy: string, content?: string) => {
      if (currentPins.some((p) => p.eventId === eventId)) return; // already pinned
      const newPins: PinnedMessage[] = [
        ...currentPins,
        { eventId, pinnedBy, pinnedAt: Math.floor(Date.now() / 1000), content },
      ];
      await publish(newPins);
    },
    [currentPins, publish],
  );

  const unpin = useCallback(
    async (eventId: string) => {
      const newPins = currentPins.filter((p) => p.eventId !== eventId);
      await publish(newPins);
    },
    [currentPins, publish],
  );

  return { pin, unpin };
}
