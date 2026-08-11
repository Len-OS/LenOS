import { useEffect, useState } from "react";
import {
  X,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Webhook,
} from "lucide-react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { Separator } from "@/shared/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { KIND_WORKFLOW_RUN, type Workflow } from "../useWorkflows";
import { WorkflowRunTrace } from "./WorkflowRunTrace";
import {
  WorkflowApprovalCard,
  type PendingApproval,
} from "./WorkflowApprovalCard";
import { WebhookSecretDialog } from "./WebhookSecretDialog";

interface WorkflowRun {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  triggeredBy: string;
  createdAt: number;
  completedAt?: number;
  requiresApproval: boolean;
  approvalPrompt?: string;
}

function useWorkflowRuns(workflowEventId: string): WorkflowRun[] {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const collected: WorkflowRun[] = [];

    const unsub = client.subscribe({
      id: `wf-runs-${workflowEventId}`,
      filter: {
        kinds: [KIND_WORKFLOW_RUN],
        "#e": [workflowEventId],
        limit: 20,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const status =
          (tags.find((t) => t[0] === "status")?.[1] as WorkflowRun["status"]) ??
          "completed";
        const requiresApproval =
          tags.find((t) => t[0] === "approval")?.[1] === "required";
        const approvalPrompt = tags.find(
          (t) => t[0] === "approval_prompt",
        )?.[1];

        collected.push({
          id: raw.id as string,
          status,
          triggeredBy: raw.pubkey as string,
          createdAt: raw.created_at as number,
          completedAt: tags.find((t) => t[0] === "completed_at")
            ? Number(tags.find((t) => t[0] === "completed_at")![1])
            : undefined,
          requiresApproval,
          approvalPrompt,
        });
        setRuns([...collected].sort((a, b) => b.createdAt - a.createdAt));
      },
    });

    return unsub;
  }, [workflowEventId]);

  return runs;
}

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

const STATUS_COLOR = {
  pending: "text-yellow-500",
  running: "text-blue-500 animate-spin",
  completed: "text-green-500",
  failed: "text-red-500",
} as const;

function relativeTime(unix: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unix;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface Props {
  workflow: Workflow;
  onClose: () => void;
}

export function WorkflowDetailPanel({ workflow, onClose }: Props) {
  const runs = useWorkflowRuns(workflow.eventId);
  const [tab, setTab] = useState("runs");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [resolvedApprovals, setResolvedApprovals] = useState<Set<string>>(
    new Set(),
  );
  const [webhookOpen, setWebhookOpen] = useState(false);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const pendingApprovals: PendingApproval[] = runs
    .filter(
      (r) =>
        r.requiresApproval &&
        r.status === "pending" &&
        !resolvedApprovals.has(r.id),
    )
    .map((r) => ({
      runId: r.id,
      workflowName: workflow.name,
      triggeredBy: r.triggeredBy,
      createdAt: r.createdAt,
      prompt: r.approvalPrompt,
    }));

  const handleApprovalResolved = (runId: string) => {
    setResolvedApprovals((prev) => new Set([...prev, runId]));
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
          <span className="text-sm font-semibold text-black dark:text-white">
            {workflow.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {workflow.trigger === "webhook" && (
            <button
              type="button"
              onClick={() => setWebhookOpen(true)}
              aria-label="Webhook settings"
              className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Webhook className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        {workflow.description && (
          <p className="text-sm text-black/60 dark:text-white/60">
            {workflow.description}
          </p>
        )}
        {workflow.trigger && (
          <p className="mt-2 text-xs text-black/30 dark:text-white/30">
            Trigger: <span className="font-mono">{workflow.trigger}</span>
          </p>
        )}
      </div>

      {pendingApprovals.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2 px-4 py-3">
            {pendingApprovals.map((a) => (
              <WorkflowApprovalCard
                key={a.runId}
                approval={a}
                onResolved={handleApprovalResolved}
              />
            ))}
          </div>
        </>
      )}

      <Separator />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          if (v === "runs") setSelectedRunId(null);
        }}
        className="flex-1 overflow-hidden px-4 pt-3"
      >
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="steps" disabled={!selectedRunId}>
            Trace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="flex-1 overflow-auto">
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-black/30 dark:text-white/30">
              No runs yet
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const Icon = STATUS_ICON[run.status];
                const isSelected = run.id === selectedRunId;
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setSelectedRunId(run.id);
                      setTab("steps");
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-black/20 bg-black/5 dark:border-white/20 dark:bg-white/5"
                        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${STATUS_COLOR[run.status]}`} />
                      <span className="text-xs font-medium capitalize text-black/70 dark:text-white/70">
                        {run.status}
                      </span>
                      <span className="ml-auto text-[11px] text-black/30 dark:text-white/30">
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-black/40 dark:text-white/40">
                      {run.id.slice(0, 16)}…
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="steps" className="flex-1 overflow-auto">
          {selectedRun ? (
            <WorkflowRunTrace
              runId={selectedRun.id}
              runCreatedAt={selectedRun.createdAt}
            />
          ) : (
            <p className="py-8 text-center text-sm text-black/30 dark:text-white/30">
              Select a run to view its trace.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {webhookOpen && (
        <WebhookSecretDialog
          workflowId={workflow.eventId}
          workflowName={workflow.name}
          onClose={() => setWebhookOpen(false)}
        />
      )}
    </div>
  );
}
