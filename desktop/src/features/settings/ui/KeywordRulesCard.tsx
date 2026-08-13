import { useState } from "react";
import { X } from "lucide-react";
import { useKeywordRules } from "@/features/notifications/lib/useKeywordRules";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SettingsOptionGroup, SettingsOptionRow } from "./SettingsOptionGroup";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

export function KeywordRulesCard({
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

  return (
    <section className="min-w-0" data-testid="settings-keyword-rules">
      <SettingsSectionHeader
        title="Keyword Notifications"
        description="Always notify when a message contains one of these words. Use /pattern/ for regex."
      />

      <div className="flex flex-col gap-4">
        <SettingsOptionGroup>
          <SettingsOptionRow>
            <Input
              className="flex-1"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add keyword or /regex/…"
              value={input}
            />
            <Input
              className="w-40"
              disabled={disabled}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="Channel ID (optional)"
              value={channelInput}
            />
            <Button
              disabled={disabled || !input.trim()}
              onClick={() => void handleAdd()}
              size="sm"
              type="button"
            >
              Add
            </Button>
          </SettingsOptionRow>
        </SettingsOptionGroup>

        {keywords.length > 0 && (
          <SettingsOptionGroup>
            {keywords.map((rule) => (
              <SettingsOptionRow
                key={`${rule.keyword}:${rule.channelId ?? ""}`}
              >
                <span className="text-sm">{rule.keyword}</span>
                {rule.channelId && (
                  <span className="text-xs text-muted-foreground">
                    #{rule.channelId}
                  </span>
                )}
                <button
                  aria-label={`Remove ${rule.keyword}`}
                  className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  disabled={busy}
                  onClick={() => void handleRemove(rule.keyword)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </SettingsOptionRow>
            ))}
          </SettingsOptionGroup>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <SettingsSectionHeader
          title="Muted Words"
          description="Suppress notifications when message contains these words."
        />

        <SettingsOptionGroup>
          <SettingsOptionRow>
            <Input
              className="flex-1"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddMuted();
              }}
              onChange={(e) => setMutedInput(e.target.value)}
              placeholder="Add muted word…"
              value={mutedInput}
            />
            <Button
              disabled={disabled || !mutedInput.trim()}
              onClick={() => void handleAddMuted()}
              size="sm"
              type="button"
            >
              Add
            </Button>
          </SettingsOptionRow>
        </SettingsOptionGroup>

        {mutedKeywords.length > 0 && (
          <SettingsOptionGroup>
            {mutedKeywords.map((mk) => (
              <SettingsOptionRow key={mk}>
                <span className="text-sm">{mk}</span>
                <button
                  aria-label={`Remove ${mk}`}
                  className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  disabled={busy}
                  onClick={() => void handleRemoveMuted(mk)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </SettingsOptionRow>
            ))}
          </SettingsOptionGroup>
        )}
      </div>

      {error !== null && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
