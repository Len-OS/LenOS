import { useState } from "react";
import { useChannelTemplates } from "@/features/channels/hooks/useChannelTemplates";

export function ChannelTemplatesSettingsCard() {
  const { templates, addTemplate, removeTemplate } = useChannelTemplates();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    setError(null);
    try {
      await addTemplate({
        name: trimmedName,
        description: description.trim(),
        defaultTopic: "",
        isPrivate,
      });
      setName("");
      setDescription("");
      setIsPrivate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeTemplate(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove template.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Channel Templates
      </p>
      <p className="mb-5 text-xs text-black/50 dark:text-white/50">
        Save reusable channel configurations and apply them when creating new
        channels.
      </p>

      <form onSubmit={handleAdd} className="mb-5 space-y-2">
        <input
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-1 focus:ring-black/30 dark:border-white/15 dark:text-white dark:placeholder:text-white/40 dark:focus:ring-white/30"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <input
          className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-1 focus:ring-black/30 dark:border-white/15 dark:text-white dark:placeholder:text-white/40 dark:focus:ring-white/30"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-black/70 dark:text-white/70">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            disabled={busy}
            className="rounded"
          />
          Private by default
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {busy ? "Saving…" : "Add Template"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40">
          No templates yet. Create one to save a reusable channel configuration.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-black dark:text-white">
                  {t.name}
                </div>
                {t.description && (
                  <div className="mt-0.5 truncate text-xs text-black/50 dark:text-white/50">
                    {t.description}
                  </div>
                )}
                {t.isPrivate && (
                  <div className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                    Private
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(t.id)}
                disabled={busy}
                className="ml-4 shrink-0 text-xs text-red-500 hover:underline disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
