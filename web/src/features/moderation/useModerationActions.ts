import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_REPORT } from "@/shared/constants/kinds";

export function useModerationActions() {
  const muteUser = async (pubkey: string, channelId: string) => {
    const signed = await signNostrEvent(
      {
        kind: 9004,
        content: "",
        tags: [
          ["p", pubkey],
          ["h", channelId],
        ],
      },
      { requireDurableSigner: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  const banUser = async (pubkey: string, channelId: string) => {
    const signed = await signNostrEvent(
      {
        kind: 9001,
        content: "",
        tags: [
          ["p", pubkey],
          ["h", channelId],
        ],
      },
      { requireDurableSigner: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  const reportEvent = async (
    targetEventId: string,
    targetPubkey: string,
    reason: string,
  ) => {
    const signed = await signNostrEvent(
      {
        kind: KIND_REPORT,
        content: reason,
        tags: [
          ["e", targetEventId],
          ["p", targetPubkey],
        ],
      },
      { requireNip07: false },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  return { muteUser, banUser, reportEvent };
}
