import { useEffect, useState, useRef, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryEvents } from "@/shared/lib/nostr-client";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
  KIND_DELETION,
  KIND_HUDDLE_STARTED,
  KIND_GROWTH_REPORT,
  KIND_GROWTH_SUGGESTION,
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
  KIND_HUDDLE_STARTED,
];
const LIVE_KINDS = [...HISTORY_KINDS, KIND_DELETION];
// Global-only kinds (no h-tag): fetched without channel filter
const GLOBAL_KINDS = [KIND_GROWTH_REPORT, KIND_GROWTH_SUGGESTION];
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
    const kind = (raw.kind as number) ?? 9;

    // Handle kind 5 (NIP-09 deletion) — remove referenced messages from state
    if (kind === KIND_DELETION) {
      const tags = (raw.tags as string[][]) ?? [];
      const deletedIds = tags.filter((t) => t[0] === "e").map((t) => t[1]);
      if (deletedIds.length > 0) {
        setMessages((prev) => prev.filter((m) => !deletedIds.includes(m.id)));
        for (const did of deletedIds) seen.current.delete(did);
      }
      return;
    }

    if (!id || seen.current.has(id)) return;
    seen.current.add(id);
    const msg: Message = {
      id,
      pubkey: (raw.pubkey as string) ?? "",
      content: (raw.content as string) ?? "",
      createdAt: (raw.created_at as number) ?? 0,
      kind,
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
        kinds: LIVE_KINDS,
        "#h": [channelId],
        since,
      },
      onEvent: addEvent,
    });

    return unsub;
  }, [channelId, addEvent]);

  // History fetch for global-only growth events (no h-tag)
  useEffect(() => {
    if (!channelId) return;
    queryEvents(relayWsUrl(), {
      kinds: GLOBAL_KINDS,
      limit: HISTORY_LIMIT,
    })
      .then((events) => {
        for (const e of events) addEvent(e as Record<string, unknown>);
      })
      .catch(() => {});
  }, [channelId, addEvent]);

  // Live subscription for global-only growth events (no h-tag)
  useEffect(() => {
    if (!channelId) return;
    const since = Math.floor(Date.now() / 1000) - 10;
    const subId = `growth-${channelId}`;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: GLOBAL_KINDS,
        since,
      },
      onEvent: addEvent,
    });

    return unsub;
  }, [channelId, addEvent]);

  return { messages, isLoading };
}
