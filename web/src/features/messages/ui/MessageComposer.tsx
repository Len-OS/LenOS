import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import {
  signNostrEvent,
  Nip07UnavailableError,
  hasNip07Provider,
} from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_STREAM_MESSAGE } from "@/shared/constants/kinds";

interface Props {
  channelId: string;
  channelName: string;
}

export function MessageComposer({ channelId, channelName }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_STREAM_MESSAGE,
          content: trimmed,
          tags: [["h", channelId]],
        },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      setText("");
      textareaRef.current?.focus();
    } catch (err) {
      if (err instanceof Nip07UnavailableError) {
        setError(
          "Install a Nostr browser extension (Alby or nos2x) to send messages.",
        );
      } else {
        setError("Failed to send. Try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      <div className="flex items-end gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 focus-within:border-black/30 dark:border-white/15 dark:bg-white/5 dark:focus-within:border-white/30">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message #${channelName}`}
          disabled={sending}
          className="flex-1 resize-none bg-transparent text-sm text-black outline-none placeholder:text-black/40 disabled:opacity-50 dark:text-white dark:placeholder:text-white/40"
          style={{ maxHeight: "200px", overflowY: "auto" }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-md p-1.5 text-black/60 hover:bg-black/5 hover:text-black disabled:opacity-30 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {!hasNip07Provider() && (
        <p className="mt-1 text-xs text-black/40 dark:text-white/40">
          Read-only mode — install{" "}
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Alby
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/fiatjaf/nos2x"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            nos2x
          </a>{" "}
          to send messages
        </p>
      )}
    </div>
  );
}
