import { useEffect, useRef } from "react";
import type { Message } from "@/features/messages/use-messages";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import { KIND_SYSTEM_MESSAGE } from "@/shared/constants/kinds";

interface Props {
  messages: Message[];
  isLoading: boolean;
  channelName: string;
}

const GROUP_GAP_SECONDS = 300;

export function MessageTimeline({ messages, isLoading, channelName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
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

        const prev = messages[i - 1];
        const isGrouped =
          prev &&
          prev.pubkey === msg.pubkey &&
          prev.kind !== KIND_SYSTEM_MESSAGE &&
          msg.createdAt - prev.createdAt < GROUP_GAP_SECONDS;

        return (
          <div key={msg.id} className={isGrouped ? "pl-0" : "mt-4"}>
            {!isGrouped && (
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-black dark:text-white">
                  {truncatePubkey(msg.pubkey)}
                </span>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {relativeTime(msg.createdAt)}
                </span>
              </div>
            )}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-black/90 dark:text-white/85">
              {msg.content}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
