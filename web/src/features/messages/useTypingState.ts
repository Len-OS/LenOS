import { useEffect, useState, useRef, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent, hasNip07Provider } from "@/shared/lib/nostr-signer";
import { KIND_TYPING_INDICATOR } from "@/shared/constants/kinds";

const TYPING_TTL = 5_000;
const TYPING_INTERVAL = 3_000;

export function useTypingState(
  channelId: string | null,
  currentPubkey: string | null,
) {
  const [typingPubkeys, setTypingPubkeys] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 5;
    const unsub = client.subscribe({
      id: `typing-${channelId}`,
      filter: { kinds: [KIND_TYPING_INDICATOR], "#h": [channelId], since },
      onEvent: (raw) => {
        const pubkey = raw.pubkey as string;
        if (pubkey === currentPubkey) return;
        setTypingPubkeys((prev) => new Set([...prev, pubkey]));
        const existing = timers.current.get(pubkey);
        if (existing !== undefined) clearTimeout(existing);
        timers.current.set(
          pubkey,
          setTimeout(() => {
            setTypingPubkeys((prev) => {
              const next = new Set(prev);
              next.delete(pubkey);
              return next;
            });
            timers.current.delete(pubkey);
          }, TYPING_TTL),
        );
      },
    });
    return () => {
      unsub();
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
      setTypingPubkeys(new Set());
    };
  }, [channelId, currentPubkey]);

  const notifyTyping = useCallback(() => {
    if (!channelId || !hasNip07Provider() || publishTimer.current) return;
    publishTimer.current = setTimeout(() => {
      publishTimer.current = null;
      signNostrEvent(
        {
          kind: KIND_TYPING_INDICATOR,
          content: "",
          tags: [["h", channelId]],
        },
        { requireDurableSigner: true },
      )
        .then((signed) => {
          getRelayClient(relayWsUrl()).publish(
            signed as Record<string, unknown>,
          );
        })
        .catch(() => {});
    }, TYPING_INTERVAL);
  }, [channelId]);

  return { typingPubkeys, notifyTyping };
}
