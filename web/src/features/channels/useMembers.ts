import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_GROUP_MEMBERS } from "@/shared/constants/kinds";

export interface Member {
  pubkey: string;
  role: "admin" | "member" | string;
}

export function useMembers(channelId: string | null): Member[] {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!channelId) {
      setMembers([]);
      return;
    }
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `members-${channelId}`,
      filter: { kinds: [KIND_GROUP_MEMBERS], "#d": [channelId] },
      onEvent: (raw) => {
        const tags = raw.tags as string[][];
        const parsed: Member[] = tags
          .filter((t) => t[0] === "p" && typeof t[1] === "string")
          .map((t) => ({
            pubkey: t[1],
            role: t[3] === "admin" ? "admin" : "member",
          }));
        setMembers(parsed);
      },
    });
    return () => {
      unsub();
      setMembers([]);
    };
  }, [channelId]);

  return members;
}
