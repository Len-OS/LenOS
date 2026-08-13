import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_SCHEDULED_MESSAGE } from "@/shared/constants/kinds";

export type ScheduledMessage = {
  id: string;
  content: string;
  channelId: string;
  notBefore: number;
  dTag: string;
};

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
 * Subscribe to own kind:30078 scheduled-message drafts for a given pubkey.
 * When channelId is provided, results are filtered to that channel only.
 * When pubkey is null (auth not ready), returns empty array.
 */
export function useScheduledMessages(
  pubkey: string | null,
  channelId?: string,
): ScheduledMessage[] {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);

  useEffect(() => {
    if (!pubkey) return;

    const subId = `scheduled-${crypto.randomUUID()}`;
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
        if (channelId && msg.channelId !== channelId) return;
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== msg.id);
          return [...without, msg];
        });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [pubkey, channelId]);

  return messages;
}
