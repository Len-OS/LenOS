import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useChannelMutations } from "@/features/channels/useChannelMutations";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communityId?: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

export function CreateChannelModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { createChannel } = useChannelMutations();

  useEffect(() => {
    if (!idEdited) setId(slugify(name));
  }, [name, idEdited]);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setId("");
      setIdEdited(false);
      setDescription("");
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!name.trim() || !id.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createChannel(
        id.trim(),
        name.trim(),
        description.trim(),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create channel.");
    }
    setSaving(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss, role=presentation
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={() => {}}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create channel"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black dark:text-white">
            Create channel
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="cc-name"
              className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Channel name
            </label>
            <input
              id="cc-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="general"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            />
          </div>

          <div>
            <label
              htmlFor="cc-id"
              className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Channel ID
            </label>
            <input
              id="cc-id"
              type="text"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setIdEdited(true);
              }}
              placeholder="general"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            />
            <p className="mt-1 text-xs text-black/40 dark:text-white/40">
              Used in URLs. Cannot be changed later.
            </p>
          </div>

          <div>
            <label
              htmlFor="cc-desc"
              className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Description (optional)
            </label>
            <input
              id="cc-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-black/15 px-4 py-2 text-sm text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !name.trim() || !id.trim()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              {saving ? "Creating…" : "Create channel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
