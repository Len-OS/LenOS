import { useEffect } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_PRESENCE } from "@/shared/constants/kinds";

const HEARTBEAT_MS = 30_000;

export function usePresenceHeartbeat(
  pubkey: string | null,
  communityId: string | null,
): void {
  useEffect(() => {
    if (!pubkey || !communityId) return;

    const publish = () => {
      signNostrEvent(
        { kind: KIND_PRESENCE, content: "", tags: [["d", communityId]] },
        { requireNip07: false },
      )
        .then((signed) => {
          getRelayClient(relayWsUrl()).publish(
            signed as Record<string, unknown>,
          );
        })
        .catch(() => {});
    };

    publish();
    const timer = setInterval(publish, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [pubkey, communityId]);
}
