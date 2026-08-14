import * as React from "react";
import { VList } from "virtua";
import type { VListHandle } from "virtua";

import { formatDayHeading } from "@/features/messages/lib/dateFormatters";
import { timelineRowReserveStyle } from "@/features/messages/lib/rowHeightEstimate";
import {
  buildTimelineDayGroups,
  buildTimelineItems,
  getTimelineItemKey,
  type TimelineDayGroup,
  type TimelineNonDayItem,
} from "@/features/messages/lib/timelineItems";
import {
  buildVirtualizedItems,
  didPrependVirtualizedTimeline,
  estimateVirtualizedTimelineItemHeight,
  type VirtualizedTimelineItem,
  virtualizedItemKey,
} from "@/features/messages/lib/virtualizedTimelineItems";
import { THREAD_REPLY_ROW_MARGIN_INLINE_REM } from "@/features/messages/lib/threadTreeLayout";
import { buildMainTimelineEntries } from "@/features/messages/lib/threadPanel";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import { buildVideoReviewContextsByMessageId } from "@/features/messages/lib/videoReviewContext";
import type { buildVideoReviewContextForMessage } from "@/features/messages/lib/videoReviewContext";
import type { TimelineMessage } from "@/features/messages/types";
import type { ReadReceipt } from "@/features/messages/read-receipts/types";
import { canManageMessageForCurrentUser } from "@/features/messages/lib/canManageMessage";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { ChannelType } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { DayDivider } from "./DayDivider";
import { MessageRow } from "./MessageRow";
import { MessageThreadSummaryRow } from "./MessageThreadSummaryRow";
import { SystemMessageRow } from "./SystemMessageRow";
import { UnreadDivider } from "./UnreadDivider";
import { useTimelineRetention } from "./useTimelineRetention";
import { useUpwardPaginationWheel } from "./useUpwardPaginationWheel";
import { useVirtualizedBottomSettle } from "./useVirtualizedBottomSettle";

export type TimelineVirtualizerApi = {
  cancelBottomIntent: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  settleAtBottom: () => void;
  scrollToMessage: (
    messageId: string,
    options?: { behavior?: ScrollBehavior },
  ) => boolean;
};

type TimelineMessageListProps = {
  channelId?: string | null;
  channelName?: string;
  channelType?: ChannelType | null;
  currentPubkey?: string;
  huddleMemberPubkeys?: readonly string[];
  huddleMemberPubkeysPending?: boolean;
  /** Event id of the oldest unread top-level message; renders a "New" divider above it. */
  firstUnreadMessageId?: string | null;
  followThreadById?: (rootId: string) => void;
  highlightedMessageId?: string | null;
  isFollowingThreadById?: (rootId: string) => boolean;
  isMessageUnreadById?: (messageId: string) => boolean;
  entranceMessageId?: string | null;
  onEntranceMessageComplete?: (messageId: string) => void;
  messageFooters?: Record<string, React.ReactNode>;
  /** Hoisted main-timeline entries (computed once in ChannelPane). Falls back
   *  to deriving them here when omitted (e.g. the deferred-render pass). */
  mainEntries?: MainTimelineEntry[];
  /** Relay thread summaries keyed by thread root id. Keeps badge rows alive on
   *  the deferred-render fallback — replies usually are not local timeline
   *  rows, so without the relay map every summary row unmounts mid-scrollback. */
  threadSummaries?: ReadonlyMap<string, ChannelWindowThreadSummary>;
  messages: TimelineMessage[];
  isAdmin?: boolean;
  pinnedMessageIds?: Set<string>;
  onDelete?: (message: TimelineMessage) => void;
  onEdit?: (message: TimelineMessage) => void;
  onMarkUnread?: (message: TimelineMessage) => void;
  onMarkRead?: (message: TimelineMessage) => void;
  onPin?: (message: TimelineMessage) => void;
  onUnpin?: (eventId: string) => void;
  onReply?: (message: TimelineMessage) => void;
  onOpenThread?: (message: TimelineMessage) => void;
  isSendingVideoReviewComment?: boolean;
  onSendVideoReviewComment?: (
    message: TimelineMessage,
    content: string,
    mentionPubkeys: string[],
    mediaTags?: string[][],
    parentEventId?: string,
  ) => Promise<void>;
  unfollowThreadById?: (rootId: string) => void;
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  /** Map from lowercase pubkey → persona display name for bot members. */
  personaLookup?: Map<string, string>;
  /** Read receipts keyed by pubkey for the current channel. */
  readReceipts?: Map<string, ReadReceipt>;
  profiles?: UserProfileLookup;
  ownerProfiles?: UserProfileLookup;
  /** The message ID of the currently active find-in-channel match. */
  searchActiveMessageId?: string | null;
  /** Set of message IDs that match the current find-in-channel query. */
  searchMatchingMessageIds?: Set<string>;
  /** The current find-in-channel query string. */
  searchQuery?: string;
  /** Per-thread unread counts keyed by thread root id. */
  threadUnreadCounts?: ReadonlyMap<string, number>;
  /** Content rendered as the first virtual row before channel history. */
  leadingContent?: React.ReactNode;
  /**
   * True when the loaded window provably starts at the channel's beginning.
   * Proves the oldest loaded day's boundary so its divider may render.
   */
  historyExhausted?: boolean;
  /** The virtualized timeline owns its scroll node when enabled. */
  useVirtualizer?: boolean;
  onStartReached?: () => boolean;
  onAtBottomStateChange?: (atBottom: boolean) => void;
  onVirtualizerApiChange?: (api: TimelineVirtualizerApi | null) => void;
  onVirtualizerRangeChanged?: () => void;
  onVirtualizerScrollerChange?: (element: HTMLDivElement | null) => void;
};

