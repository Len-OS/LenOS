import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export const KIND_HUDDLE_NOTES = 30810;

export async function publishHuddleNotes(
  content: string,
  startedEventId: string,
  parentChannelId: string,
): Promise<void> {
  const signed = await signNostrEvent({
    kind: KIND_HUDDLE_NOTES,
    content,
    tags: [
      ["e", startedEventId],
      ["h", parentChannelId],
      ["d", startedEventId],
    ],
  });
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
}

export function subscribeHuddleNotes(
  startedEventId: string,
  onUpdate: (content: string, updatedAt: number) => void,
): () => void {
  let latestAt = 0;
  return getRelayClient(relayWsUrl()).subscribe({
    id: `huddle-notes-${startedEventId}`,
    filter: {
      kinds: [KIND_HUDDLE_NOTES],
      "#e": [startedEventId],
      limit: 1,
    },
    onEvent: (raw) => {
      const createdAt = (raw.created_at as number) ?? 0;
      if (createdAt > latestAt) {
        latestAt = createdAt;
        onUpdate(raw.content as string, createdAt);
      }
    },
  });
}
