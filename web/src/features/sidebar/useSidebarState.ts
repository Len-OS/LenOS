import { useCallback, useEffect, useState } from "react";
import type { Channel } from "@/features/channels/use-channels";
import { hasUnread } from "@/features/channels/unreadChannelCounts";
import { setLastRead } from "@/features/channels/readState/readStateStorage";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";
import { getMutedIds, toggleMute as storageMute } from "./lib/mutedChannels";
import {
  getStarredIds,
  getStarredOrder,
  toggleStar as storageStar,
} from "./lib/starredChannels";
import { buildSidebarSections, type SidebarSection } from "./lib/sidebarSections";

const UNREAD_KINDS = [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2, KIND_SYSTEM_MESSAGE];

interface Params {
  channels: Channel[];
  communityId: string | null;
}

interface SidebarState {
  sections: SidebarSection[];
  collapsedSections: Set<string>;
  toggleCollapse: (sectionId: string) => void;
  unreadOnly: boolean;
  setUnreadOnly: (v: boolean) => void;
  toggleMute: (channelId: string) => void;
  toggleStar: (channelId: string) => void;
  markRead: (channelId: string) => void;
  isUnread: (channelId: string) => boolean;
}

export function useSidebarState({ channels, communityId }: Params): SidebarState {
  const [lastMsgAt, setLastMsgAt] = useState<Record<string, number>>({});
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => getMutedIds());
  const [starredIds, setStarredIds] = useState<Set<string>>(() => getStarredIds());
  const [starredOrder, setStarredOrder] = useState<string[]>(() => getStarredOrder());
  const [unreadOnly, setUnreadOnly] = useState(false);

  const rawSections = buildSidebarSections(channels, mutedIds, starredIds, starredOrder);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const collapsed = new Set<string>();
    for (const s of rawSections) {
      if (s.defaultCollapsed) collapsed.add(s.id);
    }
    return collapsed;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: channels identity changes on every relay event; channels.length+communityId avoids infinite loop
  useEffect(() => {
    if (channels.length === 0 || !communityId) return;
    const channelIds = channels.map((c) => c.id);
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 86400 * 30;

    const unsub = client.subscribe({
      id: `sidebar-unread-state-${communityId}`,
      filter: { kinds: UNREAD_KINDS, "#h": channelIds, since, limit: 500 },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const channelId = tags.find((t) => t[0] === "h")?.[1];
        const ts = raw.created_at as number;
        if (!channelId || !ts) return;
        setLastMsgAt((prev) => {
          if ((prev[channelId] ?? 0) >= ts) return prev;
          return { ...prev, [channelId]: ts };
        });
      },
    });

    return unsub;
  }, [channels.length, communityId]);

  const toggleCollapse = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const toggleMute = useCallback((channelId: string) => {
    storageMute(channelId);
    setMutedIds(getMutedIds());
  }, []);

  const toggleStar = useCallback((channelId: string) => {
    storageStar(channelId);
    setStarredIds(getStarredIds());
    setStarredOrder(getStarredOrder());
  }, []);

  const markRead = useCallback(
    (channelId: string) => {
      const ts = lastMsgAt[channelId] ?? Math.floor(Date.now() / 1000);
      setLastRead(channelId, ts);
      setLastMsgAt((prev) => ({ ...prev }));
    },
    [lastMsgAt],
  );

  const isUnread = useCallback(
    (channelId: string) => hasUnread(channelId, lastMsgAt[channelId] ?? 0),
    [lastMsgAt],
  );

  const filteredSections: SidebarSection[] = rawSections.map((section) => ({
    ...section,
    channels: unreadOnly
      ? section.channels.filter((c) => isUnread(c.id))
      : section.channels,
  }));

  return {
    sections: filteredSections,
    collapsedSections,
    toggleCollapse,
    unreadOnly,
    setUnreadOnly,
    toggleMute,
    toggleStar,
    markRead,
    isUnread,
  };
}
