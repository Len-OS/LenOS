import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function useChannelMutations() {
  const createChannel = async (
    id: string,
    name: string,
    description: string,
  ) => {
    const channelId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
        ? id
        : crypto.randomUUID();
    const signed = await signNostrEvent(
      {
        kind: 9007,
        content: "",
        tags: [
          ["h", channelId],
          ["name", name],
          ["visibility", "open"],
          ["channel_type", "stream"],
          ["about", description],
        ],
      },
      { requireNip07: true },
    );
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
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
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
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
    await getRelayClient(relayWsUrl()).publishAndWait(
      signed as Record<string, unknown>,
    );
  };

  return { createChannel, editChannel, deleteChannel };
}
