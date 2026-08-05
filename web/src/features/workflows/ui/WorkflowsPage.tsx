import { Zap } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useWorkflows } from "../useWorkflows";
import { WorkflowCard } from "./WorkflowCard";

export function WorkflowsPage() {
  const communityId = useCommunityId();
  const workflows = useWorkflows(communityId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          Workflows
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Zap className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No workflows yet
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Workflows automate tasks in your workspace.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                communityId={communityId ?? ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
