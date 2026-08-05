import { useMemo } from "react";

export interface EmojiSuggestion {
  shortcode: string;
  url: string | null;
  native: string | null;
}

const COMMON_EMOJI: EmojiSuggestion[] = [
  { shortcode: "thumbsup", url: null, native: "👍" },
  { shortcode: "thumbsdown", url: null, native: "👎" },
  { shortcode: "heart", url: null, native: "❤️" },
  { shortcode: "smile", url: null, native: "😊" },
  { shortcode: "laugh", url: null, native: "😂" },
  { shortcode: "fire", url: null, native: "🔥" },
  { shortcode: "rocket", url: null, native: "🚀" },
  { shortcode: "eyes", url: null, native: "👀" },
  { shortcode: "check", url: null, native: "✅" },
  { shortcode: "wave", url: null, native: "👋" },
];

export function useEmojiAutocomplete(
  query: string,
  customEmoji: Map<string, string>,
): EmojiSuggestion[] {
  return useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();

    const custom: EmojiSuggestion[] = [...customEmoji.entries()]
      .filter(([shortcode]) => shortcode.toLowerCase().includes(q))
      .map(([shortcode, url]) => ({ shortcode, url, native: null }));

    const standard = COMMON_EMOJI.filter((e) =>
      e.shortcode.toLowerCase().includes(q),
    );

    return [...custom, ...standard].slice(0, 10);
  }, [query, customEmoji]);
}
