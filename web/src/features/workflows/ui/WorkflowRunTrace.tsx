import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { relativeTime } from "@/shared/lib/relative-time";

export const KIND_WORKFLOW_STEP = 9092;

type StepStatus = "pending" | "running" | "completed" | "failed";

interface WorkflowStep {
  id: string;
  name: string;
  status: StepStatus;
  createdAt: number;
  durationMs?: number;
  output?: string;
}

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
} as const;

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: "text-yellow-500",
  running: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
};

function useRunSteps(runId: string): WorkflowStep[] {
  const [steps, setSteps] = useState<Map<string, WorkflowStep>>(new Map());

  useEffect(() => {
    if (!runId) return;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `wf-trace-${runId}`,
      filter: {
        kinds: [KIND_WORKFLOW_STEP],
        "#e": [runId],
        limit: 100,
      },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const name = tags.find((t) => t[0] === "step")?.[1] ?? "Step";
        const status =
          (tags.find((t) => t[0] === "status")?.[1] as StepStatus) ??
          "completed";
        const durationRaw = tags.find((t) => t[0] === "duration_ms")?.[1];
        const output = tags.find((t) => t[0] === "output")?.[1];

        const step: WorkflowStep = {
          id: raw.id as string,
          name,
          status,
          createdAt: raw.created_at as number,
          durationMs: durationRaw ? Number(durationRaw) : undefined,
          output,
        };

        setSteps((prev) => {
          const next = new Map(prev);
          next.set(step.id, step);
          return next;
        });
      },
    });

    return () => {
      unsub();
      setSteps(new Map());
    };
  }, [runId]);

  return Array.from(steps.values()).sort((a, b) => a.createdAt - b.createdAt);
}

interface StepRowProps {
  step: WorkflowStep;
}

function StepRow({ step }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STATUS_ICON[step.status];
  const colorClass = STATUS_COLOR[step.status];

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => step.output && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${colorClass} ${
            step.status === "running" ? "animate-spin" : ""
          }`}
        />
        <span className="flex-1 truncate text-xs font-medium text-black dark:text-white">
          {step.name}
        </span>
        {step.durationMs !== undefined && (
          <span className="shrink-0 text-[11px] text-black/30 dark:text-white/30">
            {step.durationMs < 1000
              ? `${step.durationMs}ms`
              : `${(step.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {step.output ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-black/30 dark:text-white/30" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-black/30 dark:text-white/30" />
          )
        ) : null}
      </button>
      {expanded && step.output && (
        <div className="border-t border-black/10 px-3 py-2 dark:border-white/10">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-black/60 dark:text-white/60">
            {step.output}
          </pre>
        </div>
      )}
    </div>
  );
}

interface Props {
  runId: string;
  runCreatedAt: number;
}

export function WorkflowRunTrace({ runId, runCreatedAt }: Props) {
  const steps = useRunSteps(runId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
          Run trace
        </p>
        <span className="text-[11px] text-black/30 dark:text-white/30">
          {relativeTime(runCreatedAt)}
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-black/30 dark:text-white/30">
            No steps recorded for this run.
          </p>
          <p className="mt-1 text-xs text-black/20 dark:text-white/20">
            Steps appear here as the workflow executes.
          </p>
        </div>
      ) : (
        <div className="relative space-y-1.5 pl-4 before:absolute before:left-[5px] before:top-0 before:h-full before:w-px before:bg-black/10 before:dark:bg-white/10">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
