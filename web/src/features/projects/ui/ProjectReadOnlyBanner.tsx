import { Monitor } from "lucide-react";

export function ProjectReadOnlyBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.02]">
      <Monitor className="h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
      <span className="text-black/60 dark:text-white/60">
        Full git operations are available in the{" "}
        <strong className="font-medium text-black dark:text-white">
          LenOS desktop app
        </strong>
        .
      </span>
    </div>
  );
}
