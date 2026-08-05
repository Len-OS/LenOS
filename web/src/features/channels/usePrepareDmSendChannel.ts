import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryEvents } from "@/shared/lib/nostr-client";

function dmChannelId(pubkeys: string[]): string {
  return [...pubkeys].sort().join("-dm-");
}

export async function prepareDmSendChannel(
  participantPubkeys: string[],
  communityId: string,
): Promise<string> {
  const channelId = dmChannelId(participantPubkeys);

  const existing = await queryEvents(relayWsUrl(), {
    kinds: [39000],
    "#d": [channelId],
    limit: 1,
  });

  if (existing.length > 0) return channelId;

  const pTags: string[][] = participantPubkeys.map((pk) => ["p", pk]);
  const signed = await signNostrEvent(
    {
      kind: 9007,
      content: "",
      tags: [
        ["d", channelId],
        ["h", communityId],
        ["private"],
        ...pTags,
      ],
    },
    { requireNip07: false },
  );
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  return channelId;
}
