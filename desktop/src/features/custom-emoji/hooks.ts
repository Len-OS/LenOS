import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  KIND_EMOJI_SET,
  CUSTOM_EMOJI_SET_D_TAG,
  fetchOwnEmoji,
  listCustomEmoji,
  removeCustomEmoji,
  setCustomEmoji,
} from "@/shared/api/customEmoji";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { CustomEmoji } from "@/shared/lib/remarkCustomEmoji";

/**
 * React-query hooks for the community custom emoji palette (NIP-30, kind:30030).
 *
 * The palette is the client-side UNION of every member's own kind:30030 set, so
 * the query key is stable — not keyed by channel or pubkey. Freshness comes from
 * three layers: a catch-up fetch (the query itself), a live subscription that
 * invalidates on any member's new 30030, and a 2-minute poll backstop in case a
 * live event is missed. Mirrors `user-status/hooks.ts`.
 */

export const customEmojiQueryKey = ["custom-emoji"] as const;

/** Query key for the caller's OWN editable 30030 set (distinct from the union). */
export const ownCustomEmojiQueryKey = ["custom-emoji-own"] as const;

// ---------------------------------------------------------------------------
// Workspace emoji (kind:30078, d:"custom-emoji")
// ---------------------------------------------------------------------------

/** NIP-78 kind used for workspace-level admin-managed emoji. */
const KIND_WORKSPACE_EMOJI = 30078;
/** d-tag that identifies the workspace emoji set. */
const WORKSPACE_EMOJI_D_TAG = "custom-emoji";

/** Stable query key for the workspace (admin-managed) emoji list. */
export const workspaceCustomEmojiQueryKey = ["workspace-custom-emoji"] as const;

export interface WorkspaceEmojiPayload {
  emojis: Array<{ shortcode: string; url: string }>;
}

const SHORTCODE_RE = /^[a-z0-9_-]+$/;

function parseWorkspaceContent(content: string): CustomEmoji[] {
  try {
    const parsed = JSON.parse(content) as WorkspaceEmojiPayload;
    if (!Array.isArray(parsed.emojis)) return [];
    return parsed.emojis.filter(
      (e) =>
        typeof e.shortcode === "string" &&
        typeof e.url === "string" &&
        SHORTCODE_RE.test(e.shortcode),
    );
  } catch {
    return [];
  }
}

/** Fetch the current workspace emoji set (kind:30078 d:"custom-emoji"). */
async function fetchWorkspaceEmoji(): Promise<CustomEmoji[]> {
  const events = await relayClient.fetchEvents({
    kinds: [KIND_WORKSPACE_EMOJI],
    "#d": [WORKSPACE_EMOJI_D_TAG],
    limit: 10,
  });
  // If multiple authors published, take the most recently created one.
  if (events.length === 0) return [];
  const latest = events.reduce((best, ev) =>
    ev.created_at > best.created_at ? ev : best,
  );
  return parseWorkspaceContent(latest.content);
}

/** Query hook: read the workspace emoji list. */
export function useWorkspaceCustomEmojiQuery() {
  return useQuery<CustomEmoji[]>({
    queryKey: workspaceCustomEmojiQueryKey,
    queryFn: fetchWorkspaceEmoji,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/** Publish (replace) the full workspace emoji list as kind:30078. Admin only. */
async function publishWorkspaceEmoji(emojis: CustomEmoji[]): Promise<void> {
  const content = JSON.stringify({ emojis });
  const event = await signRelayEvent({
    kind: KIND_WORKSPACE_EMOJI,
    content,
    tags: [["d", WORKSPACE_EMOJI_D_TAG]],
  });
  await relayClient.publishEvent(
    event,
    "Timed out while saving workspace emoji.",
    "Failed to save workspace emoji.",
  );
}

/** Mutation: add or update a workspace emoji entry. Admin only. */
export function useSetWorkspaceEmojiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shortcode,
      url,
    }: {
      shortcode: string;
      url: string;
    }): Promise<string> => {
      const current = await fetchWorkspaceEmoji();
      const filtered = current.filter((e) => e.shortcode !== shortcode);
      filtered.push({ shortcode, url });
      await publishWorkspaceEmoji(filtered);
      return shortcode;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceCustomEmojiQueryKey,
      });
    },
  });
}

