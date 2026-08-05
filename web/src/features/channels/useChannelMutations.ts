import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function useChannelMutations() {
  const createChannel = async (
    id: string,
    name: string,
    description: string,
    communityId: string,
  ) => {
    const signed = await signNostrEvent(
      {
        kind: 9007,
        content: "",
        tags: [
          ["d", id],
          ["name", name],
          ["about", description],
          ["h", communityId],
        ],
      },
      { requireNip07: true },
    );
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  const editChannel = async (
    channelId: string,
    name: string,
    description: string,
  ) => {
    const signed = await signNostrEvent(
      {
        kind: 9002,
        content: "",
        tags: [
          ["h", channelId],
          ["name", name],
          ["about", description],
        ],
      },
      { requireNip07: true },
    );
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  const deleteChannel = async (channelId: string) => {
    const signed = await signNostrEvent(
      {
        kind: 9008,
        content: "",
        tags: [["h", channelId]],
      },
      { requireNip07: true },
    );
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  return { createChannel, editChannel, deleteChannel };
}
