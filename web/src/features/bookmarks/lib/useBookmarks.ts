import { useCallback, useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { KIND_BOOKMARK_LIST } from "@/shared/constants/kinds";

export interface SavedMessage {
  id: string;
  eventId: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

async function resolveEventIds(eventIds: string[]): Promise<SavedMessage[]> {
  if (eventIds.length === 0) return [];
  const events = await queryEvents(relayWsUrl(), {
    ids: eventIds,
    limit: 200,
  });
  return events
    .map((e) => ({
      id: e.id,
      eventId: e.id,
      pubkey: e.pubkey,
      content: e.content,
      createdAt: e.created_at,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function useBookmarks(currentPubkey: string | null): {
  savedIds: Set<string>;
  savedEvents: SavedMessage[];
  isSaved: (id: string) => boolean;
  save: (
    eventId: string,
    eventData: { pubkey: string; content: string; createdAt: number },
  ) => Promise<void>;
  unsave: (eventId: string) => Promise<void>;
  isLoading: boolean;
} {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedEvents, setSavedEvents] = useState<SavedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentPubkey) return;
    setIsLoading(true);

    queryEvents(relayWsUrl(), {
      kinds: [KIND_BOOKMARK_LIST],
      authors: [currentPubkey],
      limit: 1,
    })
      .then(async (events) => {
        if (events.length === 0) return;
        const latest = events.reduce((a, b) =>
          (a.created_at as number) >= (b.created_at as number) ? a : b,
        );
        const tags = (latest.tags as string[][]) ?? [];
        const eventIds = tags
          .filter((t) => t[0] === "e" && t[1])
          .map((t) => t[1]);
        setSavedIds(new Set(eventIds));
        const resolved = await resolveEventIds(eventIds);
        setSavedEvents(resolved);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [currentPubkey]);

  useEffect(() => {
    if (!currentPubkey) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `bookmarks-${currentPubkey}`,
      filter: {
        kinds: [KIND_BOOKMARK_LIST],
        authors: [currentPubkey],
        since: Math.floor(Date.now() / 1000) - 10,
        limit: 1,
      },
      onEvent: async (event) => {
        const tags = (event.tags as string[][]) ?? [];
        const eventIds = tags
          .filter((t) => t[0] === "e" && t[1])
          .map((t) => t[1]);
        setSavedIds(new Set(eventIds));
        const resolved = await resolveEventIds(eventIds);
        setSavedEvents(resolved);
      },
    });

    return unsub;
  }, [currentPubkey]);

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const save = useCallback(
    async (
      eventId: string,
      eventData: { pubkey: string; content: string; createdAt: number },
    ) => {
      if (savedIds.has(eventId)) return;
      const newIds = [...savedIds, eventId];
      const newMsg: SavedMessage = {
        id: eventId,
        eventId,
        pubkey: eventData.pubkey,
        content: eventData.content,
        createdAt: eventData.createdAt,
      };
      setSavedIds(new Set(newIds));
      setSavedEvents((prev) =>
        [...prev, newMsg].sort((a, b) => b.createdAt - a.createdAt),
      );
      const tags = newIds.map((id) => ["e", id]);
      const signed = await signNostrEvent(
        { kind: KIND_BOOKMARK_LIST, content: "", tags },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [savedIds],
  );

  const unsave = useCallback(
    async (eventId: string) => {
      const newIds = [...savedIds].filter((id) => id !== eventId);
      setSavedIds(new Set(newIds));
      setSavedEvents((prev) => prev.filter((e) => e.eventId !== eventId));
      const tags = newIds.map((id) => ["e", id]);
      const signed = await signNostrEvent(
        { kind: KIND_BOOKMARK_LIST, content: "", tags },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [savedIds],
  );

  return { savedIds, savedEvents, isSaved, save, unsave, isLoading };
}
