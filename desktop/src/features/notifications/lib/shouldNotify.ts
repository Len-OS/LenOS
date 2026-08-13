import type { RelayEvent } from "@/shared/api/types";
import {
  getThreadReference,
  isBroadcastReply,
} from "@/features/messages/lib/threading";
import { isDndActive } from "./dndStateStore";
import type { KeywordRule } from "./useKeywordRules";

export function hasMentionForEvent(
  event: RelayEvent,
  currentPubkey: string,
): boolean {
  return (
    currentPubkey.length > 0 &&
    event.tags.some(
      (tag) => tag[0] === "p" && tag[1]?.toLowerCase() === currentPubkey,
    )
  );
}

export type NotifyOptions = {
  participatedRootIds: ReadonlySet<string>;
  followedRootIds: ReadonlySet<string>;
  authoredRootIds: ReadonlySet<string>;
  mutedRootIds?: ReadonlySet<string>;
  mutedChannelIds?: ReadonlySet<string>;
  channelId?: string | null;
  keywordRules?: readonly KeywordRule[];
  mutedKeywords?: readonly string[];
};

export function shouldNotifyForEvent(
  event: RelayEvent,
  currentPubkey: string,
  options: NotifyOptions,
): boolean {
  const {
    participatedRootIds,
    followedRootIds,
    authoredRootIds,
    mutedRootIds = new Set(),
    mutedChannelIds = new Set(),
    channelId = null,
  } = options;
  const { parentId, rootId } = getThreadReference(event.tags);

  if (isDndActive()) return false;

  if (isBroadcastReply(event.tags)) {
    return true;
  }

  if (hasMentionForEvent(event, currentPubkey)) {
    return true;
  }

  if (typeof event.content === "string") {
    const lower = event.content.toLowerCase();

    const matchKeyword = (rule: KeywordRule) => {
      if (rule.channelId && rule.channelId !== options.channelId) return false;
      const pat = rule.keyword;
      if (pat.startsWith("/") && pat.endsWith("/") && pat.length > 2) {
        try {
          return new RegExp(pat.slice(1, -1), "i").test(lower);
        } catch {
          return false;
        }
      }
      return lower.includes(pat.toLowerCase());
    };

    const mutedMatch = options.mutedKeywords?.some((mk) =>
      lower.includes(mk.toLowerCase()),
    );
    if (mutedMatch) return false;
    const keywordMatch = options.keywordRules?.some(matchKeyword);
    if (keywordMatch) return true;
  }

  if (channelId !== null && mutedChannelIds.has(channelId)) {
    return false;
  }

  if (parentId === null) {
    return true;
  }

  if (rootId !== null && mutedRootIds.has(rootId)) {
    return false;
  }

  if (rootId !== null && participatedRootIds.has(rootId)) {
    return true;
  }

  if (rootId !== null && followedRootIds.has(rootId)) {
    return true;
  }

  if (rootId !== null && authoredRootIds.has(rootId)) {
    return true;
  }

  return false;
}

export function isHighPriorityEventForUser(
  event: RelayEvent,
  currentPubkey: string,
): boolean {
  if (
    currentPubkey.length > 0 &&
    event.tags.some(
      (tag) => tag[0] === "p" && tag[1]?.toLowerCase() === currentPubkey,
    )
  ) {
    return true;
  }
  if (isBroadcastReply(event.tags)) {
    return true;
  }
  return false;
}
