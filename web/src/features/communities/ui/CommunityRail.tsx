import { useState } from "react";
import { Plus, Compass } from "lucide-react";
import { useWorkspace } from "@/shared/lib/workspace-context";
import { Avatar } from "@/shared/ui/Avatar";

export function CommunityRail() {
  const workspace = useWorkspace();
  const [hovered, setHovered] = useState<string | null>(null);

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <div className="flex h-full w-14 flex-col items-center gap-2 border-r border-black/10 bg-black/[0.02] py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div
        className="relative"
        onMouseEnter={() => setHovered("current")}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/10 transition-all hover:rounded-xl dark:bg-white/10">
          <Avatar name={workspaceName} size={40} />
        </div>
        {hovered === "current" && (
          <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-black">
            {workspaceName}
          </div>
        )}
      </div>

      <div className="my-1 h-px w-6 bg-black/10 dark:bg-white/10" />

      <div
        className="relative"
        onMouseEnter={() => setHovered("discover")}
        onMouseLeave={() => setHovered(null)}
      >
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black/40 transition-all hover:rounded-xl hover:bg-black/10 hover:text-black dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Compass className="h-5 w-5" />
        </button>
        {hovered === "discover" && (
          <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-black">
            Discover workspaces
          </div>
        )}
      </div>

      <div
        className="relative"
        onMouseEnter={() => setHovered("add")}
        onMouseLeave={() => setHovered(null)}
      >
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black/40 transition-all hover:rounded-xl hover:bg-green-500/10 hover:text-green-600 dark:bg-white/5 dark:text-white/40 dark:hover:bg-green-500/10 dark:hover:text-green-400"
        >
          <Plus className="h-5 w-5" />
        </button>
        {hovered === "add" && (
          <div className="absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-black">
            Add workspace
          </div>
        )}
      </div>
    </div>
  );
}
