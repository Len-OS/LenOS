import { useState } from "react";
import { X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_FORUM_COMMENT, KIND_FORUM_POST } from "@/shared/constants/kinds";

interface Props {
  channelId: string;
  onClose: () => void;
  isReply?: boolean;
  parentEventId?: string;
}

export function ForumComposer({ channelId, onClose, isReply, parentEventId }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!body.trim()) return;
    if (!isReply && !title.trim()) return;
    setSending(true);
    setError("");
    try {
      const tags: string[][] = [["h", channelId]];
      if (!isReply) {
        tags.push(["subject", title.trim()]);
      } else if (parentEventId) {
        tags.push(["e", parentEventId]);
      }
      const kind = isReply ? KIND_FORUM_COMMENT : KIND_FORUM_POST;
      const signed = await signNostrEvent({ kind, content: body.trim(), tags }, { requireNip07: true });
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    }
    setSending(false);
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-black dark:text-white">
          {isReply ? "Write a reply" : "New post"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-0.5 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isReply && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="mb-3 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none placeholder:text-black/30 focus:border-black/30 dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
        />
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isReply ? "Write a reply…" : "What's on your mind?"}
        rows={isReply ? 3 : 6}
        className="mb-3 w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none placeholder:text-black/30 focus:border-black/30 dark:border-white/10 dark:text-white dark:placeholder:text-white/30 dark:focus:border-white/30"
      />

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-xs text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || (!isReply && !title.trim()) || !body.trim()}
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {sending ? "Posting…" : isReply ? "Reply" : "Post"}
        </button>
      </div>
    </div>
  );
}
