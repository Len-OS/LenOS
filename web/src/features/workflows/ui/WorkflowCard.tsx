import { useState } from "react";
import { Play, Zap } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_WORKFLOW_RUN, type Workflow } from "../useWorkflows";
import { WorkflowRunHistory } from "./WorkflowRunHistory";

interface Props {
  workflow: Workflow;
  communityId: string;
}

export function WorkflowCard({ workflow, communityId }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_WORKFLOW_RUN,
          content: "",
          tags: [
            ["e", workflow.eventId],
            ["h", communityId],
          ],
        },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run workflow.");
    }
    setRunning(false);
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-black/5 p-2 dark:bg-white/5">
          <Zap className="h-4 w-4 text-black/50 dark:text-white/50" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-black dark:text-white">{workflow.name}</p>
          {workflow.description && (
            <p className="mt-0.5 text-sm text-black/50 dark:text-white/50">
              {workflow.description}
            </p>
          )}
          {workflow.trigger && (
            <p className="mt-1 text-xs text-black/30 dark:text-white/30">
              Trigger: {workflow.trigger}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          aria-label={`Run ${workflow.name}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          <Play className="h-3 w-3" />
          {running ? "Running…" : "Run"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      <WorkflowRunHistory workflowId={workflow.eventId} />
    </div>
  );
}
