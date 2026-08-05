import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useChannelMutations } from "@/features/channels/useChannelMutations";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  channelDescription: string;
}

export function ChannelSettingsModal({
  isOpen,
  onClose,
  channelId,
  channelName,
  channelDescription,
}: Props) {
  const [name, setName] = useState(channelName);
  const [description, setDescription] = useState(channelDescription);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const { editChannel, deleteChannel } = useChannelMutations();

  useEffect(() => {
    if (isOpen) {
      setName(channelName);
      setDescription(channelDescription);
      setConfirmDelete(false);
      setError("");
    }
  }, [isOpen, channelName, channelDescription]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isOpen) return null;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await editChannel(channelId, name.trim(), description.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
    setSaving(false);
  };

  const doDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteChannel(channelId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
    setDeleting(false);
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
        aria-label="Channel settings"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black dark:text-white">
            Channel settings
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
              htmlFor="cs-name"
              className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Channel name
            </label>
            <input
              id="cs-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            />
          </div>

          <div>
            <label
              htmlFor="cs-desc"
              className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Description
            </label>
            <input
              id="cs-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              onClick={() => void save()}
              disabled={saving || !name.trim()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="border-t border-red-200 pt-4 dark:border-red-900/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">
              Danger zone
            </p>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Delete channel
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-red-600 dark:text-red-400">
                  Are you sure?
                </p>
                <button
                  type="button"
                  onClick={() => void doDelete()}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-black/15 px-3 py-1.5 text-sm text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
