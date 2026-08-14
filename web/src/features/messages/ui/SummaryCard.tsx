interface Props {
  summary: string;
  onDismiss: () => void;
}

export function SummaryCard({ summary, onDismiss }: Props) {
  return (
    <div className="mx-4 mb-3 rounded-lg border border-black/10 bg-black/5 p-3 text-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
          AI Summary
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          Dismiss
        </button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-black/80 dark:text-white/80">
        {summary}
      </p>
    </div>
  );
}
