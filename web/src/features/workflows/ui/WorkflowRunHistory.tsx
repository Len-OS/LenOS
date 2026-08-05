import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { relativeTime } from "@/shared/lib/relative-time";
import { KIND_WORKFLOW_RUN } from "../useWorkflows";

interface RunEvent {
  id: string;
  createdAt: number;
  pubkey: string;
}

interface Props {
  workflowId: string;
}

export function WorkflowRunHistory({ workflowId }: Props) {
  const [runs, setRuns] = useState<RunEvent[]>([]);

  useEffect(() => {
    if (!workflowId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `workflow-runs-${workflowId}`,
      filter: { kinds: [KIND_WORKFLOW_RUN], "#e": [workflowId], limit: 20 },
      onEvent: (raw) => {
        const run: RunEvent = {
          id: raw.id as string,
          createdAt: raw.created_at as number,
          pubkey: raw.pubkey as string,
        };
        setRuns((prev) => {
          if (prev.some((r) => r.id === run.id)) return prev;
          return [run, ...prev]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 10);
        });
      },
    });

    return () => {
      unsub();
      setRuns([]);
    };
  }, [workflowId]);

  if (runs.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-black/40 dark:text-white/40">
        Recent runs
      </p>
      <div className="space-y-1">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
            <span>{relativeTime(run.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
