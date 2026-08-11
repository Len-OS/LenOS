import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_HUDDLE_REACTION } from "@/shared/constants/kinds";

export interface HuddleReaction {
  emoji: string;
  senderName: string;
  pubkey: string;
}

export async function publishHuddleReaction(
  emoji: string,
  ephChanId: string,
  senderName: string,
): Promise<void> {
  const signed = await signNostrEvent({
    kind: KIND_HUDDLE_REACTION,
    content: emoji,
    tags: [
      ["h", ephChanId],
      ["reaction", emoji],
      ["sender_name", senderName],
    ],
  });
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
}

export function subscribeHuddleReactions(
  ephChanId: string,
  onReaction: (r: HuddleReaction) => void,
): () => void {
  return getRelayClient(relayWsUrl()).subscribe({
    id: "huddle-reactions-" + ephChanId,
    filter: { kinds: [KIND_HUDDLE_REACTION], "#h": [ephChanId], limit: 0 },
    onEvent: (raw) => {
      onReaction({
        emoji: raw.content as string,
        senderName:
          (raw.tags as string[][]).find((t) => t[0] === "sender_name")?.[1] ??
          "",
        pubkey: raw.pubkey as string,
      });
    },
  });
}