export const TimelineMessageList = React.memo(function TimelineMessageList({
  channelId,
  channelName,
  channelType,
  currentPubkey,
  firstUnreadMessageId = null,
  followThreadById,
  highlightedMessageId = null,
  huddleMemberPubkeys,
  huddleMemberPubkeysPending = false,
  isAdmin,
  isFollowingThreadById,
  isMessageUnreadById,
  entranceMessageId = null,
  onEntranceMessageComplete,
  messageFooters,
  mainEntries,
  threadSummaries,
  messages,
  onDelete,
  onEdit,
  onMarkUnread,
  onMarkRead,
  onPin,
  onUnpin,
  pinnedMessageIds,
  onReply,
  onOpenThread,
  isSendingVideoReviewComment = false,
  onSendVideoReviewComment,
  onToggleReaction,
  profiles,
  ownerProfiles,
  searchActiveMessageId = null,
  searchMatchingMessageIds,
  searchQuery,
  threadUnreadCounts,
  unfollowThreadById,
  readReceipts,
  leadingContent,
  historyExhausted = false,
  useVirtualizer = false,
  onStartReached,
  onAtBottomStateChange,
  onVirtualizerApiChange,
  onVirtualizerRangeChanged,
  onVirtualizerScrollerChange,
}: TimelineMessageListProps) {
  const entries = React.useMemo(
    () =>
      mainEntries ??
      buildMainTimelineEntries(messages, undefined, threadSummaries, profiles),
    [mainEntries, messages, profiles, threadSummaries],
  );
  // Contexts are memoized per message id so MessageRow/Markdown memo
  // comparisons hold across unrelated timeline re-renders (typing
  // indicators, presence updates) — a fresh context object per render would
  // defeat the memo and re-render every video message on every pass.
  const videoReviewContextById = React.useMemo(() => {
    return buildVideoReviewContextsByMessageId({
      channelId,
      channelName,
      channelType,
      isSendingVideoReviewComment,
      messages,
      onSendVideoReviewComment,
      onToggleReaction,
      profiles,
    });
  }, [
    channelId,
    channelName,
    channelType,
    isSendingVideoReviewComment,
    messages,
    onSendVideoReviewComment,
    onToggleReaction,
    profiles,
  ]);

  // The flattened item stream, memoized on the entries and the unread boundary
  // (the unread divider is its own item, so it shifts subsequent rows).
  const itemsResult = React.useMemo(
    () => buildTimelineItems(entries, firstUnreadMessageId),
    [entries, firstUnreadMessageId],
  );
  const dayGroups = React.useMemo(
    () => buildTimelineDayGroups(itemsResult.items),
    [itemsResult.items],
  );

  const renderItem = React.useCallback(
    (item: TimelineNonDayItem) => {
      switch (item.kind) {
        case "unread-divider":
          return <UnreadDivider />;
        case "system":
          return (
            <SystemRow
              currentPubkey={currentPubkey}
              entry={item.entry}
              footer={messageFooters?.[item.entry.message.id] ?? null}
              onToggleReaction={onToggleReaction}
              profiles={profiles}
              ownerProfiles={ownerProfiles}
            />
          );
        case "system-group":
          return (
            <SystemRow
              currentPubkey={currentPubkey}
              entries={item.entries}
              footer={item.entries.map(
                (entry) => messageFooters?.[entry.message.id] ?? null,
              )}
              onToggleReaction={onToggleReaction}
              profiles={profiles}
              ownerProfiles={ownerProfiles}
            />
          );
        case "message":
          return (
            <MessageRowItem
              channelId={channelId}
              currentPubkey={currentPubkey}
              entry={item.entry}
              followThreadById={followThreadById}
              footer={messageFooters?.[item.entry.message.id] ?? null}
              highlightedMessageId={highlightedMessageId}
              huddleMemberPubkeys={huddleMemberPubkeys}
              huddleMemberPubkeysPending={huddleMemberPubkeysPending}
              isAdmin={isAdmin}
              isContinuation={item.isContinuation}
              isFollowedByContinuation={item.isFollowedByContinuation}
              isFollowingThreadById={isFollowingThreadById}
              isUnread={isMessageUnreadById?.(item.entry.message.id)}
              pinnedMessageIds={pinnedMessageIds}
              playEntrance={item.entry.message.id === entranceMessageId}
              onEntranceComplete={onEntranceMessageComplete}
              onDelete={onDelete}
              onEdit={onEdit}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onPin={onPin}
              onUnpin={onUnpin}
              onReply={onReply}
              onOpenThread={onOpenThread}
              onToggleReaction={onToggleReaction}
              profiles={profiles}
              readReceipts={readReceipts}
              searchActiveMessageId={searchActiveMessageId}
              searchMatchingMessageIds={searchMatchingMessageIds}
              searchQuery={searchQuery}
              threadUnreadCounts={threadUnreadCounts}
              unfollowThreadById={unfollowThreadById}
              videoReviewContext={videoReviewContextById.get(
                item.entry.message.id,
              )}
            />
          );
      }
    },
    [
      channelId,
      currentPubkey,
      followThreadById,
      highlightedMessageId,
      huddleMemberPubkeys,
      huddleMemberPubkeysPending,
      isAdmin,
      isFollowingThreadById,
      isMessageUnreadById,
      entranceMessageId,
      onEntranceMessageComplete,
      messageFooters,
      onDelete,
      onEdit,
      onMarkRead,
      onMarkUnread,
      onPin,
      onUnpin,
      pinnedMessageIds,
      onReply,
      onOpenThread,
      onToggleReaction,
      profiles,
      ownerProfiles,
      readReceipts,
      searchActiveMessageId,
      searchMatchingMessageIds,
      searchQuery,
      threadUnreadCounts,
      unfollowThreadById,
      videoReviewContextById,
    ],
  );

  if (useVirtualizer) {
    return (
      <VirtualizedTimelineRows
        dayGroups={dayGroups}
        historyExhausted={historyExhausted}
        leadingContent={leadingContent}
        onAtBottomStateChange={onAtBottomStateChange}
        onStartReached={onStartReached}
        onVirtualizerApiChange={onVirtualizerApiChange}
        onVirtualizerRangeChanged={onVirtualizerRangeChanged}
        onVirtualizerScrollerChange={onVirtualizerScrollerChange}
        renderItem={renderItem}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {dayGroups.map((group) => (
        <section
          className={cn(
            "relative flex flex-col",
            group.headingTimestamp !== null &&
              "before:absolute before:inset-x-0 before:top-4 before:h-px before:bg-border/35 before:content-['']",
          )}
          data-day-label={
            group.headingTimestamp === null
              ? undefined
              : formatDayHeading(group.headingTimestamp)
          }
          data-testid="message-timeline-day-group"
          key={group.key}
        >
          {group.headingTimestamp === null ? null : (
            <DayDivider label={formatDayHeading(group.headingTimestamp)} />
          )}
          {group.items.map((item) => (
            <TimelineRowShell item={item} key={getTimelineItemKey(item)}>
              {renderItem(item)}
            </TimelineRowShell>
          ))}
        </section>
      ))}
    </div>
  );
});

function timelineItemMessageId(item: TimelineNonDayItem): string | null {
  return item.kind === "message" || item.kind === "system"
    ? item.entry.message.id
    : null;
}

type VirtualizedTimelineRowsProps = {
  dayGroups: TimelineDayGroup[];
  historyExhausted: boolean;
  leadingContent?: React.ReactNode;
  onAtBottomStateChange?: (atBottom: boolean) => void;
  onStartReached?: () => boolean;
  onVirtualizerApiChange?: (api: TimelineVirtualizerApi | null) => void;
  onVirtualizerRangeChanged?: () => void;
  onVirtualizerScrollerChange?: (element: HTMLDivElement | null) => void;
  renderItem: (item: TimelineNonDayItem) => React.ReactNode;
};

type VirtualizedTimelineItemShellProps = {
  children: React.ReactNode;
  index: number;
  ref?: React.LegacyRef<HTMLDivElement>;
  style: React.CSSProperties;
};

const PreserveVirtualizedItemVisibilityContext = React.createContext(false);

function VirtualizedTimelineItemShell({
  children,
  ref,
  style,
}: VirtualizedTimelineItemShellProps) {
  const preserveVisibility = React.useContext(
    PreserveVirtualizedItemVisibilityContext,
  );
  return (
    <div
      ref={ref}
      style={preserveVisibility ? style : { ...style, visibility: undefined }}
    >
      {children}
    </div>
  );
}

function VirtualizedTimelineRows({
  dayGroups,
  historyExhausted,
  leadingContent,
  onAtBottomStateChange,
  onStartReached,
  onVirtualizerApiChange,
  onVirtualizerRangeChanged,
  onVirtualizerScrollerChange,
  renderItem,
}: VirtualizedTimelineRowsProps) {
  const listRef = React.useRef<VListHandle>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const itemsLengthRef = React.useRef(0);
  const messageItemIndexByIdRef = React.useRef<ReadonlyMap<string, number>>(
    new Map(),
  );
  const [offscreenBufferSize, setOffscreenBufferSize] = React.useState(() =>
    typeof window === "undefined" ? 1_000 : window.innerHeight,
  );
  const estimateCallCountRef = React.useRef(0);
  const hasInitialPositionedRef = React.useRef(false);
  const items = React.useMemo(
    () => buildVirtualizedItems(dayGroups, leadingContent, historyExhausted),
    [dayGroups, historyExhausted, leadingContent],
  );
  const keys = React.useMemo(() => items.map(virtualizedItemKey), [items]);
  itemsLengthRef.current = items.length;
  const previousKeysRef = React.useRef<readonly string[]>([]);
  const previousAnchorRef = React.useRef<{
    messageId: string;
    top: number;
  } | null>(null);
  const [prependShiftEpoch, clearPrependShift] = React.useReducer(
    (version: number) => version + 1,
    0,
  );
  const { cancel: cancelBottomSettle, settle: settleAtBottom } =
    useVirtualizedBottomSettle(hostRef, listRef, itemsLengthRef);
  const { arm: armUpwardMomentum } = useUpwardPaginationWheel(
    hostRef,
    cancelBottomSettle,
  );

  React.useEffect(
    () => () => {
      cancelBottomSettle();
    },
    [cancelBottomSettle],
  );

  const isPrepend = React.useMemo(() => {
    void prependShiftEpoch;
    return didPrependVirtualizedTimeline(previousKeysRef.current, keys);
  }, [keys, prependShiftEpoch]);
  const isPrependRef = React.useRef(isPrepend);
  isPrependRef.current = isPrepend;

  React.useLayoutEffect(() => {
    previousKeysRef.current = keys;
    if (isPrependRef.current) {
      clearPrependShift();
    }
    if (!hasInitialPositionedRef.current && items.length > 0) {
      hasInitialPositionedRef.current = true;
      settleAtBottom();
    }
  }, [items.length, keys, settleAtBottom]);

  // Virtua's shift transaction preserves its estimate cache, but a timeline
  // contains heterogeneous measured rows. Capture the visible keyed row after
  // every settled commit and correct its actual pixel drift after a prepend.
  // This keeps the reader's mounted DOM anchor stable even when the prepended
  // page contains rows whose measured heights differ from the estimate.
  React.useLayoutEffect(() => {
    const scroller = hostRef.current?.firstElementChild;
    if (!(scroller instanceof HTMLDivElement)) return;
    if (keys.length === 0) {
      previousAnchorRef.current = null;
      return;
    }

    const previousAnchor = previousAnchorRef.current;
    const restoreAnchor = () => {
      if (!previousAnchor) return;
      const anchor = scroller.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(previousAnchor.messageId)}"]`,
      );
      if (anchor) {
        const scrollerTop = scroller.getBoundingClientRect().top;
        const drift =
          anchor.getBoundingClientRect().top - scrollerTop - previousAnchor.top;
        if (Math.abs(drift) > 0.5) {
          scroller.scrollTop += drift;
        }
      }
    };

    if (isPrependRef.current) {
      // Measurements can land over several animation frames. Keep correcting
      // the same keyed row until the prepend's first-pass geometry settles.
      // The mock and real history paths can both defer row measurement behind
      // a network-sized delay; keep the transaction alive through that window.
      let remainingFrames = 90;
      let frame: number | null = null;
      const settle = () => {
        restoreAnchor();
        remainingFrames -= 1;
        if (remainingFrames > 0) frame = requestAnimationFrame(settle);
      };
      frame = requestAnimationFrame(settle);
      // The keyed effect is cleaned up when a new item set arrives or the list
      // unmounts; cancel the loop in either case.
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }

    const scrollerTop = scroller.getBoundingClientRect().top;
    const rows = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-message-id]"),
    );
    const visible = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top - scrollerTop >= 0 && rect.bottom > scrollerTop + 1;
    });
    previousAnchorRef.current = visible
      ? {
          messageId: visible.dataset.messageId ?? "",
          top: visible.getBoundingClientRect().top - scrollerTop,
        }
      : null;
  }, [keys]);

  const messageItemIndexById = React.useMemo(() => {
    const byId = new Map<string, number>();
    items.forEach((item, index) => {
      if (item.kind !== "timeline-item") return;
      const messageId = timelineItemMessageId(item.item);
      if (messageId) byId.set(messageId, index);
    });
    return byId;
  }, [items]);
  messageItemIndexByIdRef.current = messageItemIndexById;

  React.useLayoutEffect(() => {
    const scroller = hostRef.current?.firstElementChild;
    const element = scroller instanceof HTMLDivElement ? scroller : null;
    if (element) {
      element.dataset.lenosConversationScroll = "true";
      element.dataset.testid = "message-timeline";
    }
    onVirtualizerScrollerChange?.(element);
    return () => onVirtualizerScrollerChange?.(null);
  }, [onVirtualizerScrollerChange]);

  React.useLayoutEffect(() => {
    if (!onVirtualizerApiChange) return;
    const api: TimelineVirtualizerApi = {
      cancelBottomIntent: cancelBottomSettle,
      scrollToBottom() {
        settleAtBottom();
      },
      settleAtBottom,
      scrollToMessage(messageId) {
        cancelBottomSettle();
        const index = messageItemIndexByIdRef.current.get(messageId);
        if (index === undefined) return false;
        listRef.current?.scrollToIndex(index, { align: "center" });
        return true;
      },
    };
    onVirtualizerApiChange(api);
    return () => onVirtualizerApiChange(null);
  }, [cancelBottomSettle, onVirtualizerApiChange, settleAtBottom]);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateBufferSize = () => {
      // Measure rows three viewports ahead of the reader. Virtua deliberately
      // hides each newly mounted row until its first ResizeObserver result; a
      // one-viewport lead can be consumed by WebKit trackpad momentum before
      // that result commits, producing a first-pass-only blank flash. The
      // measured size is cached, which is why revisiting the same range is
      // already stable.
      setOffscreenBufferSize(host.clientHeight * 40);
    };
    updateBufferSize();
    const resizeObserver = new ResizeObserver(updateBufferSize);
    resizeObserver.observe(host);
    return () => resizeObserver.disconnect();
  }, []);

  const estimateItemSize = React.useCallback(
    (item: VirtualizedTimelineItem) => {
      estimateCallCountRef.current += 1;
      return estimateVirtualizedTimelineItemHeight(item);
    },
    [],
  );

  React.useEffect(() => {
    const scroller = hostRef.current?.firstElementChild;
    if (!(scroller instanceof HTMLDivElement)) return;
    const updateCount = () => {
      scroller.dataset.virtuaEstimateCallCount = String(
        estimateCallCountRef.current,
      );
    };
    updateCount();
    const frame = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(frame);
  });

  const { retainedIndices, onScrollEnd: handleScrollEnd } =
    useTimelineRetention(keys, listRef, isPrepend);

  const handleScroll = React.useCallback(
    (offset: number) => {
      const list = listRef.current;
      const scroller = hostRef.current?.firstElementChild;
      if (!list || !(scroller instanceof HTMLDivElement)) return;
      onVirtualizerRangeChanged?.();
      const distanceFromBottom = list.scrollSize - list.viewportSize - offset;
      // Do not infer reader intent from an intermediate virtualizer offset.
      // Initial channel positioning deliberately chases the floor while rows
      // are measured; those measurements can briefly report a large gap and
      // emit `onScroll` without any user input. Cancelling here strands the
      // channel above its newest message. The settle hook's wheel, pointer,
      // touch, and key listeners are the authoritative user-interaction gate.
      onAtBottomStateChange?.(distanceFromBottom <= 32);
      if (offset <= 200) {
        // Layout scrolls near the top must not poison the reader's next input.
        armUpwardMomentum(onStartReached?.() ?? false);
      }
    },
    [
      armUpwardMomentum,
      onAtBottomStateChange,
      onStartReached,
      onVirtualizerRangeChanged,
    ],
  );

  return (
    <div className="h-full min-h-0 w-full" ref={hostRef}>
      <PreserveVirtualizedItemVisibilityContext value={isPrepend}>
        <VList
          ref={listRef}
          className="h-full min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain px-2 pt-[var(--channel-top-chrome-height,4.5rem)]"
          data={items}
          item={VirtualizedTimelineItemShell}
          // Supply the same per-item estimate used by content-visibility so
          // Virtua can compensate prepends with the actual page composition.
          itemSize={estimateItemSize}
          bufferSize={offscreenBufferSize}
          keepMounted={retainedIndices}
          style={{ overflowAnchor: "none" }}
          shift={isPrepend}
          onScroll={handleScroll}
          onScrollEnd={handleScrollEnd}
        >
          {(item) => {
            if (item.kind === "bottom-spacer") {
              return (
                <div
                  aria-hidden
                  className="h-0"
                  key={virtualizedItemKey(item)}
                />
              );
            }
            if (item.kind === "leading-content") {
              return <div key={virtualizedItemKey(item)}>{item.content}</div>;
            }
            if (item.kind === "day-divider") {
              const dayLabel = formatDayHeading(item.headingTimestamp);
              return (
                <div
                  // The sticky pill needs travel room, but its containing block
                  // is this item wrapper. The trailing spacer extends the content
                  // box by 4rem while the matching negative margin keeps the
                  // measured layout height at exactly the divider's height, so
                  // row spacing and Virtua's size cache are unaffected. Both the
                  // spacer and the pill are pointer-events-none, and the later
                  // (absolutely positioned) row siblings paint above the spacer.
                  className="relative -mb-16 flex flex-col before:absolute before:inset-x-0 before:top-4 before:h-px before:bg-border/35 before:content-['']"
                  data-day-label={dayLabel}
                  data-testid="message-timeline-day-group"
                  key={virtualizedItemKey(item)}
                >
                  <DayDivider label={dayLabel} />
                  <div aria-hidden className="pointer-events-none h-16" />
                </div>
              );
            }
            return (
              <TimelineRowShell
                item={item.item}
                key={virtualizedItemKey(item)}
                useContentVisibility={false}
              >
                {renderItem(item.item)}
              </TimelineRowShell>
            );
          }}
        </VList>
      </PreserveVirtualizedItemVisibilityContext>
    </div>
  );
}

