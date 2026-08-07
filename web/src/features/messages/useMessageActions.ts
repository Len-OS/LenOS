import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function useMessageActions() {
  const deleteMessage = async (messageId: string, channelId: string) => {
    const signed = await signNostrEvent(
      {
        kind: 5,
        content: "",
        tags: [
          ["e", messageId],
          ["h", channelId],
        ],
      },
      { requireNip07: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  const editMessage = async (
    originalId: string,
    channelId: string,
    newContent: string,
  ) => {
    const signed = await signNostrEvent(
      {
        kind: 9,
        content: newContent,
        tags: [
          ["h", channelId],
          ["e", originalId, "", "edit"],
        ],
      },
      { requireNip07: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  return { deleteMessage, editMessage };
}
