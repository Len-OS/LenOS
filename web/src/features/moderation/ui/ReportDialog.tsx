import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useModerationActions } from "@/features/moderation/useModerationActions";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "off-topic", label: "Off-topic" },
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetEventId: string;
  targetPubkey: string;
}

export function ReportDialog({
  isOpen,
  onClose,
  targetEventId,
  targetPubkey,
}: Props) {
  const [reason, setReason] = useState<string>(REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { reportEvent } = useModerationActions();

  useEffect(() => {
    if (!isOpen) {
      setReason(REASONS[0].value);
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
    setSubmitting(true);
    setError("");
    try {
      await reportEvent(targetEventId, targetPubkey, reason);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit report.");
    }
    setSubmitting(false);
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
        aria-label="Report message"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black dark:text-white">
            Report message
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
              htmlFor="report-reason"
              className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
            >
              Why are you reporting this?
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
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
              disabled={submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