function TimelineRowShell({
  children,
  item,
  useContentVisibility = true,
}: {
  children: React.ReactNode;
  item: TimelineNonDayItem;
  useContentVisibility?: boolean;
}) {
  return (
    <div
      className={cn(useContentVisibility && "timeline-row-cv")}
      data-timeline-item-key={getTimelineItemKey(item)}
      style={useContentVisibility ? timelineRowReserveStyle(item) : undefined}
    >
      {children}
    </div>
  );
}

function SystemRow({
  currentPubkey,
  entries,
  entry,
  footer,
  onToggleReaction,
  profiles,
  ownerProfiles,
}: {
  currentPubkey?: string;
  entries?: MainTimelineEntry[];
  entry?: MainTimelineEntry;
  footer: React.ReactNode;
  onToggleReaction?: TimelineMessageListProps["onToggleReaction"];
  profiles?: UserProfileLookup;
  ownerProfiles?: UserProfileLookup;
}) {
  const systemEntries = entries ?? (entry ? [entry] : []);
  const firstEntry = systemEntries[0];
  const groupedMessages = React.useMemo(
    () => entries?.map((systemEntry) => systemEntry.message),
    [entries],
  );
  if (!firstEntry) return null;

  return (
    <div className="flex flex-col gap-1 pb-2.5">
      <SystemMessageRow
        groupedMessages={groupedMessages}
        message={firstEntry.message}
        currentPubkey={currentPubkey}
        onToggleReaction={onToggleReaction}
        profiles={profiles}
        ownerProfiles={ownerProfiles}
      />
      {footer}
    </div>
  );
}

