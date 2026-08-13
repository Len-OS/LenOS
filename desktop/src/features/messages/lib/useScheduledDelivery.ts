import * as React from "react";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { useIdentityQuery } from "@/shared/api/hooks";
import {
  KIND_DELETION,
  KIND_SCHEDULED_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import { parseScheduledEvent } from "./useScheduledMessages";
import type { ScheduledMessage } from "./useScheduledMessages";

/**
 * Always-on delivery engine: subscribes to own scheduled messages and
 * fires them when their `not_before` timestamp is reached.
 *
 * Mount once in AppShell so delivery works regardless of which route is active.
 */
export function useScheduledDelivery() {
  const identityQuery = useIdentityQuery();
  const pubkey = identityQuery.data?.pubkey ?? null;

  // Messages pending delivery — keyed by event id.
  const pendingRef = React.useRef<Map<string, ScheduledMessage>>(new Map());
  // Guard against double-delivery within a session.
  const deliveredRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!pubkey) return;

    let unsub: (() => Promise<void>) | null = null;
    let cancelled = false;

    void relayClient
      .subscribeLive(
        { kinds: [KIND_SCHEDULED_MESSAGE], authors: [pubkey], limit: 200 },
        (event) => {
          const msg = parseScheduledEvent(event);
          if (!msg) return;
          if (!deliveredRef.current.has(msg.id)) {
            pendingRef.current.set(msg.id, msg);
          }
        },
      )
      .then((unsubFn) => {
        if (cancelled) {
          void unsubFn();
        } else {
          unsub = unsubFn;
        }
      })
      .catch((err: unknown) => {
        console.error("[useScheduledDelivery] subscribe failed:", err);
      });

    const timer = window.setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      for (const [id, msg] of pendingRef.current) {
        if (deliveredRef.current.has(id)) {
          pendingRef.current.delete(id);
          continue;
        }
        if (now < msg.notBefore) continue;

        deliveredRef.current.add(id);
        pendingRef.current.delete(id);

        void (async () => {
          try {
            const msgEvent = await signRelayEvent({
              kind: KIND_STREAM_MESSAGE_V2,
              content: msg.content,
              tags: [["h", msg.channelId]],
            });
            await relayClient.publishEvent(
              msgEvent,
              "Timed out publishing scheduled message.",
              "Failed to publish scheduled message.",
            );

            const delEvent = await signRelayEvent({
              kind: KIND_DELETION,
              content: "",
              tags: [["e", id]],
            });
            await relayClient.publishEvent(
              delEvent,
              "Timed out publishing scheduled message deletion.",
              "Failed to publish scheduled message deletion.",
            );
          } catch (err) {
            console.error("[useScheduledDelivery] delivery failed:", err);
            deliveredRef.current.delete(id);
          }
        })();
      }
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (unsub) void unsub();
    };
  }, [pubkey]);
}
