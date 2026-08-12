import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_PRESENCE } from "@/shared/constants/kinds";

const ONLINE_TTL_MS = 90_000;
const STALE_CHECK_MS = 15_000;

// Module-level singleton — one subscription + one stale-check per workspace.
const presenceMap = new Map<string, number>();
const listeners = new Set<() => void>();
let staleInterval: ReturnType<typeof setInterval> | null = null;
let subUnsub: (() => void) | null = null;
let activeCommunityId: string | null = null;

function notify(): void {
  for (const fn of listeners) fn();
}

function ensureSub(communityId: string): void {
  if (activeCommunityId === communityId) return;
  subUnsub?.();
  activeCommunityId = communityId;
  presenceMap.clear();
  subUnsub = getRelayClient(relayWsUrl()).subscribe({
    id: `presence-${communityId}`,
    filter: { kinds: [KIND_PRESENCE], "#d": [communityId] },
    onEvent: (raw) => {
      const pk = raw.pubkey as string | undefined;
      if (!pk) return;
      presenceMap.set(pk, Date.now());
      notify();
    },
  });
  if (!staleInterval) {
    staleInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [pk, ts] of presenceMap.entries()) {
        if (now - ts >= ONLINE_TTL_MS) {
          presenceMap.delete(pk);
          changed = true;
        }
      }
      if (changed) notify();
    }, STALE_CHECK_MS);
  }
}

export function usePresence(
  pubkeys: readonly string[],
  communityId: string | null,
): Set<string> {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!communityId) return;
    ensureSub(communityId);
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [communityId]);

  if (!communityId) return new Set();
  const now = Date.now();
  return new Set(
    pubkeys.filter((pk) => {
      const ts = presenceMap.get(pk);
      return ts !== undefined && now - ts < ONLINE_TTL_MS;
    }),
  );
}
