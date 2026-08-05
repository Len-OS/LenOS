import { useState } from "react";
import { X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_USER_STATUS } from "@/shared/constants/kinds";

const QUICK_EMOJIS = [
  "😊",
  "🎯",
  "🔥",
  "💡",
  "🚀",
  "😴",
  "🎉",
  "🤔",
  "☕",
  "🏖️",
  "🏃",
  "🎵",
];

const EXPIRY_OPTIONS = [
  { label: "30 min", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "4 hours", seconds: 4 * 60 * 60 },
  { label: "Until cleared", seconds: 0 },
] as const;

interface Props {
  currentPubkey: string;
  onClose: () => void;
}

export function StatusPicker({ onClose }: Props) {
  const [emoji, setEmoji] = useState("😊");
  const [text, setText] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const content = text.trim() ? `${emoji} ${text.trim()}` : emoji;
      const tags: string[][] = [["d", "general"]];
      if (expiry > 0) {
        const expiresAt = Math.floor(Date.now() / 1000) + expiry;
        tags.push(["expiration", String(expiresAt)]);
      }
      const signed = await signNostrEvent(
        { kind: KIND_USER_STATUS, content, tags },
        { requireNip07: false },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set status.");
    }
    setSaving(false);
  };

  const clear = async () => {
    setSaving(true);
    try {
      const signed = await signNostrEvent(
        { kind: KIND_USER_STATUS, content: "", tags: [["d", "general"]] },
        { requireNip07: false },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onClose();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="w-64 rounded-xl border border-black/10 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-black dark:text-white">
          Set status
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

      <div className="mb-3 grid grid-cols-6 gap-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={`rounded p-1 text-lg leading-none ${emoji === e ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-black/15 px-2 py-1.5 dark:border-white/15">
        <span className="text-lg leading-none">{emoji}</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's your status?"
          maxLength={60}
          className="flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/30"
        />
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-xs text-black/50 dark:text-white/50">
          Clear after
        </p>
        <div className="flex flex-wrap gap-1">
          {EXPIRY_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setExpiry(o.seconds)}
              className={`rounded px-2 py-1 text-xs ${expiry === o.seconds ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/15 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void clear()}
          disabled={saving}
          className="flex-1 rounded-lg border border-black/15 py-1.5 text-xs text-black/60 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-lg bg-black py-1.5 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
