import { Button } from "@/shared/ui/button";
import type { GrowthTask } from "@/features/growth/api/growth-api";
import { taskStatus, taskTitle } from "./growth-work-utils";

type Props = { task: GrowthTask; editing: boolean; onEdit: () => void };
export function GrowthTaskHeader({ task, editing, onEdit }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
          Task detail
        </p>
        <h1 className="mt-1 text-xl font-semibold text-black dark:text-white">
          {editing ? "Edit task" : taskTitle(task)}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-black/[0.06] px-2 py-1 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
          {taskStatus(task)}
        </span>
        <Button type="button" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}
