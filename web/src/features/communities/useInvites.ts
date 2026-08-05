import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_INVITE = 30620;

export interface Invite {
  id: string;
  code: string;
  uses: number;
  maxUses: number | null;
  expiresAt: number | null;
  createdAt: number;
}

export function useInvites(communityId: string | null): Invite[] {
  const [invites, setInvites] = useState<Map<string, Invite>>(new Map());

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `invites-${communityId}`,
      filter: {
        kinds: [KIND_INVITE],
        "#h": [communityId],
        limit: 50,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const code = tags.find((t) => t[0] === "code")?.[1];
        if (!code) return;
        const usesStr = tags.find((t) => t[0] === "uses")?.[1];
        const maxUsesStr = tags.find((t) => t[0] === "max_uses")?.[1];
        const expiryStr = tags.find((t) => t[0] === "expiration")?.[1];
        const invite: Invite = {
          id: raw.id as string,
          code,
          uses: usesStr ? Number(usesStr) : 0,
          maxUses: maxUsesStr ? Number(maxUsesStr) : null,
          expiresAt: expiryStr ? Number(expiryStr) : null,
          createdAt: raw.created_at as number,
        };
        setInvites((prev) => {
          const existing = prev.get(code);
          if (existing && existing.createdAt >= invite.createdAt) return prev;
          const next = new Map(prev);
          next.set(code, invite);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setInvites(new Map());
    };
  }, [communityId]);

  return Array.from(invites.values()).sort((a, b) => b.createdAt - a.createdAt);
}
