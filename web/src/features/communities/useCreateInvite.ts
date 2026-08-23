import { useState } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { extractSlug } from "@/shared/lib/workspace";

const KIND_INVITE = 30620;

function randomCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useCreateInvite(communityId: string | null) {
  const [isCreating, setIsCreating] = useState(false);

  async function createInvite(): Promise<string | null> {
    if (!communityId) return null;
    setIsCreating(true);
    try {
      const code = randomCode();
      const event = await signNostrEvent(
        {
          kind: KIND_INVITE,
          content: "",
          tags: [
            ["h", communityId],
            ["code", code],
            ["d", code],
          ],
        },
        { requireDurableSigner: true },
      );
      const client = getRelayClient(relayWsUrl());
      await client.publishAndWait(event as Record<string, unknown>);
      const slug = extractSlug();
      const baseUrl = slug
        ? `https://${slug}.lengrowth.com`
        : window.location.origin;
      return `${baseUrl}/invite/${code}`;
    } catch {
      return null;
    } finally {
      setIsCreating(false);
    }
  }

  return { createInvite, isCreating };
}
