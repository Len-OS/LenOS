// web/src/shared/ui/DesktopRequiredCard.tsx
import { Monitor } from "lucide-react";

interface Props {
  /** Short label: what the user was trying to do. e.g. "Local agent execution" */
  feature: string;
  /** One sentence explaining what the desktop app enables for this feature. */
  description?: string;
}

export function DesktopRequiredCard({ feature, description }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mt-0.5 shrink-0 rounded-lg bg-black/5 p-2 dark:bg-white/5">
        <Monitor className="h-5 w-5 text-black/50 dark:text-white/50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-black dark:text-white">
          {feature} requires the LenOS desktop app
        </p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">
            {description}
          </p>
        )}
        <a
          href="https://lengrowth.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Download LenOS desktop
        </a>
      </div>
    </div>
  );
}
