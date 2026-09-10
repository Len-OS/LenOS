import { AlertCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";

type Props = { kind: "intake" | "loading" | "error"; onRetry?: () => void };
export function GrowthWorkStatus({ kind, onRetry }: Props) {
  if (kind === "intake")
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock Work.
      </div>
    );
  if (kind === "loading")
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Loading growth work…
      </div>
    );
  return (
    <div className="m-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Work could not be loaded. Check your connection and permissions.
      </span>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
