import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface DmChannel {
  id: string;
  participantPubkeys: string[];
  createdAt: number;
}

export function useDmList(communityId: string | null): DmChannel[] {
  const [dms, setDms] = useState<DmChannel[]>([]);

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `dm-list-${communityId}`,
      filter: { kinds: [39000], "#h": [communityId], "#private": [""] },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const dTag = tags.find((t) => t[0] === "d")?.[1] ?? "";
        if (!dTag) return;
        const pTags = tags.filter((t) => t[0] === "p").map((t) => t[1]);
        setDms((prev) => {
          const filtered = prev.filter((d) => d.id !== dTag);
          return [
            ...filtered,
            {
              id: dTag,
              participantPubkeys: pTags,
              createdAt: raw.created_at as number,
            },
          ].sort((a, b) => b.createdAt - a.createdAt);
        });
      },
    });
    return () => {
      unsub();
      setDms([]);
    };
  }, [communityId]);

  return dms;
}
