import { useCallback, useEffect, useRef, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent } from "@/shared/lib/nostr-signer";

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

    queryEvents(relayWsUrl(), {
      kinds: [KIND_BOOKMARK_SET],
      authors: [currentPubkey],
      "#d": [channelId],
      limit: 1,
    })
      .then((events) => {
        if (events.length > 0) {
          const ids = new Set(
            (events[0].tags as string[][])
              .filter((t) => t[0] === "e" && typeof t[1] === "string")
              .map((t) => t[1]),
          );
          idsRef.current = ids;
          setBookmarkedIds(new Set(ids));
        }
      })
      .catch(() => {});

    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `bookmarks-${currentPubkey}-${channelId}`,
      filter: {
        kinds: [KIND_BOOKMARK_SET],
        authors: [currentPubkey],
        "#d": [channelId],
        limit: 1,
      },
      onEvent: (raw) => {
        const tags = raw.tags as string[][];
        const ids = new Set(
          tags
            .filter((t) => t[0] === "e" && typeof t[1] === "string")
            .map((t) => t[1]),
        );
        idsRef.current = ids;
        setBookmarkedIds(new Set(ids));
      },
    });

    return () => {
      unsub();
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
      const signed = await signNostrEvent(
        { kind: KIND_BOOKMARK_SET, content: "", tags },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
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
