import { useState } from "react";
import { Compass, Plus, X } from "lucide-react";
import { Avatar } from "@/shared/ui/Avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useWorkspace } from "@/shared/lib/workspace-context";

function WorkspaceJoinModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");

  const join = () => {
    if (!url.trim()) return;
    const cleaned = url.replace(/^https?:\/\//, "").replace(/\/.*/, "");
    window.location.href = `https://${cleaned}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Join workspace"
        className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-black dark:text-white">
            Join a workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-black/60 dark:text-white/60">
          Enter a workspace URL to navigate to it.
        </p>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="workspace.lenos.app"
          // biome-ignore lint/a11y/noAutofocus: intentional focus on modal open
          autoFocus
          className="mb-4 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-black/15 px-4 py-2 text-sm text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={join}
            disabled={!url.trim()}
            className="flex-1 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceSwitcher() {
  const workspace = useWorkspace();
  const [joinOpen, setJoinOpen] = useState(false);

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-10 w-10 cursor-default items-center justify-center rounded-2xl bg-black/10 ring-2 ring-black/20 transition-all hover:rounded-xl dark:bg-white/10 dark:ring-white/20">
              <Avatar name={workspaceName} size={40} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{workspaceName}</TooltipContent>
        </Tooltip>

        <div className="h-px w-6 bg-black/10 dark:bg-white/10" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Discover workspaces"
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black/40 transition-all hover:rounded-xl hover:bg-black/10 hover:text-black dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Compass className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Discover workspaces</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Add workspace"
              onClick={() => setJoinOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/5 text-black/40 transition-all hover:rounded-xl hover:bg-green-500/10 hover:text-green-600 dark:bg-white/5 dark:text-white/40 dark:hover:bg-green-500/10 dark:hover:text-green-400"
            >
              <Plus className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add workspace</TooltipContent>
        </Tooltip>
      </div>

      {joinOpen && <WorkspaceJoinModal onClose={() => setJoinOpen(false)} />}
    </>
  );
}
