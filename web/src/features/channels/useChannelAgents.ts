import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_AGENT_OBSERVER_FRAME } from "@/shared/constants/kinds";
import type { ActivityType } from "@/features/agents/ui/AgentActivityRow";

export interface ChannelAgent {
  pubkey: string;
  latestActivityContent: string;
  latestActivityType: ActivityType;
  frameCount: number;
  latestTimestamp: number;
}

const ACTIVE_WINDOW_SECONDS = 300;
const VALID_TYPES = new Set<string>(["thought", "tool", "message", "plan", "command"]);

function parseActivityType(raw: string | undefined): ActivityType {
  if (raw && VALID_TYPES.has(raw)) return raw as ActivityType;
  return "message";
}

export function useChannelAgents(channelId: string): ChannelAgent[] {
  const [agentMap, setAgentMap] = useState<Map<string, ChannelAgent>>(new Map());

  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `channel-agents-${channelId}`,
      filter: {
        kinds: [KIND_AGENT_OBSERVER_FRAME],
        "#h": [channelId],
        limit: 100,
      },
      onEvent: (raw) => {
        const pubkey = raw.pubkey as string;
        const tags = (raw.tags as string[][]) ?? [];
        const type = parseActivityType(tags.find((t) => t[0] === "type")?.[1]);
        const timestamp = raw.created_at as number;
        const content = (raw.content as string) || "";

        setAgentMap((prev) => {
          const existing = prev.get(pubkey);
          if (existing && existing.latestTimestamp >= timestamp) return prev;
          const next = new Map(prev);
          next.set(pubkey, {
            pubkey,
            latestActivityContent: content,
            latestActivityType: type,
            frameCount: (existing?.frameCount ?? 0) + 1,
            latestTimestamp: timestamp,
          });
          return next;
        });
      },
    });

    return () => {
      unsub();
      setAgentMap(new Map());
    };
  }, [channelId]);

  const now = Math.floor(Date.now() / 1000);
  return Array.from(agentMap.values())
    .filter((a) => now - a.latestTimestamp < ACTIVE_WINDOW_SECONDS)
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}
