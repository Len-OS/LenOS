import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";

export const KIND_HUDDLE_NOTES = 30810;

export async function publishHuddleNotes(
  content: string,
  startedEventId: string,
  parentChannelId: string,
): Promise<void> {
  await relayClient.preconnect();
  const event = await signRelayEvent({
    kind: KIND_HUDDLE_NOTES,
    content,
    tags: [
      ["e", startedEventId],
      ["h", parentChannelId],
      ["d", startedEventId],
    ],
  });
  await relayClient.publishEvent(
    event,
    "Notes save timed out.",
    "Failed to save notes.",
  );
}

export function subscribeHuddleNotes(
  startedEventId: string,
  onUpdate: (content: string, updatedAt: number) => void,
): () => void {
  let latestAt = 0;
  let cleanup: (() => void) | null = null;

  void relayClient
    .subscribeLive(
      {
        kinds: [KIND_HUDDLE_NOTES],
        "#e": [startedEventId],
        limit: 1,
      },
      (event: RelayEvent) => {
        const createdAt = event.created_at ?? 0;
        if (createdAt > latestAt) {
          latestAt = createdAt;
          onUpdate(event.content, createdAt);
        }
      },
    )
    .then((dispose) => {
      cleanup = () => void dispose();
    });

  return () => cleanup?.();
}