type MessageRowItemProps = Pick<
  TimelineMessageListProps,
  | "channelId"
  | "currentPubkey"
  | "followThreadById"
  | "highlightedMessageId"
  | "huddleMemberPubkeys"
  | "huddleMemberPubkeysPending"
  | "isAdmin"
  | "isFollowingThreadById"
  | "onDelete"
  | "onEdit"
  | "onMarkUnread"
  | "onMarkRead"
  | "onPin"
  | "onUnpin"
  | "pinnedMessageIds"
  | "onReply"
  | "onOpenThread"
  | "onToggleReaction"
  | "profiles"
  | "readReceipts"
  | "searchActiveMessageId"
  | "searchMatchingMessageIds"
  | "searchQuery"
  | "threadUnreadCounts"
  | "unfollowThreadById"
> & {
  entry: MainTimelineEntry;
  footer: React.ReactNode;
  isContinuation?: boolean;
  isFollowedByContinuation?: boolean;
  isUnread?: boolean;
  playEntrance?: boolean;
  onEntranceComplete?: (messageId: string) => void;
  videoReviewContext: ReturnType<typeof buildVideoReviewContextForMessage>;
};

function MessageRowItem({
  channelId,
  currentPubkey,
  entry,
  followThreadById,
  footer,
  highlightedMessageId,
  huddleMemberPubkeys,
  huddleMemberPubkeysPending,
  isAdmin,
  isContinuation = false,
  isFollowedByContinuation = false,
  isFollowingThreadById,
  isUnread,
  pinnedMessageIds,
  playEntrance = false,
  onEntranceComplete,
  onDelete,
  onEdit,
  onMarkUnread,
  onMarkRead,
  onPin,
  onUnpin,
  onReply,
  onOpenThread,
  onToggleReaction,
  profiles,
  readReceipts,
  searchActiveMessageId,
  searchMatchingMessageIds,
  searchQuery,
  threadUnreadCounts,
  unfollowThreadById,
  videoReviewContext,
}: MessageRowItemProps) {
  const { message, summary } = entry;
  const canManage = canManageMessageForCurrentUser(
    message,
    currentPubkey,
    profiles,
  );
  const canDelete = canManage && onDelete ? onDelete : undefined;
  const canEdit = canManage && onEdit ? onEdit : undefined;

  if (summary && onOpenThread) {
    const isHighlighted = message.id === highlightedMessageId;
    return (
      <div
        className={cn(
          "group/message relative mx-1 mb-1 flex flex-col gap-0 rounded-2xl px-0 py-1 transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
          isHighlighted &&
            "-mx-4 px-4 before:absolute before:-inset-y-1.5 before:inset-x-0 before:animate-[route-target-highlight-fade_2s_ease-out_forwards] before:bg-primary/10 before:content-[''] motion-reduce:before:animate-none sm:-mx-6 sm:px-6",
        )}
      >
        <MessageRow
          channelId={channelId}
          highlighted={false}
          hoverBackground={false}
          huddleMemberPubkeys={huddleMemberPubkeys}
          huddleMemberPubkeysPending={huddleMemberPubkeysPending}
          isAdmin={isAdmin}
          isFollowingThread={
            isFollowingThreadById
              ? isFollowingThreadById(message.id)
              : undefined
          }
          isPinned={pinnedMessageIds?.has(message.id)}
          isUnread={isUnread}
          isContinuation={isContinuation}
          playEntrance={playEntrance}
          onEntranceComplete={onEntranceComplete}
          message={message}
          onDelete={canDelete}
          onEdit={canEdit}
          onFollowThread={
            followThreadById ? () => followThreadById(message.id) : undefined
          }
          onMarkRead={onMarkRead}
          onMarkUnread={onMarkUnread}
          onPin={onPin ? () => onPin(message) : undefined}
          onUnpin={onUnpin ? () => onUnpin(message.id) : undefined}
          onToggleReaction={onToggleReaction}
          onReply={onReply}
          onOpenThread={onOpenThread}
          onUnfollowThread={
            unfollowThreadById
              ? () => unfollowThreadById(message.id)
              : undefined
          }
          profiles={profiles}
          readReceipts={readReceipts}
          showDepthGuides={false}
          videoReviewContext={videoReviewContext}
        />
        <MessageThreadSummaryRow
          depth={message.depth}
          message={message}
          onOpenThread={onOpenThread}
          showDepthGuides={false}
          summary={summary}
          summaryIndentOffsetRem={-THREAD_REPLY_ROW_MARGIN_INLINE_REM}
          unreadCount={threadUnreadCounts?.get(message.id)}
        />
        {footer}
      </div>
    );
  }

  const isSearchMatch = searchMatchingMessageIds?.has(message.id) ?? false;
  const isSearchActive = message.id === searchActiveMessageId;

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isFollowedByContinuation ? "pb-0" : "pb-2.5",
      )}
    >
      <MessageRow
        channelId={channelId}
        highlighted={message.id === highlightedMessageId || isSearchActive}
        huddleMemberPubkeys={huddleMemberPubkeys}
        huddleMemberPubkeysPending={huddleMemberPubkeysPending}
        isAdmin={isAdmin}
        isContinuation={isContinuation}
        isPinned={pinnedMessageIds?.has(message.id)}
        isUnread={isUnread}
        playEntrance={playEntrance}
        onEntranceComplete={onEntranceComplete}
        message={message}
        onDelete={canDelete}
        onEdit={canEdit}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
        onPin={onPin ? () => onPin(message) : undefined}
        onUnpin={onUnpin ? () => onUnpin(message.id) : undefined}
        onToggleReaction={onToggleReaction}
        onReply={onReply}
        onOpenThread={onOpenThread}
        profiles={profiles}
        readReceipts={readReceipts}
        searchQuery={isSearchMatch ? searchQuery : undefined}
        showDepthGuides={false}
        videoReviewContext={videoReviewContext}
      />
      {footer}
    </div>
  );
}
