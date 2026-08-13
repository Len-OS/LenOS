import { useEffect, useRef } from "react";
import { nip19 } from "nostr-tools";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
import type { Channel } from "@/features/channels/use-channels";
import { showNotification } from "@/features/notifications/lib/browser";
import {
  resolveNotificationChannelLabel,
  truncateNotificationBody,
  formatNotificationTitle,
} from "@/features/notifications/lib/notificationFormat";
import {
  useKeywordRules,
  type KeywordRule,
} from "@/features/notifications/lib/useKeywordRules";

interface Props {
  channels: Channel[];
  currentPubkey: string | null;
  communityId: string | null;
}

export function useFeedBrowserNotifications({
  channels,
  currentPubkey,
  communityId,
}: Props) {
  const startedAt = useRef(Math.floor(Date.now() / 1000));

  const { keywords: keywordRules, mutedKeywords } =
    useKeywordRules(currentPubkey);

  // Use refs so the subscription closure always sees the latest values
  // without needing to recreate the subscription on every rule change.
  const keywordRulesRef = useRef<KeywordRule[]>(keywordRules);
  const mutedKeywordsRef = useRef<string[]>(mutedKeywords);

  useEffect(() => {
    keywordRulesRef.current = keywordRules;
  });

  useEffect(() => {
    mutedKeywordsRef.current = mutedKeywords;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: channels identity changes on every relay event; channels.length+communityId+currentPubkey drive resubscription
  useEffect(() => {
    if (!communityId || !currentPubkey) return;

    const channelIds = channels.map((c) => c.id);
    if (channelIds.length === 0) return;

    let npub: string | null = null;
    try {
      npub = nip19.npubEncode(currentPubkey);
    } catch {}

    const client = getRelayClient(relayWsUrl());
    const since = startedAt.current;

    const unsub = client.subscribe({
      id: `feed-notif-${communityId}`,
      filter: {
        kinds: [...CHANNEL_TIMELINE_CONTENT_KINDS],
        "#h": channelIds,
        since,
      },
      onEvent: (raw) => {
        const ts = raw.created_at as number;
        if (ts < since) return;
        if ((raw.pubkey as string) === currentPubkey) return;

        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? null;
        const content = (raw.content as string) ?? "";
        const lower = content.toLowerCase();

        const isMention =
          tags.some(
            (t) =>
              t[0] === "p" &&
              t[1]?.toLowerCase() === currentPubkey.toLowerCase(),
          ) ||
          (npub !== null && content.includes(npub));

        const mutedMatch = mutedKeywordsRef.current.some((mk) =>
          lower.includes(mk.toLowerCase()),
        );
        if (mutedMatch) return;

        const matchKeyword = (rule: KeywordRule): boolean => {
          if (rule.channelId && rule.channelId !== channelId) return false;
          const pat = rule.keyword;
          if (pat.startsWith("/") && pat.endsWith("/") && pat.length > 2) {
            try {
              return new RegExp(pat.slice(1, -1), "i").test(lower);
            } catch {
              return false;
            }
          }
          return lower.includes(pat.toLowerCase());
        };

        const keywordMatch =
          keywordRulesRef.current.length > 0 &&
          keywordRulesRef.current.some(matchKeyword);

        if (!isMention && !keywordMatch) return;

        const channelLabel = resolveNotificationChannelLabel(
          channelId,
          channels,
        );
        const prefix = isMention ? "New mention" : "Keyword match";
        const title = formatNotificationTitle({ prefix, channelLabel });
        const body = truncateNotificationBody(content, "New message");
        showNotification(title, body);
      },
    });

    return unsub;
  }, [communityId, currentPubkey, channels.length]);
}
