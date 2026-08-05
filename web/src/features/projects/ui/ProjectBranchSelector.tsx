import { GitBranch } from "lucide-react";
import type { RepoRefs } from "@/features/repos/use-repo-refs";

interface Props {
  refs: RepoRefs | undefined;
  currentRef: string;
  onSelectRef: (ref: string) => void;
}

export function ProjectBranchSelector({
  refs,
  currentRef,
  onSelectRef,
}: Props) {
  const branches = refs?.branches ?? [];
  if (branches.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <GitBranch className="h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
      <select
        value={currentRef}
        onChange={(e) => onSelectRef(e.target.value)}
        aria-label="Select branch"
        className="rounded-md border border-black/10 bg-white px-2 py-1 text-sm text-black focus-visible:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
      >
        {branches.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
    </div>
  );
}
