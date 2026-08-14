import { useCallback, useEffect, useState } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_USER_STATUS } from "@/shared/constants/kinds";

export interface UserStatus {
  emoji: string;
  text: string;
  expiresAt?: number;
}

const statusCache = new Map<string, UserStatus | null>();

function parseStatus(content: string): UserStatus | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { emoji: trimmed, text: "" };
  return {
    emoji: trimmed.slice(0, spaceIdx),
    text: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export function useUserStatus(pubkey: string): UserStatus | null {
  const [status, setStatus] = useState<UserStatus | null>(
    statusCache.get(pubkey) ?? null,
  );

  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `status-${pubkey}`,
      filter: {
        kinds: [KIND_USER_STATUS],
        authors: [pubkey],
        "#d": ["general"],
        limit: 1,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const expirationTag = tags.find((t) => t[0] === "expiration")?.[1];
        const expiresAt = expirationTag
          ? parseInt(expirationTag, 10)
          : undefined;
        const parsed = parseStatus(raw.content as string);
        const withExpiry = parsed ? { ...parsed, expiresAt } : null;
        statusCache.set(pubkey, withExpiry);
        setStatus(withExpiry);
      },
    });
    return unsub;
  }, [pubkey]);

  const now = Math.floor(Date.now() / 1000);
  if (status?.expiresAt !== undefined && status.expiresAt < now) return null;
  return status;
}

const emojiMap: Record<string, string> = {
  online: "🟢",
  away: "🌙",
  dnd: "⛔",
  offline: "⭕",
};

export function useSetUserStatus() {
  return useCallback(
    async (
      status: "online" | "away" | "dnd" | "offline",
      statusText?: string,
    ) => {
      const content = statusText
        ? `${emojiMap[status]} ${statusText}`
        : emojiMap[status];
      const event = await signNostrEvent({
        kind: KIND_USER_STATUS,
        content,
        tags: [["d", "general"]],
        created_at: Math.floor(Date.now() / 1000),
      });
      await getRelayClient(relayWsUrl()).publishAndWait(event);
    },
    [],
  );
}
