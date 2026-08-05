import { useEffect, useState, useRef, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryEvents } from "@/shared/lib/nostr-client";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";

export interface Message {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  kind: number;
  tags: string[][];
}

const HISTORY_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
];
const HISTORY_LIMIT = 50;

export function useMessages(channelId: string | null): {
  messages: Message[];
  isLoading: boolean;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const seen = useRef(new Set<string>());

  const addEvent = useCallback((raw: Record<string, unknown>) => {
    const id = raw.id as string;
    if (!id || seen.current.has(id)) return;
    seen.current.add(id);
    const msg: Message = {
      id,
      pubkey: (raw.pubkey as string) ?? "",
      content: (raw.content as string) ?? "",
      createdAt: (raw.created_at as number) ?? 0,
      kind: (raw.kind as number) ?? 9,
      tags: (raw.tags as string[][]) ?? [],
    };
    setMessages((prev) =>
      [...prev, msg].sort((a, b) => a.createdAt - b.createdAt),
    );
  }, []);

  // History (one-shot fetch)
  useEffect(() => {
    if (!channelId) return;
    seen.current.clear();
    setMessages([]);
    setIsLoading(true);

    queryEvents(relayWsUrl(), {
      kinds: HISTORY_KINDS,
      "#h": [channelId],
      limit: HISTORY_LIMIT,
    })
      .then((events) => {
        for (const e of events) addEvent(e as Record<string, unknown>);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [channelId, addEvent]);

  // Live subscription (persistent)
  useEffect(() => {
    if (!channelId) return;
    const since = Math.floor(Date.now() / 1000) - 10;
    const subId = `msgs-${channelId}`;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: HISTORY_KINDS,
        "#h": [channelId],
        since,
      },
      onEvent: addEvent,
    });

    return unsub;
  }, [channelId, addEvent]);

  return { messages, isLoading };
}
