import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useThreadReplies } from "@/features/messages/useThreadReplies";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Message } from "@/features/messages/use-messages";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_FORUM_COMMENT } from "@/shared/constants/kinds";

interface Props {
  rootMessage: Message;
  channelId: string;
  onClose: () => void;
}

function ReplyRow({ msg }: { msg: Message }) {
  const profile = useProfile(msg.pubkey);
  const displayName = profile?.name || truncatePubkey(msg.pubkey);
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Avatar src={profile?.picture} name={displayName} size={28} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-black dark:text-white">
            {displayName}
          </span>
          <span className="text-xs text-black/40 dark:text-white/40">
            {relativeTime(msg.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-black/90 dark:text-white/85">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

function RootRow({ msg }: { msg: Message }) {
  const profile = useProfile(msg.pubkey);
  const displayName = profile?.name || truncatePubkey(msg.pubkey);
  return (
    <div className="flex items-start gap-2.5 border-b border-black/10 pb-3 dark:border-white/10">
      <Avatar src={profile?.picture} name={displayName} size={32} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-black dark:text-white">
            {displayName}
          </span>
          <span className="text-xs text-black/40 dark:text-white/40">
            {relativeTime(msg.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-black/90 dark:text-white/85">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

export function ThreadPanel({ rootMessage, channelId, onClose }: Props) {
  const replies = useThreadReplies(rootMessage.id, channelId);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const sendReply = async () => {
    const trimmed = replyText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_FORUM_COMMENT,
          content: trimmed,
          tags: [
            ["e", rootMessage.id, "", "reply"],
            ["h", channelId],
          ],
        },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      setReplyText("");
    } catch {
      // no NIP-07
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  };

  return (
    <div className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-black/10 dark:border-white/10">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="text-sm font-semibold text-black dark:text-white">
          Thread
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Close thread"
        >
          <X className="h-4 w-4 text-black/60 dark:text-white/60" />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        <RootRow msg={rootMessage} />
        <div className="space-y-0.5 pt-2">
          {replies.map((r) => (
            <ReplyRow key={r.id} msg={r} />
          ))}
          {replies.length === 0 && (
            <p className="py-4 text-center text-xs text-black/40 dark:text-white/40">
              No replies yet
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
        <div className="flex items-end gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 focus-within:border-black/30 dark:border-white/15 dark:bg-white/5 dark:focus-within:border-white/30">
          <textarea
            rows={1}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Reply in thread…"
            disabled={sending}
            className="flex-1 resize-none bg-transparent text-sm text-black outline-none placeholder:text-black/40 disabled:opacity-50 dark:text-white dark:placeholder:text-white/40"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />
        </div>
      </div>
    </div>
  );
}
