import { useEffect, useRef } from "react";
import type { Message } from "@/features/messages/use-messages";
import { KIND_SYSTEM_MESSAGE } from "@/shared/constants/kinds";
import { MessageRow } from "@/features/messages/ui/MessageRow";

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
          !!prev &&
          prev.pubkey === msg.pubkey &&
          prev.kind !== KIND_SYSTEM_MESSAGE &&
          msg.createdAt - prev.createdAt < GROUP_GAP_SECONDS;

        return <MessageRow key={msg.id} msg={msg} isGrouped={isGrouped} />;
      })}
      <div ref={bottomRef} />
    </div>
  );
}
