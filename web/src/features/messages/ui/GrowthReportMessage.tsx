import { useState } from "react";
import type { Message } from "@/features/messages/use-messages";

interface GrowthReportPayload {
  report_type: "weekly" | "monthly";
  generated_at: number;
  highlights: string[];
  opportunities: string[];
  metrics_snapshot: Record<string, unknown>;
}

function parsePayload(content: string): GrowthReportPayload | null {
  try {
    return JSON.parse(content) as GrowthReportPayload;
  } catch {
    return null;
  }
}

function formatDate(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  msg: Message;
}

export function GrowthReportMessage({ msg }: Props) {
  const [expanded, setExpanded] = useState(false);
  const payload = parsePayload(msg.content);

  if (!payload) {
    return (
      <div className="my-2 rounded-lg border border-black/10 px-4 py-3 text-sm text-black/50 dark:border-white/10 dark:text-white/40">
        Growth report (unreadable payload)
      </div>
    );
  }

  const label =
    payload.report_type === "weekly" ? "Weekly Report" : "Monthly Report";
  const top3 = payload.opportunities.slice(0, 3);

  return (
    <div className="my-2 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {label}
          </span>
          <span className="text-xs text-black/40 dark:text-white/30">
            {formatDate(payload.generated_at)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-indigo-500 hover:underline"
        >
          {expanded ? "Collapse" : "View full report"}
        </button>
      </div>

      {payload.highlights.length > 0 && (
        <ul className="mt-2 space-y-1">
          {payload.highlights.map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, no reorder
            <li key={i} className="text-sm text-black/80 dark:text-white/70">
              • {h}
            </li>
          ))}
        </ul>
      )}

      {top3.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/40">
            Top Opportunities
          </p>
          <ul className="mt-1 space-y-0.5">
            {top3.map((op, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list, no reorder
              <li key={i} className="text-sm text-black/70 dark:text-white/60">
                {i + 1}. {op}
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && Object.keys(payload.metrics_snapshot).length > 0 && (
        <div className="mt-3 rounded bg-black/[0.04] p-3 dark:bg-white/[0.04]">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/40">
            Metrics Snapshot
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {Object.entries(payload.metrics_snapshot).map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-black/40 dark:text-white/30">{k}: </span>
                <span className="text-black/70 dark:text-white/60">
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
