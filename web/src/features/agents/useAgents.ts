import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const KIND_AGENT_DEFINITION = 30177;

export interface Agent {
  id: string;
  pubkey: string;
  name: string;
  description: string;
  agentType: string;
  /** Managed LenGrowth agents execute outside the browser/desktop process. */
  remote: boolean;
  status: "online" | "away" | "offline";
  createdAt: number;
}

function parseAgent(raw: {
  id: string;
  pubkey: string;
  tags: string[][];
  created_at: number;
  content?: string;
}): Agent {
  const tags = raw.tags;
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse((raw as { content?: string }).content ?? "") as Record<
      string,
      unknown
    >;
  } catch {
    // Legacy clients publish the display fields as tags only.
  }
  const dTag = tags.find((t) => t[0] === "d")?.[1] ?? raw.pubkey;
  const name =
    tags.find((t) => t[0] === "name")?.[1] ??
    (typeof content.name === "string" ? content.name : undefined) ??
    dTag ??
    "Unknown Agent";
  const description =
    tags.find((t) => t[0] === "about")?.[1] ??
    (typeof content.description === "string" ? content.description : "");
  const agentType =
    tags.find((t) => t[0] === "agent_type")?.[1] ??
    (typeof content.agent_type === "string" ? content.agent_type : "remote");
  const remote =
    tags.find((t) => t[0] === "remote")?.[1] === "true" ||
    content.remote === true ||
    agentType !== "local";
  const status =
    (tags.find((t) => t[0] === "status")?.[1] as Agent["status"]) ?? "offline";
  return {
    id: dTag,
    pubkey: dTag,
    name,
    description,
    agentType,
    remote,
    status,
    createdAt: raw.created_at,
  };
}

export function useAgents(communityId: string | null): Agent[] {
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `agents-list-${communityId}`,
      filter: {
        kinds: [KIND_AGENT_DEFINITION],
        limit: 100,
      },
      onEvent: (raw) => {
        const agent = parseAgent({
          id: raw.id as string,
          pubkey: raw.pubkey as string,
          tags: (raw.tags as string[][]) ?? [],
          created_at: raw.created_at as number,
          content: raw.content as string | undefined,
        });
        setAgents((prev) => {
          const existing = prev.get(agent.pubkey);
          if (existing && existing.createdAt >= agent.createdAt) return prev;
          const next = new Map(prev);
          next.set(agent.pubkey, agent);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setAgents(new Map());
    };
  }, [communityId]);

  return Array.from(agents.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
