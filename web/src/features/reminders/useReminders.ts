import { useEffect, useState } from "react";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_REMINDER } from "@/shared/constants/kinds";

export interface Reminder {
  id: string;
  messageId: string;
  channelId: string;
  content: string;
  expiry: number;
  createdAt: number;
}

export function useReminders(currentPubkey: string | null): {
  reminders: Reminder[];
  isLoading: boolean;
} {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentPubkey) return;
    setIsLoading(true);
    const now = Math.floor(Date.now() / 1000);

    queryEvents(relayWsUrl(), {
      kinds: [KIND_REMINDER],
      authors: [currentPubkey],
      limit: 200,
    })
      .then((events) => {
        const parsed: Reminder[] = [];
        for (const raw of events) {
          const tags = (raw.tags as string[][]) ?? [];
          const messageId = tags.find((t) => t[0] === "e")?.[1] ?? "";
          const channelId = tags.find((t) => t[0] === "h")?.[1] ?? "";
          const expiryStr = tags.find((t) => t[0] === "expiration")?.[1];
          if (!expiryStr) continue;
          const expiry = Number(expiryStr);
          if (expiry <= now) continue;
          parsed.push({
            id: raw.id as string,
            messageId,
            channelId,
            content: raw.content as string,
            expiry,
            createdAt: raw.created_at as number,
          });
        }
        setReminders(parsed.sort((a, b) => a.expiry - b.expiry));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [currentPubkey]);

  return { reminders, isLoading };
}
