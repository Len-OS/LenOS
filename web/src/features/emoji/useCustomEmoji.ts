import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_EMOJI_PACK = 30030;
/** NIP-78 workspace-level emoji managed by admins (kind:30078, d:"custom-emoji"). */
const KIND_WORKSPACE_EMOJI = 30078;
const WORKSPACE_EMOJI_D_TAG = "custom-emoji";

/** Internal shape used while merging both sources. */
interface WorkspaceEmojiEvent {
  emojis: Array<{ shortcode: string; url: string }>;
}

function parseWorkspaceEmojiContent(
  content: string,
): Array<{ shortcode: string; url: string }> {
  try {
    const parsed = JSON.parse(content) as WorkspaceEmojiEvent;
    if (!Array.isArray(parsed.emojis)) return [];
    return parsed.emojis.filter(
      (e) =>
        typeof e.shortcode === "string" &&
        typeof e.url === "string" &&
        /^[a-z0-9_-]+$/.test(e.shortcode),
    );
  } catch {
    return [];
  }
}

export function useCustomEmoji(
  communityId: string | null,
): Map<string, string> {
  const [emojiMap, setEmojiMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    // Track workspace emoji separately so personal emoji can override it on
    // shortcode collision (personal kind:30030 takes precedence).
    let workspaceMap = new Map<string, string>();
    let personalMap = new Map<string, string>();

    function merge(): void {
      setEmojiMap(() => {
        // Personal entries override workspace entries on shortcode collision.
        const next = new Map<string, string>(workspaceMap);
        for (const [shortcode, url] of personalMap) {
          next.set(shortcode, url);
        }
        return next;
      });
    }

    // --- kind:30030 subscription (per-user NIP-30 packs) ---
    const unsub30030 = client.subscribe({
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
        let changed = false;
        for (const [, shortcode, url] of entries) {
          if (personalMap.get(shortcode) !== url) {
            personalMap = new Map(personalMap);
            personalMap.set(shortcode, url);
            changed = true;
          }
        }
        if (changed) merge();
      },
    });

    // --- kind:30078 subscription (workspace admin emoji) ---
    const unsub30078 = client.subscribe({
      id: `workspace-emoji-${communityId}`,
      filter: {
        kinds: [KIND_WORKSPACE_EMOJI],
        "#d": [WORKSPACE_EMOJI_D_TAG],
        limit: 10,
      },
      onEvent: (raw) => {
        const content = typeof raw.content === "string" ? raw.content : "";
        const entries = parseWorkspaceEmojiContent(content);
        const next = new Map<string, string>();
        for (const { shortcode, url } of entries) {
          next.set(shortcode, url);
        }
        workspaceMap = next;
        merge();
      },
    });

    return () => {
      unsub30030();
      unsub30078();
      setEmojiMap(new Map());
    };
  }, [communityId]);

  return emojiMap;
}
