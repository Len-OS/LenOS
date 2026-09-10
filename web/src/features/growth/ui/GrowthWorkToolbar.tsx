import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { WorkFilter, WorkView } from "./growth-work-utils";

type Props = {
  filter: WorkFilter;
  view: WorkView;
  onFilter: (filter: WorkFilter) => void;
  onView: (view: WorkView) => void;
  onRefresh: () => void;
};

export function GrowthWorkToolbar({
  filter,
  view,
  onFilter,
  onView,
  onRefresh,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
            Growth OS
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
            Work
          </h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Recommendations, execution, approvals, and observed outcomes.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onRefresh}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      <div
        className="mt-5 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Work filters"
      >
        {(["all", "active", "attention", "completed"] as WorkFilter[]).map(
          (value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => onFilter(value)}
              className={`rounded-full px-3 py-1.5 text-xs capitalize ${filter === value ? "bg-indigo-600 text-white" : "bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/60"}`}
            >
              {value}
            </button>
          ),
        )}
      </div>
      <fieldset className="mt-4 flex gap-2">
        <legend className="sr-only">Work layout</legend>
        {(["list", "board"] as WorkView[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => onView(value)}
            className={`rounded-md px-3 py-1.5 text-xs capitalize ${view === value ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/60"}`}
          >
            {value}
          </button>
        ))}
      </fieldset>
    </>
  );
}
