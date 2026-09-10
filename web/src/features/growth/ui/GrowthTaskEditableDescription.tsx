import { Button } from "@/shared/ui/button";

type Props = {
  editing: boolean;
  title: string;
  description: string;
  objective: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onObjective: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  taskDescription: string | null;
};

export function GrowthTaskEditableDescription({
  editing,
  title,
  description,
  objective,
  onTitle,
  onDescription,
  onObjective,
  onSave,
  onCancel,
  taskDescription,
}: Props) {
  if (!editing)
    return (
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-black/70 dark:text-white/70">
        {taskDescription ?? "No description provided."}
      </p>
    );
  return (
    <div className="mt-4 space-y-2">
      <input
        aria-label="Task title"
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        className="w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20"
      />
      <textarea
        aria-label="Task description"
        value={description}
        onChange={(event) => onDescription(event.target.value)}
        className="min-h-24 w-full rounded-md border border-black/10 bg-white/70 p-2 text-sm dark:border-white/10 dark:bg-black/20"
      />
      <input
        aria-label="Task objective"
        value={objective}
        onChange={(event) => onObjective(event.target.value)}
        placeholder="Objective"
        className="w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onSave}
          disabled={!title.trim() || !description.trim()}
        >
          Save edits
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
