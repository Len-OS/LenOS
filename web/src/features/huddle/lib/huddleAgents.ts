import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface AgentAddResult {
  ephemeralAdded: boolean;
  parentAdded: boolean;
  parentError: string | null;
}

const KIND_NIP29_ADD_USER = 9000;

async function publishAddMember(
  channelId: string,
  agentPubkey: string,
): Promise<void> {
  const signed = await signNostrEvent({
    kind: KIND_NIP29_ADD_USER,
    content: "",
    tags: [
      ["h", channelId],
      ["p", agentPubkey, "", "bot"],
    ],
  });
  getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
}

export async function addAgentToHuddle(
  agentPubkey: string,
  ephemeralChannelId: string,
  parentChannelId: string,
): Promise<AgentAddResult> {
  // Ephemeral channel — required. Propagate failure.
  await publishAddMember(ephemeralChannelId, agentPubkey);

  // Parent channel — best-effort. Capture failure, don't propagate.
  let parentAdded = false;
  let parentError: string | null = null;
  try {
    await publishAddMember(parentChannelId, agentPubkey);
    parentAdded = true;
  } catch (e) {
    parentError = e instanceof Error ? e.message : String(e);
  }

  return { ephemeralAdded: true, parentAdded, parentError };
}
