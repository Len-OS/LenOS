import { useState, useRef } from "react";
import { Send } from "lucide-react";
import {
  signNostrEvent,
  Nip07UnavailableError,
  hasNip07Provider,
} from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_STREAM_MESSAGE } from "@/shared/constants/kinds";
import { RichComposer } from "@/features/messages/ui/RichComposer";

interface Props {
  channelId: string;
  channelName: string;
  onTyping?: () => void;
}

export function MessageComposer({ channelId, channelName, onTyping }: Props) {
  const [pendingText, setPendingText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearCount, setClearCount] = useState(0);
  const pendingTextRef = useRef(pendingText);
  pendingTextRef.current = pendingText;

  const send = async (text: string) => {
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
      setClearCount((c) => c + 1);
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

  return (
    <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      <div className="flex items-end gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 focus-within:border-black/30 dark:border-white/15 dark:bg-white/5 dark:focus-within:border-white/30">
        <RichComposer
          placeholder={`Message #${channelName}`}
          disabled={sending}
          onSubmit={(text) => void send(text)}
          onTextChange={(t) => { setPendingText(t); if (t) onTyping?.(); }}
          clearSignal={clearCount}
        />
        <button
          type="button"
          onClick={() => void send(pendingTextRef.current)}
          disabled={!pendingText.trim() || sending}
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
