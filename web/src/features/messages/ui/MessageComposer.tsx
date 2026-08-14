import { useState, useRef, useEffect } from "react";
import { Clock, Send, Smile } from "lucide-react";
import {
  signNostrEvent,
  Nip07UnavailableError,
} from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import {
  KIND_SCHEDULED_MESSAGE,
  KIND_STREAM_MESSAGE,
} from "@/shared/constants/kinds";
import {
  SLASH_COMMANDS,
  type CommandContext,
} from "@/shared/lib/slashCommandRegistry";
import { useSlashCommands } from "@/features/messages/hooks/useSlashCommands";
import { SlashCommandPalette } from "@/features/messages/ui/SlashCommandPalette";
import { RichComposer } from "@/features/messages/ui/RichComposer";
import { EmojiPicker } from "@/features/emoji/ui/EmojiPicker";
import { useEmojiAutocomplete } from "@/features/emoji/useEmojiAutocomplete";
import { useMembers } from "@/features/channels/useMembers";
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef<((text: string) => void) | null>(null);
  const pendingTextRef = useRef(pendingText);
  pendingTextRef.current = pendingText;

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);

  const slashHook = useSlashCommands(pendingText, 0);
  // Keep a ref so stable keydown handler can always read the latest hook values
  const slashHookRef = useRef(slashHook);
  slashHookRef.current = slashHook;

  const members = useMembers(channelId);
  const emojiSuggestions = useEmojiAutocomplete(emojiQuery ?? "", customEmoji);

  const filteredMembers =
    mentionQuery !== null
      ? members.filter((m) => {
          const q = mentionQuery.toLowerCase();
          return m.pubkey.toLowerCase().includes(q);
        })
      : [];

  // Keyboard navigation for the slash command palette
  useEffect(() => {
    if (!slashHook.active || slashHook.filtered.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!slashHookRef.current.active) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        slashHookRef.current.moveUp();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        slashHookRef.current.moveDown();
      } else if (e.key === "Escape") {
        slashHookRef.current.dismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [slashHook.active, slashHook.filtered.length]);

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

  useEffect(() => {
    if (!scheduleOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        scheduleRef.current &&
        !scheduleRef.current.contains(e.target as Node)
      ) {
        setScheduleOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [scheduleOpen]);

  const handleSchedule = async () => {
    const trimmed = pendingTextRef.current.trim();
    if (!trimmed) {
      setError("Cannot schedule an empty message.");
      return;
    }
    if (!scheduledAt) {
      setError("Please pick a date and time.");
      return;
    }
    const dt = new Date(scheduledAt);
    if (dt.getTime() <= Date.now()) {
      setError("Scheduled time must be in the future.");
      return;
    }
    setScheduling(true);
    setError(null);
    try {
      const notBefore = Math.floor(dt.getTime() / 1000);
      const dTag = `scheduled-${crypto.randomUUID()}`;
      const signed = await signNostrEvent(
        {
          kind: KIND_SCHEDULED_MESSAGE,
          content: trimmed,
          tags: [
            ["d", dTag],
            ["h", channelId],
            ["not_before", String(notBefore)],
          ],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      setClearCount((c) => c + 1);
      setPendingText("");
      setScheduleOpen(false);
      setScheduledAt("");
    } catch (err) {
      setError("Failed to schedule message. Try again.");
      console.error("[MessageComposer] schedule failed:", err);
    } finally {
      setScheduling(false);
    }
  };

  function handleTextChange(text: string) {
    setPendingText(text);
    if (text) onTyping?.();
    const lastWord = text.split(/\s/).pop() ?? "";
    // Slash detection is handled by useSlashCommands hook
    if (lastWord.startsWith("@")) {
      setMentionQuery(lastWord.slice(1).toLowerCase());
      setEmojiQuery(null);
    } else if (
      lastWord.startsWith(":") &&
      lastWord.length > 1 &&
      !lastWord.endsWith(":")
    ) {
      setEmojiQuery(lastWord.slice(1));
      setMentionQuery(null);
    } else {
      setMentionQuery(null);
      setEmojiQuery(null);
    }
  }

  function handleEmojiSelect(shortcode: string) {
    const isNative =
      [...shortcode].length === 1 ||
      (shortcode.length <= 2 && shortcode.charCodeAt(0) > 127);
    const insert = isNative ? shortcode : `:${shortcode}: `;
    insertRef.current?.(insert);
    setEmojiOpen(false);
    setEmojiQuery(null);
  }

  function handleSlashCommandSelect(cmd: (typeof slashHook.filtered)[0]) {
    // Clear the editor and insert the chosen command so the user can type args
    setClearCount((c) => c + 1);
    setPendingText("");
    const toInsert = `/${cmd.name} `;
    setTimeout(() => {
      insertRef.current?.(toInsert);
    }, 0);
  }

  function handleMentionSelect(_pubkey: string, name: string) {
    insertRef.current?.(`@${name} `);
    setMentionQuery(null);
  }

  /** Build the CommandContext used by slash-command execute() calls. */
  function buildCommandContext(): CommandContext {
    return {
      channelId,
      publishEvent: async ({ kind, content, tags }) => {
        const signed = await signNostrEvent(
          { kind, content, tags },
          { requireNip07: true },
        );
        await getRelayClient(relayWsUrl()).publishAndWait(
          signed as Record<string, unknown>,
        );
      },
    };
  }

  const send = async (text: string) => {
    // While the palette is active (user is still typing the command name),
    // pressing Enter tab-completes to the highlighted command so the user
    // can type the required args before submitting.
    if (slashHookRef.current.active && slashHookRef.current.filtered.length > 0) {
      const selectedCmd =
        slashHookRef.current.filtered[slashHookRef.current.selectedIdx] ??
        slashHookRef.current.filtered[0];
      if (selectedCmd) {
        handleSlashCommandSelect(selectedCmd);
        return;
      }
    }

    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    setMentionQuery(null);
    setEmojiQuery(null);

    // Detect and execute slash commands — /name [args...]
    const cmdMatch = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (cmdMatch) {
      const cmdName = cmdMatch[1];
      const cmdArgs = cmdMatch[2]?.trim() ?? "";
      const cmd = SLASH_COMMANDS.find((c) => c.name === cmdName);
      if (cmd) {
        try {
          await cmd.execute(cmdArgs, buildCommandContext());
          setClearCount((c) => c + 1);
          setPendingText("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Command failed.");
        } finally {
          setSending(false);
        }
        return;
      }
    }

    // Regular message
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
          "Your workspace connection is still being prepared. Reopen LenOS from LenGrowth and try again.",
        );
      } else {
        setError("Failed to send. Try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const showMention = mentionQuery !== null && filteredMembers.length > 0;
  const showEmojiAc = emojiQuery !== null && emojiSuggestions.length > 0;

  return (
    <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      {slashHook.active && slashHook.filtered.length > 0 && (
        <SlashCommandPalette
          commands={slashHook.filtered}
          selectedIdx={slashHook.selectedIdx}
          onSelect={handleSlashCommandSelect}
        />
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
        <div className="relative shrink-0" ref={scheduleRef}>
          <button
            type="button"
            onClick={() => {
              setScheduleOpen((v) => !v);
              setEmojiOpen(false);
            }}
            className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Schedule message"
          >
            <Clock className="h-4 w-4" />
          </button>
          {scheduleOpen && (
            <div className="absolute bottom-10 right-0 z-50 w-72 rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
              <p className="mb-2 text-xs font-medium text-black/70 dark:text-white/70">
                Schedule message
              </p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mb-2 w-full rounded border border-black/10 bg-transparent px-2 py-1.5 text-sm text-black outline-none focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
              />
              <button
                type="button"
                onClick={() => void handleSchedule()}
                disabled={scheduling || !scheduledAt}
                className="w-full rounded bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
              >
                {scheduling ? "Scheduling…" : "Schedule"}
              </button>
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
    </div>
  );
}
