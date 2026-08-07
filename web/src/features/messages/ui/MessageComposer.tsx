import { useState, useRef, useEffect } from "react";
import { Send, Smile } from "lucide-react";
import {
  signNostrEvent,
  Nip07UnavailableError,
  hasNip07Provider,
} from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_STREAM_MESSAGE } from "@/shared/constants/kinds";
import { RichComposer } from "@/features/messages/ui/RichComposer";
import { EmojiPicker } from "@/features/emoji/ui/EmojiPicker";
import { useEmojiAutocomplete } from "@/features/emoji/useEmojiAutocomplete";
import { useMembers } from "@/features/channels/useMembers";
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

const SLASH_COMMANDS = [
  { name: "me", description: "Send an action message" },
  { name: "shrug", description: "Append ¯\\_(ツ)_/¯" },
  { name: "giphy", description: "Search for a GIF" },
  { name: "remind", description: "Set a reminder for yourself" },
];

interface MentionItemProps {
  pubkey: string;
  onSelect: (pubkey: string, name: string) => void;
}

function MentionItem({ pubkey, onSelect }: MentionItemProps) {
  const profile = useProfile(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(pubkey, name);
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
    >
      <span className="font-medium">@{name}</span>
    </button>
  );
}

interface Props {
  channelId: string;
  channelName: string;
  onTyping?: () => void;
  customEmoji?: Map<string, string>;
}

export function MessageComposer({
  channelId,
  channelName,
  onTyping,
  customEmoji = new Map(),
}: Props) {
  const [pendingText, setPendingText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearCount, setClearCount] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef<((text: string) => void) | null>(null);
  const pendingTextRef = useRef(pendingText);
  pendingTextRef.current = pendingText;

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);

  const members = useMembers(channelId);
  const emojiSuggestions = useEmojiAutocomplete(emojiQuery ?? "", customEmoji);

  const filteredMembers =
    mentionQuery !== null
      ? members.filter((m) => {
          const q = mentionQuery.toLowerCase();
          return m.pubkey.toLowerCase().includes(q);
        })
      : [];

  const filteredSlash =
    slashQuery !== null
      ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashQuery))
      : [];

  useEffect(() => {
    if (!emojiOpen) return;
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [emojiOpen]);

  function handleTextChange(text: string) {
    setPendingText(text);
    if (text) onTyping?.();
    const lastWord = text.split(/\s/).pop() ?? "";
    if (lastWord.startsWith("/") && text.trim() === lastWord) {
      setSlashQuery(lastWord.slice(1));
      setMentionQuery(null);
      setEmojiQuery(null);
    } else if (lastWord.startsWith("@")) {
      setMentionQuery(lastWord.slice(1).toLowerCase());
      setSlashQuery(null);
      setEmojiQuery(null);
    } else if (
      lastWord.startsWith(":") &&
      lastWord.length > 1 &&
      !lastWord.endsWith(":")
    ) {
      setEmojiQuery(lastWord.slice(1));
      setSlashQuery(null);
      setMentionQuery(null);
    } else {
      setSlashQuery(null);
      setMentionQuery(null);
      setEmojiQuery(null);
    }
  }

  function handleEmojiSelect(shortcode: string) {
    const isNative =
      [...shortcode].length === 1 ||
      (shortcode.length <= 2 && shortcode.charCodeAt(0) > 127);
    const insert = isNative ? shortcode : `:${shortcode}: `;
    if (emojiQuery !== null) {
      insertRef.current?.(insert);
    } else {
      insertRef.current?.(insert);
    }
    setEmojiOpen(false);
    setEmojiQuery(null);
  }

  function handleSlashSelect(name: string) {
    insertRef.current?.(`/${name} `);
    setSlashQuery(null);
  }

  function handleMentionSelect(_pubkey: string, name: string) {
    insertRef.current?.(`@${name} `);
    setMentionQuery(null);
  }

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setSlashQuery(null);
    setMentionQuery(null);
    setEmojiQuery(null);

    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_STREAM_MESSAGE,
          content: trimmed,
          tags: [["h", channelId]],
        },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      setClearCount((c) => c + 1);
      setPendingText("");
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

  const showSlash = slashQuery !== null && filteredSlash.length > 0;
  const showMention = mentionQuery !== null && filteredMembers.length > 0;
  const showEmojiAc = emojiQuery !== null && emojiSuggestions.length > 0;

  return (
    <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {showSlash && (
        <div className="mb-1 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
          {filteredSlash.map((cmd) => (
            <button
              key={cmd.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSlashSelect(cmd.name);
              }}
              className="flex w-full items-center gap-3 px-3 py-1.5 text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
            >
              <span className="font-medium text-black dark:text-white">
                /{cmd.name}
              </span>
              <span className="text-black/40 dark:text-white/40">
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}
      {showMention && (
        <div className="mb-1 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
          {filteredMembers.map((m) => (
            <MentionItem
              key={m.pubkey}
              pubkey={m.pubkey}
              onSelect={handleMentionSelect}
            />
          ))}
        </div>
      )}
      {showEmojiAc && (
        <div className="mb-1 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
          {emojiSuggestions.map((s) => (
            <button
              key={s.shortcode}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleEmojiSelect(s.shortcode);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-black/80 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/5"
            >
              {s.native ? (
                <span className="text-lg">{s.native}</span>
              ) : s.url ? (
                <img
                  src={s.url}
                  alt={s.shortcode}
                  className="h-5 w-5 object-contain"
                />
              ) : null}
              <span>:{s.shortcode}:</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 focus-within:border-black/30 dark:border-white/15 dark:bg-white/5 dark:focus-within:border-white/30">
        <RichComposer
          placeholder={`Message #${channelName}`}
          disabled={sending}
          onSubmit={(text) => void send(text)}
          onTextChange={handleTextChange}
          clearSignal={clearCount}
          insertRef={insertRef}
        />
        <div className="relative shrink-0" ref={emojiRef}>
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Insert emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-8 right-0 z-50">
              <EmojiPicker
                customEmoji={customEmoji}
                onSelect={handleEmojiSelect}
              />
            </div>
          )}
        </div>
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
