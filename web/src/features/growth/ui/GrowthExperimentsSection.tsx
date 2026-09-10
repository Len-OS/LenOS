import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  approveGrowthExperimentLearning,
  createGrowthExperiment,
  getGrowthExperiments,
  growthCompanyStorageKey,
  updateGrowthExperiment,
  type GrowthExperiment,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";

function label(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function GrowthExperimentsSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [metric, setMetric] = useState("");
  const [taskIds, setTaskIds] = useState("");
  const [objective, setObjective] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [confidence, setConfidence] = useState("");
  const [cost, setCost] = useState("");
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const [observedResult, setObservedResult] = useState("");
  const [learning, setLearning] = useState("");
  const [decision, setDecision] = useState<"scale" | "iterate" | "stop">(
    "scale",
  );
  const [error, setError] = useState<string | null>(null);
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";
  const companyId = workspaceSlug
    ? localStorage.getItem(growthCompanyStorageKey(workspaceSlug))
    : null;
  useEffect(() => {
    getCurrentPubkey()
      .then(setActorPubkey)
      .catch(() => {});
  }, []);
  const envelope = {
    correlationId: `growth-experiments:${workspaceSlug}`,
    idempotencyKey: `growth-experiments-read:${workspaceSlug}`,
    workspaceSlug,
    relayCommunityId: communityId ?? "",
    actorPubkey: actorPubkey ?? "",
    companyId,
  };
  const experiments = useQuery({
    queryKey: ["growth", "experiments", workspaceSlug, companyId],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthExperiments(companyId as string, undefined, { envelope }),
  });
  if (!companyId)
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock Experiments.
      </div>
    );
  const submit = async () => {
    if (!title.trim() || !hypothesis.trim() || !metric.trim()) return;
    setError(null);
    try {
      await createGrowthExperiment(
        companyId,
        {
          title: title.trim(),
          hypothesis: hypothesis.trim(),
          metric: metric.trim(),
          taskIds: taskIds
            .split(/[\s,]+/)
            .map((id) => id.trim())
            .filter(Boolean),
          ...(objective.trim() ? { objective: objective.trim() } : {}),
          ...(expectedImpact.trim()
            ? { expectedImpact: expectedImpact.trim() }
            : {}),
          ...(confidence ? { confidence: Number(confidence) / 100 } : {}),
          ...(cost.trim() ? { cost: cost.trim() } : {}),
        },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-experiment-create:${companyId}`,
            idempotencyKey: `growth-experiment-create:${companyId}:${title.trim().slice(0, 32)}`,
          },
        },
      );
      setTitle("");
      setHypothesis("");
      setMetric("");
      setTaskIds("");
      setObjective("");
      setExpectedImpact("");
      setConfidence("");
      setCost("");
      await experiments.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Experiment could not be created.",
      );
    }
  };
  const transition = async (
    experiment: GrowthExperiment,
    next: "active" | "concluded",
    conclusion?: {
      observedResult: string;
      decision: "scale" | "iterate" | "stop";
      learning?: string;
    },
  ) => {
    const id = String(experiment._id ?? "");
    if (!id) return;
    setError(null);
    try {
      await updateGrowthExperiment(
        companyId,
        id,
        next === "concluded"
          ? {
              status: next,
              observedResult: conclusion?.observedResult,
              decision: conclusion?.decision,
              ...(conclusion?.learning
                ? { learning: conclusion.learning }
                : {}),
            }
          : { status: next },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-experiment-transition:${id}`,
            idempotencyKey: `growth-experiment-transition:${id}:${next}`,
          },
        },
      );
      if (selectedExperimentId === id) {
        setSelectedExperimentId(null);
        setObservedResult("");
        setLearning("");
      }
      await experiments.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Experiment update failed.",
      );
    }
  };
  const approveLearning = async (experiment: GrowthExperiment) => {
    const id = String(experiment._id ?? "");
    if (!id) return;
    setError(null);
    try {
      await approveGrowthExperimentLearning(companyId, id, {
        envelope: {
          ...envelope,
          correlationId: `growth-experiment-learning-approve:${id}`,
          idempotencyKey: `growth-experiment-learning-approve:${id}`,
        },
      });
      await experiments.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Learning approval failed.",
      );
    }
  };
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        Growth OS
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
        Experiments
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Turn a hypothesis into an observable decision. Scores are inputs, not
        truth.
      </p>
      <div className="mt-5 rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h2 className="text-sm font-medium text-black dark:text-white">
          Propose an experiment
        </h2>
        <p className="mt-2 text-xs text-black/50 dark:text-white/50">
          Priority inputs stay visible so the team can compare impact,
          confidence, and cost without treating a score as truth.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            aria-label="Experiment title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Experiment objective"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Objective (optional)"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Expected impact"
            value={expectedImpact}
            onChange={(event) => setExpectedImpact(event.target.value)}
            placeholder="Expected impact (optional)"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Confidence percentage"
            type="number"
            min="0"
            max="100"
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
            placeholder="Confidence % (optional)"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Experiment cost"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="Cost (optional)"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Experiment hypothesis"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="Hypothesis"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Experiment metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="Metric"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
          <input
            aria-label="Linked task IDs"
            value={taskIds}
            onChange={(event) => setTaskIds(event.target.value)}
            placeholder="Linked task IDs (optional)"
            className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
          />
        </div>
        <Button
          type="button"
          className="mt-3"
          onClick={() => void submit()}
          disabled={!title.trim() || !hypothesis.trim() || !metric.trim()}
        >
          Add experiment
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      )}
      <div className="mt-5 space-y-3">
        {experiments.isPending ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Loading experiments…
          </p>
        ) : experiments.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <span>Experiments could not be loaded.</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void experiments.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          (experiments.data?.items ?? []).map((experiment) => (
            <article
              key={String(experiment._id)}
              className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-medium text-black dark:text-white">
                  {label(experiment.title, "Untitled experiment")}
                </h2>
                <span className="rounded-full bg-black/[0.06] px-2 py-1 text-xs capitalize dark:bg-white/10">
                  {label(experiment.status, "backlog")}
                </span>
              </div>
              <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                {label(experiment.hypothesis, "No hypothesis recorded")}
              </p>
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                Metric: {label(experiment.metric, "Not specified")}
              </p>
              {Array.isArray(experiment.taskIds) &&
                experiment.taskIds.length > 0 && (
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Linked tasks: {experiment.taskIds.map(String).join(", ")}
                  </p>
                )}
              {Boolean(
                experiment.objective ||
                  experiment.expectedImpact ||
                  experiment.confidence != null ||
                  experiment.cost,
              ) && (
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  Priority inputs:{" "}
                  {label(experiment.expectedImpact, "impact not set")} ·
                  confidence{" "}
                  {experiment.confidence == null
                    ? "not set"
                    : `${Math.round(Number(experiment.confidence) * 100)}%`}{" "}
                  · {label(experiment.cost, "cost not set")}
                </p>
              )}
              {experiment.status === "concluded" && experiment.learning && (
                <div className="mt-2 rounded-md border border-indigo-500/30 bg-indigo-50/40 p-2 text-sm dark:bg-indigo-950/20">
                  <p className="text-black/70 dark:text-white/70">
                    Learning: {experiment.learning}
                  </p>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Approval:{" "}
                    {label(experiment.learningApprovalStatus, "pending")}
                  </p>
                  {experiment.learningApprovalStatus !== "approved" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2"
                      onClick={() => void approveLearning(experiment)}
                    >
                      Approve learning
                    </Button>
                  )}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {experiment.status === "backlog" && (
                  <Button
                    type="button"
                    onClick={() => void transition(experiment, "active")}
                  >
                    Start
                  </Button>
                )}
                {experiment.status === "active" && (
                  <div className="mt-1 w-full space-y-2">
                    {selectedExperimentId === String(experiment._id) && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <textarea
                          aria-label={`Observed result for ${label(experiment.title, "experiment")}`}
                          value={observedResult}
                          onChange={(event) =>
                            setObservedResult(event.target.value)
                          }
                          placeholder="Observed result and supporting evidence"
                          rows={3}
                          className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
                        />
                        <textarea
                          aria-label={`Learning for ${label(experiment.title, "experiment")}`}
                          value={learning}
                          onChange={(event) => setLearning(event.target.value)}
                          placeholder="Learning to approve and reuse later (optional)"
                          rows={3}
                          className="rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
                        />
                        <select
                          aria-label="Experiment decision"
                          value={decision}
                          onChange={(event) =>
                            setDecision(
                              event.target.value as
                                | "scale"
                                | "iterate"
                                | "stop",
                            )
                          }
                          className="h-10 rounded-md border border-black/10 bg-transparent px-2 text-sm dark:border-white/10"
                        >
                          <option value="scale">Scale</option>
                          <option value="iterate">Iterate</option>
                          <option value="stop">Stop</option>
                        </select>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (selectedExperimentId === String(experiment._id)) {
                            setSelectedExperimentId(null);
                            setObservedResult("");
                            setLearning("");
                          } else {
                            setSelectedExperimentId(String(experiment._id));
                            setObservedResult("");
                            setLearning("");
                            setDecision("scale");
                          }
                        }}
                      >
                        {selectedExperimentId === String(experiment._id)
                          ? "Cancel decision"
                          : "Record decision"}
                      </Button>
                      {selectedExperimentId === String(experiment._id) && (
                        <Button
                          type="button"
                          disabled={!observedResult.trim()}
                          onClick={() =>
                            void transition(experiment, "concluded", {
                              observedResult: observedResult.trim(),
                              decision,
                              ...(learning.trim()
                                ? { learning: learning.trim() }
                                : {}),
                            })
                          }
                        >
                          Conclude experiment
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void transition(experiment, "concluded")}
                      >
                        Insufficient evidence
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
