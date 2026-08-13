import * as React from "react";
import { relayClient } from "@/shared/api/relayClient";
import { KIND_SCHEDULED_MESSAGE } from "@/shared/constants/kinds";
import type { RelayEvent } from "@/shared/api/types";

export type ScheduledMessage = {
  id: string;
  content: string;
  channelId: string;
  notBefore: number;
  dTag: string;
};

export function parseScheduledEvent(
  event: RelayEvent,
): ScheduledMessage | null {
  const tags = event.tags ?? [];
  const dTag = tags.find((t) => t[0] === "d")?.[1] ?? "";
  if (!dTag.startsWith("scheduled-")) return null;
  const hTag = tags.find((t) => t[0] === "h")?.[1] ?? "";
  const notBeforeTag = tags.find((t) => t[0] === "not_before")?.[1];
  if (!hTag || !notBeforeTag) return null;
  const notBefore = parseInt(notBeforeTag, 10);
  if (Number.isNaN(notBefore)) return null;
  if (!event.id) return null;
  return {
    id: event.id,
    content: event.content,
    channelId: hTag,
    notBefore,
    dTag,
  };
}

/**
 * Subscribe to own kind:30078 scheduled-message drafts for a given pubkey.
 * When channelId is provided, results are filtered to that channel only.
 * When pubkey is null (auth not ready), returns empty array.
 */
export function useScheduledMessages(
  pubkey: string | null,
  channelId?: string,
): ScheduledMessage[] {
  const [messages, setMessages] = React.useState<ScheduledMessage[]>([]);

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
          if (channelId && msg.channelId !== channelId) return;
          setMessages((prev) => {
            const without = prev.filter((m) => m.id !== msg.id);
            return [...without, msg];
          });
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
        console.error("[useScheduledMessages] subscribe failed:", err);
      });

    return () => {
      cancelled = true;
      if (unsub) void unsub();
    };
  }, [pubkey, channelId]);

  return messages;
}