/** Mutation: remove a workspace emoji entry by shortcode. Admin only. */
export function useRemoveWorkspaceEmojiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shortcode: string): Promise<void> => {
      const current = await fetchWorkspaceEmoji();
      const filtered = current.filter((e) => e.shortcode !== shortcode);
      if (filtered.length === current.length) return; // nothing to remove
      await publishWorkspaceEmoji(filtered);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceCustomEmojiQueryKey,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Community palette (kind:30030) hooks — unchanged from original
// ---------------------------------------------------------------------------

export function useCustomEmojiQuery() {
  return useQuery<CustomEmoji[]>({
    queryKey: customEmojiQueryKey,
    queryFn: listCustomEmoji,
    // The palette changes rarely; avoid refetch storms while the picker is open,
    // but poll every 2 minutes as a backstop for any missed live event.
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/**
 * The caller's OWN custom emoji set — the only thing the settings card may add
 * to or remove from. Distinct from the community union (`useCustomEmojiQuery`),
 * which is read-only across members.
 */
export function useOwnCustomEmojiQuery() {
  return useQuery<CustomEmoji[]>({
    queryKey: ownCustomEmojiQueryKey,
    queryFn: fetchOwnEmoji,
    staleTime: 60_000,
  });
}

/**
 * Subscribe to every member's kind:30030 emoji sets and invalidate the palette
 * query whenever one arrives. Call once near the app root (alongside other
 * global live subscriptions). Safe to mount once; disposes on unmount.
 */
export function useCommunityEmojiLiveUpdates(): void {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;

    void relayClient
      .subscribeLive(
        { kinds: [KIND_EMOJI_SET], "#d": [CUSTOM_EMOJI_SET_D_TAG], limit: 0 },
        () => {
          void queryClient.invalidateQueries({ queryKey: customEmojiQueryKey });
        },
      )
      .then((unsubscribe) => {
        if (disposed) {
          void unsubscribe();
        } else {
          dispose = () => {
            void unsubscribe();
          };
        }
      })
      .catch((error) => {
        console.error("Failed to subscribe to community custom emoji", error);
      });

    // Re-sync on reconnect: a member's 30030 published while we were
    // disconnected won't replay through the live sub, so invalidate to
    // trigger a fresh catch-up fetch (don't wait for the 2-min poll).
    const unsubReconnect = relayClient.subscribeToReconnects(() => {
      void queryClient.invalidateQueries({ queryKey: customEmojiQueryKey });
    });

    return () => {
      disposed = true;
      unsubReconnect();
      dispose?.();
    };
  }, [queryClient]);
}

/**
 * Merged emoji palette: workspace emoji (kind:30078) union per-user emoji
 * (kind:30030). Personal emoji take precedence on shortcode collision so
 * individual members can override workspace defaults.
 *
 * Consumers (renderer, picker, send path) just want the flat list.
 */
export function useCustomEmoji(): CustomEmoji[] {
  const personal = useCustomEmojiQuery().data ?? [];
  const workspace = useWorkspaceCustomEmojiQuery().data ?? [];

  return React.useMemo(() => {
    // Start with workspace emoji, then override with personal emoji.
    const merged = new Map<string, string>();
    for (const e of workspace) {
      merged.set(e.shortcode, e.url);
    }
    for (const e of personal) {
      merged.set(e.shortcode, e.url);
    }
    return [...merged].map(([shortcode, url]) => ({ shortcode, url }));
  }, [personal, workspace]);
}

export function useSetCustomEmojiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shortcode, url }: { shortcode: string; url: string }) =>
      setCustomEmoji(shortcode, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customEmojiQueryKey });
      void queryClient.invalidateQueries({ queryKey: ownCustomEmojiQueryKey });
    },
  });
}

export function useRemoveCustomEmojiMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shortcode: string) => removeCustomEmoji(shortcode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customEmojiQueryKey });
      void queryClient.invalidateQueries({ queryKey: ownCustomEmojiQueryKey });
    },
  });
}
