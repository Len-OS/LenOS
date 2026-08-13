import { useCallback, useEffect, useRef, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";

const KIND_BOOKMARK_SET = 30003;

export function useChannelBookmarks(
  currentPubkey: string | null,
  channelId: string | null,
) {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const idsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentPubkey || !channelId) {
      setBookmarkedIds(new Set());
      idsRef.current = new Set();
      return;
    }

    let cancelled = false;
    let unsub: (() => Promise<void>) | null = null;

    const parseIds = (event: RelayEvent): Set<string> =>
      new Set(
        event.tags
          .filter((t) => t[0] === "e" && typeof t[1] === "string")
          .map((t) => t[1]),
      );

    const onEvent = (event: RelayEvent) => {
      if (cancelled) return;
      const ids = parseIds(event);
      idsRef.current = ids;
      setBookmarkedIds(new Set(ids));
    };

    relayClient
      .fetchEvents({
        kinds: [KIND_BOOKMARK_SET],
        authors: [currentPubkey],
        "#d": [channelId],
        limit: 1,
      })
      .then((events) => {
        if (cancelled || events.length === 0) return;
        const ids = parseIds(events[0]);
        idsRef.current = ids;
        setBookmarkedIds(new Set(ids));
      })
      .catch(() => {});

    relayClient
      .subscribeLive(
        {
          kinds: [KIND_BOOKMARK_SET],
          authors: [currentPubkey],
          "#d": [channelId],
          limit: 1,
        },
        onEvent,
      )
      .then((unsubFn) => {
        if (cancelled) {
          void unsubFn();
          return;
        }
        unsub = unsubFn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (unsub) void unsub();
      setBookmarkedIds(new Set());
      idsRef.current = new Set();
    };
  }, [currentPubkey, channelId]);

  const publish = useCallback(
    async (newIds: Set<string>) => {
      if (!currentPubkey || !channelId) return;
      const tags: string[][] = [
        ["d", channelId],
        ...Array.from(newIds).map((id) => ["e", id]),
      ];
      const event = await signRelayEvent({
        kind: KIND_BOOKMARK_SET,
        content: "",
        tags,
      });
      await relayClient.publishEvent(
        event,
        "Bookmark publish timed out",
        "Failed to publish bookmark",
      );
    },
    [currentPubkey, channelId],
  );

  const bookmark = useCallback(
    async (eventId: string) => {
      const next = new Set(idsRef.current);
      next.add(eventId);
      idsRef.current = next;
      setBookmarkedIds(new Set(next));
      await publish(next);
    },
    [publish],
  );

  const unbookmark = useCallback(
    async (eventId: string) => {
      const next = new Set(idsRef.current);
      next.delete(eventId);
      idsRef.current = next;
      setBookmarkedIds(new Set(next));
      await publish(next);
    },
    [publish],
  );

  const isBookmarked = useCallback(
    (id: string) => bookmarkedIds.has(id),
    [bookmarkedIds],
  );

  return { bookmarkedIds, isBookmarked, bookmark, unbookmark };
}
