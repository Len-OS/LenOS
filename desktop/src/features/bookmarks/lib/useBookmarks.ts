import { useCallback, useEffect, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { KIND_BOOKMARK_LIST } from "@/shared/constants/kinds";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_FORUM_POST,
  KIND_FORUM_COMMENT,
} from "@/shared/constants/kinds";

export interface SavedMessage {
  id: string;
  eventId: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

const RESOLVABLE_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_FORUM_POST,
  KIND_FORUM_COMMENT,
];

function fromRelayEvent(e: RelayEvent): SavedMessage {
  return {
    id: e.id,
    eventId: e.id,
    pubkey: e.pubkey,
    content: e.content,
    createdAt: e.created_at,
  };
}

async function resolveEventIds(eventIds: string[]): Promise<SavedMessage[]> {
  if (eventIds.length === 0) return [];
  const events = await relayClient.fetchEvents({
    ids: eventIds,
    kinds: RESOLVABLE_KINDS,
    limit: 200,
  });
  return events.map(fromRelayEvent).sort((a, b) => b.createdAt - a.createdAt);
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

    relayClient
      .fetchEvents({
        kinds: [KIND_BOOKMARK_LIST],
        authors: [currentPubkey],
        limit: 1,
      })
      .then(async (events) => {
        if (events.length === 0) return;
        const latest = events.reduce((a, b) =>
          a.created_at >= b.created_at ? a : b,
        );
        const tags = latest.tags ?? [];
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
    let cleanup: (() => Promise<void>) | null = null;

    relayClient
      .subscribeLive(
        {
          kinds: [KIND_BOOKMARK_LIST],
          authors: [currentPubkey],
          since: Math.floor(Date.now() / 1000) - 10,
          limit: 1,
        },
        async (event) => {
          const tags = event.tags ?? [];
          const eventIds = tags
            .filter((t) => t[0] === "e" && t[1])
            .map((t) => t[1]);
          setSavedIds(new Set(eventIds));
          const resolved = await resolveEventIds(eventIds);
          setSavedEvents(resolved);
        },
      )
      .then((unsub) => {
        cleanup = unsub;
      })
      .catch(() => {});

    return () => {
      cleanup?.().catch(() => {});
    };
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
      const signed = await signRelayEvent({
        kind: KIND_BOOKMARK_LIST,
        content: "",
        tags,
      });
      await relayClient.publishEvent(
        signed,
        "Timed out saving bookmark",
        "Failed to save bookmark",
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
      const signed = await signRelayEvent({
        kind: KIND_BOOKMARK_LIST,
        content: "",
        tags,
      });
      await relayClient.publishEvent(
        signed,
        "Timed out removing bookmark",
        "Failed to remove bookmark",
      );
    },
    [savedIds],
  );

  return { savedIds, savedEvents, isSaved, save, unsave, isLoading };
}
