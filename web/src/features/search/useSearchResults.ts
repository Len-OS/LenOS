import { useState, useEffect } from "react";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

export interface SearchResult {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  channelId: string;
}

export function useSearchResults(query: string, communityId: string | null) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !communityId) {
      setResults([]);
      return;
    }
    setLoading(true);
    queryEvents(relayWsUrl(), {
      kinds: [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2],
      "#h": [communityId],
      search: trimmed,
      limit: 30,
    })
      .then((events) => {
        setResults(
          events.map((e) => ({
            id: e.id as string,
            pubkey: e.pubkey as string,
            content: e.content as string,
            createdAt: e.created_at as number,
            channelId:
              (e.tags as string[][])?.find((t) => t[0] === "h")?.[1] ?? "",
          })),
        );
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [query, communityId]);

  return { results, loading };
}
