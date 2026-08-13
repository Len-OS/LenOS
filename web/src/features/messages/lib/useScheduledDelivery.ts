import { useEffect, useRef, useState } from "react";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_DELETION,
  KIND_SCHEDULED_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { ScheduledMessage } from "./useScheduledMessages";

function parseScheduledEvent(
  event: Record<string, unknown>,
): ScheduledMessage | null {
  const tags = (event.tags as string[][] | undefined) ?? [];
  const dTag = tags.find((t) => t[0] === "d")?.[1] ?? "";
  if (!dTag.startsWith("scheduled-")) return null;
  const hTag = tags.find((t) => t[0] === "h")?.[1] ?? "";
  const notBeforeTag = tags.find((t) => t[0] === "not_before")?.[1];
  if (!hTag || !notBeforeTag) return null;
  const notBefore = parseInt(notBeforeTag, 10);
  if (Number.isNaN(notBefore)) return null;
  const id = typeof event.id === "string" ? event.id : "";
  const content = typeof event.content === "string" ? event.content : "";
  if (!id) return null;
  return { id, content, channelId: hTag, notBefore, dTag };
}

/**
 * Always-on delivery engine: subscribes to own scheduled messages and
 * fires them when their `not_before` timestamp is reached.
 *
 * Mount once in the workspace layout so delivery works regardless of which
 * route is active.
 */
export function useScheduledDelivery() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  // Messages pending delivery — keyed by event id.
  const pendingRef = useRef<Map<string, ScheduledMessage>>(new Map());
  // Guard against double-delivery within a session.
  const deliveredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    getCurrentPubkey()
      .then(setPubkey)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pubkey) return;

    const subId = `delivery-${crypto.randomUUID()}`;
    const unsubscribe = getRelayClient(relayWsUrl()).subscribe({
      id: subId,
      filter: {
        kinds: [KIND_SCHEDULED_MESSAGE],
        authors: [pubkey],
        limit: 200,
      },
      onEvent: (event) => {
        const msg = parseScheduledEvent(event);
        if (!msg) return;
        if (!deliveredRef.current.has(msg.id)) {
          pendingRef.current.set(msg.id, msg);
        }
      },
    });

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      for (const [id, msg] of pendingRef.current) {
        if (deliveredRef.current.has(id)) {
          pendingRef.current.delete(id);
          continue;
        }
        if (now < msg.notBefore) continue;

        // Mark delivered immediately to prevent concurrent interval ticks
        deliveredRef.current.add(id);
        pendingRef.current.delete(id);

        void (async () => {
          try {
            const msgEvent = await signNostrEvent({
              kind: KIND_STREAM_MESSAGE_V2,
              content: msg.content,
              tags: [["h", msg.channelId]],
            });
            await getRelayClient(relayWsUrl()).publishAndWait(
              msgEvent as Record<string, unknown>,
            );

            const delEvent = await signNostrEvent({
              kind: KIND_DELETION,
              content: "",
              tags: [["e", id]],
            });
            await getRelayClient(relayWsUrl()).publishAndWait(
              delEvent as Record<string, unknown>,
            );
          } catch (err) {
            console.error("[useScheduledDelivery] delivery failed:", err);
            // Remove from delivered so it retries on next interval
            deliveredRef.current.delete(id);
          }
        })();
      }
    }, 30_000);

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [pubkey]);
}
