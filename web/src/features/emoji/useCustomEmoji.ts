import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_EMOJI_PACK = 30030;

export function useCustomEmoji(
  communityId: string | null,
): Map<string, string> {
  const [emojiMap, setEmojiMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `custom-emoji-${communityId}`,
      filter: {
        kinds: [KIND_EMOJI_PACK],
        "#h": [communityId],
        limit: 50,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const entries = tags.filter((t) => t[0] === "emoji" && t[1] && t[2]);
        if (entries.length === 0) return;
        setEmojiMap((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const [, shortcode, url] of entries) {
            if (next.get(shortcode) !== url) {
              next.set(shortcode, url);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
    });

    return () => {
      unsub();
      setEmojiMap(new Map());
    };
  }, [communityId]);

  return emojiMap;
}
