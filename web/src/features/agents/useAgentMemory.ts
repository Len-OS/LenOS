import { useEffect, useState, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_MANAGED_AGENT } from "@/shared/constants/kinds";

export interface MemoryEntry {
  slug: string;
  body: string;
  links: string[];
}

export function useAgentMemory(agentPubkey: string): {
  entries: MemoryEntry[];
  isLoading: boolean;
  refetch: () => void;
} {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!agentPubkey) return;
    setIsLoading(true);
    setEntries([]);
    const client = getRelayClient(relayWsUrl());
    const timer = setTimeout(() => setIsLoading(false), 3000);

    const unsub = client.subscribe({
      id: `agent-memory-${agentPubkey}-${fetchKey}`,
      filter: {
        kinds: [KIND_MANAGED_AGENT],
        authors: [agentPubkey],
        limit: 1,
      },
      onEvent: (raw) => {
        setIsLoading(false);
        try {
          const parsed = JSON.parse((raw.content as string) ?? "") as {
            memory?: Array<{ slug?: string; body?: string; links?: string[] }>;
          };
          if (Array.isArray(parsed.memory)) {
            const valid: MemoryEntry[] = parsed.memory
              .filter((m) => typeof m.slug === "string" && typeof m.body === "string")
              .map((m) => ({
                slug: m.slug as string,
                body: m.body as string,
                links: Array.isArray(m.links) ? (m.links as string[]) : [],
              }));
            setEntries(valid);
          }
        } catch {
          // content not JSON or no memory field — empty entries is correct
        }
      },
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [agentPubkey, fetchKey]);

  return { entries, isLoading, refetch };
}
