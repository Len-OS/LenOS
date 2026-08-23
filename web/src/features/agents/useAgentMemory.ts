import { useEffect, useState, useCallback } from "react";
import { getConversationKey, decrypt } from "nostr-tools/nip44";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { getEncryptionKey } from "./lib/credentialApi";
import { KIND_AGENT_ENGRAM } from "@/shared/constants/kinds";

const OUTGOING_REF_RE = /\[\[([^\]]+)\]\]/g;

export interface MemoryEntry {
  slug: string;
  body: string;
  links: string[];
}

export function useAgentMemory(agentPubkey: string): {
  entries: MemoryEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!agentPubkey) return;

    const seckey = getEncryptionKey();
    if (!seckey) {
      setError(
        "Memory requires a local Nostr key. Set one up in Settings → Identity.",
      );
      setEntries([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setEntries([]);

    void (async () => {
      try {
        const viewerPubkey = await getCurrentPubkey();
        if (!viewerPubkey || cancelled) return;

        // NIP-44 conversation key: symmetric between (ownerSeckey, agentPubkey)
        // and (agentSeckey, ownerPubkey) — owner uses their own seckey here.
        const ck = getConversationKey(seckey, agentPubkey);

        const events = await queryEvents(relayWsUrl(), {
          kinds: [KIND_AGENT_ENGRAM],
          authors: [agentPubkey],
          "#p": [viewerPubkey],
          limit: 5000,
        });

        if (cancelled) return;

        const parsed: MemoryEntry[] = [];
        for (const ev of events) {
          const slug = (ev.tags as string[][]).find((t) => t[0] === "d")?.[1];
          if (!slug) continue;
          try {
            const body = decrypt(ev.content as string, ck);
            const links: string[] = [];
            for (const m of body.matchAll(OUTGOING_REF_RE)) {
              if (m[1]) links.push(m[1]);
            }
            parsed.push({ slug, body, links });
          } catch {
            // event failed NIP-44 decrypt — not addressed to this viewer, skip
          }
        }

        // core first, then mem/* alphabetically
        parsed.sort((a, b) => {
          if (a.slug === "core") return -1;
          if (b.slug === "core") return 1;
          return a.slug.localeCompare(b.slug);
        });

        setEntries(parsed);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load memory.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentPubkey, fetchKey]);

  return { entries, isLoading, error, refetch };
}
