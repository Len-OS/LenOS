import { useCallback, useEffect, useRef, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

export interface InboxItem {
  type: "mention" | "dm" | "thread_reply";
  messageId: string;
  channelId: string;
  from: string;
  content: string;
  createdAt: number;
  isRead: boolean;
}

const STORAGE_KEY = "lenos_home_read";

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markReadInStorage(id: string) {
  const ids = getReadIds();
  ids.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // storage full — ignore
  }
}

function markAllReadInStorage(ids: string[]) {
  const existing = getReadIds();
  for (const id of ids) existing.add(id);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...existing].slice(-500)),
    );
  } catch {
    // storage full — ignore
  }
}

const MENTION_KINDS = [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2];
const SINCE_DAYS = 7;

export function useHomeInbox(currentPubkey: string | null): {
  items: InboxItem[];
  markRead: (id: string) => void;
  markAllRead: () => void;
} {
  const [items, setItems] = useState<Map<string, InboxItem>>(new Map());
  const readIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    readIds.current = getReadIds();
  }, []);

  useEffect(() => {
    if (!currentPubkey) return;
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 86400 * SINCE_DAYS;

    const unsub = client.subscribe({
      id: `home-mentions-${currentPubkey}`,
      filter: {
        kinds: MENTION_KINDS,
        "#p": [currentPubkey],
        since,
        limit: 100,
      },
      onEvent: (raw) => {
        const id = raw.id as string;
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? "";
        const replyTag = tags.find(
          (t) => t[0] === "e" && t[3] === "reply",
        );
        const type: InboxItem["type"] = replyTag ? "thread_reply" : "mention";
        const item: InboxItem = {
          type,
          messageId: id,
          channelId,
          from: raw.pubkey as string,
          content: raw.content as string,
          createdAt: raw.created_at as number,
          isRead: readIds.current.has(id),
        };
        setItems((prev) => {
          if (prev.has(id)) return prev;
          const next = new Map(prev);
          next.set(id, item);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setItems(new Map());
    };
  }, [currentPubkey]);

  const markRead = useCallback((id: string) => {
    markReadInStorage(id);
    readIds.current.add(id);
    setItems((prev) => {
      const item = prev.get(id);
      if (!item || item.isRead) return prev;
      const next = new Map(prev);
      next.set(id, { ...item, isRead: true });
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => {
      const ids = [...prev.keys()];
      markAllReadInStorage(ids);
      for (const id of ids) readIds.current.add(id);
      const next = new Map(prev);
      for (const [id, item] of next) {
        if (!item.isRead) next.set(id, { ...item, isRead: true });
      }
      return next;
    });
  }, []);

  const sorted = Array.from(items.values()).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  return { items: sorted, markRead, markAllRead };
}
