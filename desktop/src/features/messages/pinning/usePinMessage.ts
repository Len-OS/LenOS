import { useCallback } from "react";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";
import type { PinnedMessage } from "./types";

export function usePinMessage(
  channelId: string | null,
  currentPins: PinnedMessage[],
) {
  const publish = useCallback(
    async (newPins: PinnedMessage[]) => {
      if (!channelId) return;
      const event = await signRelayEvent({
        kind: 30078,
        content: JSON.stringify({ pins: newPins }),
        tags: [["d", `pins:${channelId}`]],
      });
      await relayClient.publishEvent(
        event,
        "Timed out pinning message.",
        "Failed to pin message.",
      );
    },
    [channelId],
  );

  const pin = useCallback(
    async (eventId: string, pinnedBy: string, content?: string) => {
      if (currentPins.some((p) => p.eventId === eventId)) return;
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
      await publish(currentPins.filter((p) => p.eventId !== eventId));
    },
    [currentPins, publish],
  );

  return { pin, unpin };
}
