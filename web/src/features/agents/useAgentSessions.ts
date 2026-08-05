import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_AGENT_SESSION = 30178;

export interface AgentSession {
  id: string;
  pubkey: string;
  channelId: string;
  model: string;
  createdAt: number;
}

export function useAgentSessions(agentPubkey: string | null): AgentSession[] {
  const [sessions, setSessions] = useState<Map<string, AgentSession>>(new Map());

  useEffect(() => {
    if (!agentPubkey) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `agent-sessions-${agentPubkey}`,
      filter: {
        kinds: [KIND_AGENT_SESSION],
        authors: [agentPubkey],
        limit: 50,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1] ?? "";
        const model = tags.find((t) => t[0] === "model")?.[1] ?? "";
        const session: AgentSession = {
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          channelId,
          model,
          createdAt: raw.created_at as number,
        };
        setSessions((prev) => {
          if (prev.has(session.id)) return prev;
          const next = new Map(prev);
          next.set(session.id, session);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setSessions(new Map());
    };
  }, [agentPubkey]);

  return Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}
