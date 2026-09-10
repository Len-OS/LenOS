import { Button } from "@/shared/ui/button";
import type { GrowthTask } from "@/features/growth/api/growth-api";

type WorkView = "list" | "board";
type Props = {
  items: GrowthTask[];
  view: WorkView;
  onSelect: (id: string) => void;
  total: number;
  limit: number;
  skip: number;
  onPrevious: () => void;
  onNext: () => void;
};
const ACTIVE = ["active", "pending", "queue", "queued"];
const ATTENTION = ["blocked", "approval_required", "needs_approval", "failed"];
function status(task: GrowthTask): string {
  return String(task.status ?? "unknown").toLowerCase();
}
function title(task: GrowthTask): string {
  return typeof task.title === "string" && task.title.trim()
    ? task.title
    : "Untitled growth task";
}
function keyFor(task: GrowthTask, index: number): string {
  return String(task._id ?? task.id ?? index);
}

export function GrowthWorkTaskList({
  items,
  view,
  onSelect,
  total,
  limit,
  skip,
  onPrevious,
  onNext,
}: Props) {
  return (
    <>
      {view === "board" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["queued", "Queued", ["pending", "queue", "queued"]],
            ["active", "Active", ACTIVE],
            ["attention", "Attention", ATTENTION],
          ].map(([key, label, statuses]) => {
            const columnItems = items.filter((task) =>
              (statuses as string[]).includes(status(task)),
            );
            return (
              <section
                key={String(key)}
                aria-label={`${label} work`}
                className="min-h-40 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]"
              >
                <h2 className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
                  {label}{" "}
                  <span className="font-normal">({columnItems.length})</span>
                </h2>
                <div className="mt-2 space-y-2">
                  {columnItems.map((task, index) => (
                    <button
                      key={keyFor(task, index)}
                      type="button"
                      onClick={() => onSelect(keyFor(task, index))}
                      className="w-full rounded-lg border border-black/10 bg-white/80 p-3 text-left hover:border-indigo-300 dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <span className="block truncate text-sm font-medium text-black dark:text-white">
                        {title(task)}
                      </span>
                      <span className="mt-1 block truncate text-xs text-black/50 dark:text-white/50">
                        {typeof task.objective === "string"
                          ? task.objective
                          : "No objective recorded"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((task, index) => (
            <button
              key={keyFor(task, index)}
              type="button"
              onClick={() => onSelect(keyFor(task, index))}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/70 p-4 text-left hover:border-indigo-300 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-black dark:text-white">
                  {title(task)}
                </span>
                <span className="mt-1 block truncate text-xs text-black/50 dark:text-white/50">
                  {typeof task.objective === "string"
                    ? task.objective
                    : typeof task.description === "string"
                      ? task.description
                      : "No objective recorded"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-1 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
                {status(task)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-black/60 dark:text-white/60">
        <span>
          {total === 0
            ? "No tasks"
            : `Showing ${skip + 1}–${Math.min(skip + limit, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onPrevious}
            disabled={skip <= 0}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onNext}
            disabled={skip + items.length >= total}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
