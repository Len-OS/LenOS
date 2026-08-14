import { useEffect, useRef, useState } from "react";
import type { Message } from "@/features/messages/use-messages";
import type { Reaction } from "@/features/messages/use-reactions";
import {
  KIND_SYSTEM_MESSAGE,
  KIND_HUDDLE_STARTED,
} from "@/shared/constants/kinds";
import { MessageRow } from "@/features/messages/ui/MessageRow";
import { MessageThreadSummaryRow } from "@/features/messages/ui/MessageThreadSummaryRow";
import { HuddleAttachment } from "@/features/huddle/ui/HuddleAttachment";
import type { ReadReceipt } from "@/features/messages/read-receipts/types";

interface Props {
  messages: Message[];
  isLoading: boolean;
  channelName: string;
  channelId: string;
  reactions: Reaction[];
  currentPubkey: string | null;
  onOpenThread: (messageId: string) => void;
  customEmoji?: Map<string, string>;
  onSave?: (msgId: string) => void;
  onBookmark?: (msgId: string) => void;
  isAdmin?: boolean;
  pinnedMessageIds?: Set<string>;
  onPin?: (msg: Message) => void;
  onUnpin?: (eventId: string) => void;
  readReceipts?: Map<string, ReadReceipt>;
  onAtBottomChange?: (isAtBottom: boolean) => void;
}

const GROUP_GAP_SECONDS = 300;

export function MessageTimeline({
  messages,
  isLoading,
  channelName,
  channelId,
  reactions,
  currentPubkey,
  onOpenThread,
  customEmoji,
  onSave,
  onBookmark,
  isAdmin,
  pinnedMessageIds,
  onPin,
  onUnpin,
  readReceipts,
  onAtBottomChange,
}: Props) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!onAtBottomChange || !scrollEl || !bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => onAtBottomChange(entry.isIntersecting),
      { root: scrollEl, threshold: 0 },
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [onAtBottomChange, scrollEl]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-2xl space-y-3 px-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-1">
              <div className="h-4 w-32 rounded bg-black/10 dark:bg-white/10" />
              <div className="h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-black dark:text-white">
            # {channelName}
          </p>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            No messages yet. Be the first to say something.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setScrollEl}
      className="flex flex-1 flex-col overflow-y-auto px-6 py-4"
    >
      {messages.map((msg, i) => {
        if (msg.kind === KIND_SYSTEM_MESSAGE) {
          return (
            <div
              key={msg.id}
              className="my-1 text-center text-xs text-black/40 dark:text-white/30"
            >
              {msg.content}
            </div>
          );
        }

        if (msg.kind === KIND_HUDDLE_STARTED) {
          return (
            <HuddleAttachment
              key={msg.id}
              channelId={channelId}
              startedEventContent={msg.content}
              startedEventTags={msg.tags}
              startedAt={msg.createdAt}
              startedEventId={msg.id}
              startedEventPubkey={msg.pubkey}
            />
          );
        }

        const prev = messages[i - 1];
        const isGrouped =
          !!prev &&
          prev.pubkey === msg.pubkey &&
          prev.kind !== KIND_SYSTEM_MESSAGE &&
          msg.createdAt - prev.createdAt < GROUP_GAP_SECONDS;

        return (
          <div key={msg.id}>
            <MessageRow
              msg={msg}
              isGrouped={isGrouped}
              channelId={channelId}
              reactions={reactions}
              currentPubkey={currentPubkey}
              customEmoji={customEmoji}
              onOpenThread={onOpenThread}
              onSave={onSave ? () => onSave(msg.id) : undefined}
              onBookmark={onBookmark ? () => onBookmark(msg.id) : undefined}
              isAdmin={isAdmin}
              pinnedMessageIds={pinnedMessageIds}
              onPin={onPin}
              onUnpin={onUnpin}
              readReceipts={readReceipts}
            />
            {!isGrouped && (
              <MessageThreadSummaryRow
                messageId={msg.id}
                channelId={channelId}
                onOpenThread={() => onOpenThread(msg.id)}
              />
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
