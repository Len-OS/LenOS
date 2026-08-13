import { useCallback, useEffect, useState } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_READ_STATE } from "@/shared/constants/kinds";

const D_TAG = "notif-settings";

export interface KeywordRule {
  keyword: string;
  channelId?: string;
}

type NotifSettings = {
  keyword_rules: KeywordRule[];
  muted_keywords: string[];
};

function parseNotifSettings(raw: string): NotifSettings | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.keyword_rules)) return null;
    const keyword_rules: KeywordRule[] = obj.keyword_rules
      .filter(
        (k) => typeof k === "string" || (typeof k === "object" && k !== null),
      )
      .map((k): KeywordRule => {
        if (typeof k === "string") return { keyword: k };
        const rule = k as Record<string, unknown>;
        return {
          keyword: typeof rule.keyword === "string" ? rule.keyword : "",
          ...(typeof rule.channelId === "string"
            ? { channelId: rule.channelId }
            : {}),
        };
      })
      .filter((r) => r.keyword.length > 0);
    const muted_keywords = Array.isArray(obj.muted_keywords)
      ? obj.muted_keywords.filter((k): k is string => typeof k === "string")
      : [];
    return { keyword_rules, muted_keywords };
  } catch {
    return null;
  }
}

export function useKeywordRules(currentPubkey: string | null): {
  keywords: KeywordRule[];
  mutedKeywords: string[];
  addKeyword: (keyword: string, channelId?: string) => Promise<void>;
  removeKeyword: (word: string) => Promise<void>;
  addMutedKeyword: (mk: string) => Promise<void>;
  removeMutedKeyword: (mk: string) => Promise<void>;
} {
  const [keywords, setKeywords] = useState<KeywordRule[]>([]);
  const [mutedKeywords, setMutedKeywords] = useState<string[]>([]);

  const publish = useCallback(
    async (keyword_rules: KeywordRule[], muted_keywords: string[]) => {
      const content = JSON.stringify({ keyword_rules, muted_keywords });
      const signed = await signNostrEvent(
        { kind: KIND_READ_STATE, content, tags: [["d", D_TAG]] },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [],
  );

  const applyState = useCallback((content: string) => {
    const parsed = parseNotifSettings(content);
    if (parsed) {
      setKeywords(parsed.keyword_rules);
      setMutedKeywords(parsed.muted_keywords);
    }
  }, []);

  useEffect(() => {
    if (!currentPubkey) {
      setKeywords([]);
      setMutedKeywords([]);
      return;
    }

    void queryEvents(relayWsUrl(), {
      kinds: [KIND_READ_STATE],
      authors: [currentPubkey],
      "#d": [D_TAG],
      limit: 1,
    })
      .then((events) => {
        if (events.length > 0) applyState(events[0].content as string);
      })
      .catch(() => {});

    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `notif-settings-${currentPubkey}`,
      filter: {
        kinds: [KIND_READ_STATE],
        authors: [currentPubkey],
        "#d": [D_TAG],
        limit: 1,
      },
      onEvent: (event) => {
        applyState((event as { content: string }).content);
      },
    });

    return () => {
      unsub();
    };
  }, [currentPubkey, applyState]);

  const addKeyword = useCallback(
    async (keyword: string, channelId?: string) => {
      const trimmed = keyword.trim();
      if (!trimmed) return;
      const rule: KeywordRule = channelId
        ? { keyword: trimmed, channelId }
        : { keyword: trimmed };
      const alreadyExists = keywords.some(
        (k) => k.keyword === trimmed && k.channelId === channelId,
      );
      const next = alreadyExists ? keywords : [...keywords, rule];
      await publish(next, mutedKeywords);
      setKeywords(next);
    },
    [keywords, mutedKeywords, publish],
  );

  const removeKeyword = useCallback(
    async (word: string) => {
      const next = keywords.filter((k) => k.keyword !== word);
      await publish(next, mutedKeywords);
      setKeywords(next);
    },
    [keywords, mutedKeywords, publish],
  );

  const addMutedKeyword = useCallback(
    async (mk: string) => {
      const trimmed = mk.trim();
      if (!trimmed) return;
      const next = mutedKeywords.includes(trimmed)
        ? mutedKeywords
        : [...mutedKeywords, trimmed];
      await publish(keywords, next);
      setMutedKeywords(next);
    },
    [keywords, mutedKeywords, publish],
  );

  const removeMutedKeyword = useCallback(
    async (mk: string) => {
      const next = mutedKeywords.filter((k) => k !== mk);
      await publish(keywords, next);
      setMutedKeywords(next);
    },
    [keywords, mutedKeywords, publish],
  );

  return {
    keywords,
    mutedKeywords,
    addKeyword,
    removeKeyword,
    addMutedKeyword,
    removeMutedKeyword,
  };
}
