import { useState } from "react";
import { X } from "lucide-react";
import { useKeywordRules } from "@/features/notifications/lib/useKeywordRules";

export function KeywordRulesSection({
  currentPubkey,
}: {
  currentPubkey: string | null;
}) {
  const {
    keywords,
    mutedKeywords,
    addKeyword,
    removeKeyword,
    addMutedKeyword,
    removeMutedKeyword,
  } = useKeywordRules(currentPubkey);

  const [input, setInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [mutedInput, setMutedInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await addKeyword(trimmed, channelInput.trim() || undefined);
      setInput("");
      setChannelInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save keyword.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (word: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeKeyword(word);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove keyword.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddMuted = async () => {
    const trimmed = mutedInput.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await addMutedKeyword(trimmed);
      setMutedInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save muted word.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMuted = async (mk: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeMutedKeyword(mk);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove muted word.");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || currentPubkey === null;
  const inputBase =
    "flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none disabled:opacity-40 dark:border-white/15 dark:text-white dark:placeholder:text-white/30";
  const btnBase =
    "rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80";

  return (
    <div className="max-w-lg space-y-6">
      {/* Keyword Notifications */}
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-black dark:text-white">
            Keyword Notifications
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            Always notify when a message contains one of these words. Use
            /pattern/ for regex.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            disabled={disabled}
            placeholder="Add keyword or /regex/…"
            className={inputBase}
          />
          <input
            type="text"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            disabled={disabled}
            placeholder="Channel ID (optional)"
            className="w-40 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black placeholder:text-black/30 focus:outline-none disabled:opacity-40 dark:border-white/15 dark:text-white dark:placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={disabled || !input.trim()}
            onClick={() => void handleAdd()}
            className={btnBase}
          >
            Add
          </button>
        </div>

        {keywords.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-black/15 dark:border-white/15">
            {keywords.map((rule, i) => (
              <div
                key={`${rule.keyword}:${rule.channelId ?? ""}`}
                className={`flex items-center justify-between px-4 py-2.5 ${
                  i < keywords.length - 1
                    ? "border-b border-black/10 dark:border-white/10"
                    : ""
                }`}
              >
                <span className="text-sm text-black dark:text-white">
                  {rule.keyword}
                </span>
                {rule.channelId && (
                  <span className="mx-2 text-xs text-black/40 dark:text-white/40">
                    #{rule.channelId}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${rule.keyword}`}
                  disabled={busy}
                  onClick={() => void handleRemove(rule.keyword)}
                  className="rounded p-1 text-black/30 hover:text-black disabled:opacity-40 dark:text-white/30 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Muted Words */}
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-black dark:text-white">
            Muted Words
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            Suppress notifications when message contains these words.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={mutedInput}
            onChange={(e) => setMutedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddMuted();
            }}
            disabled={disabled}
            placeholder="Add muted word…"
            className={inputBase}
          />
          <button
            type="button"
            disabled={disabled || !mutedInput.trim()}
            onClick={() => void handleAddMuted()}
            className={btnBase}
          >
            Add
          </button>
        </div>

        {mutedKeywords.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-black/15 dark:border-white/15">
            {mutedKeywords.map((mk, i) => (
              <div
                key={mk}
                className={`flex items-center justify-between px-4 py-2.5 ${
                  i < mutedKeywords.length - 1
                    ? "border-b border-black/10 dark:border-white/10"
                    : ""
                }`}
              >
                <span className="text-sm text-black dark:text-white">{mk}</span>
                <button
                  type="button"
                  aria-label={`Remove ${mk}`}
                  disabled={busy}
                  onClick={() => void handleRemoveMuted(mk)}
                  className="rounded p-1 text-black/30 hover:text-black disabled:opacity-40 dark:text-white/30 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error !== null && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
