import { useThreadReplies } from "@/features/messages/useThreadReplies";
import { relativeTime } from "@/shared/lib/relative-time";

interface Props {
  messageId: string;
  channelId: string;
  onOpenThread: () => void;
}

export function MessageThreadSummaryRow({
  messageId,
  channelId,
  onOpenThread,
}: Props) {
  const replies = useThreadReplies(messageId, channelId);
  if (replies.length === 0) return null;

  const lastReply = replies[replies.length - 1];

  return (
    <button
      type="button"
      onClick={onOpenThread}
      className="ml-[44px] mt-1 flex items-center gap-1.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
    >
      <span className="font-medium">
        {replies.length} {replies.length === 1 ? "reply" : "replies"}
      </span>
      {lastReply && (
        <span className="text-black/40 dark:text-white/40">
          · last reply {relativeTime(lastReply.createdAt)}
        </span>
      )}
    </button>
  );
}
