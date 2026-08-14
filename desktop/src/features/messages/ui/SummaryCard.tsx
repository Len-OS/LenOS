import { Button } from "@/shared/ui/button";

interface Props {
  summary: string;
  onDismiss: () => void;
}

export function SummaryCard({ summary, onDismiss }: Props) {
  return (
    <div className="mx-3 mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Summary
        </span>
        <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-foreground/80">{summary}</p>
    </div>
  );
}
