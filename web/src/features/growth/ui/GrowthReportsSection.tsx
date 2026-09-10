import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getGrowthCompanyReport,
  growthCompanyStorageKey,
  recordGrowthTelemetry,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";

function value(input: unknown, fallback: string) {
  return typeof input === "string" && input.trim() ? input : fallback;
}

function list(input: unknown): Array<Record<string, unknown>> {
  return Array.isArray(input)
    ? input.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
    : [];
}

export function GrowthReportsSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
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
  const envelope = useMemo(
    () => ({
      correlationId: `growth-reports:${workspaceSlug}`,
      idempotencyKey: `growth-reports-read:${workspaceSlug}`,
      workspaceSlug,
      relayCommunityId: communityId ?? "",
      actorPubkey: actorPubkey ?? "",
      companyId,
    }),
    [actorPubkey, communityId, companyId, workspaceSlug],
  );
  const report = useQuery({
    queryKey: ["growth", "reports", workspaceSlug, companyId],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () => getGrowthCompanyReport(companyId as string, { envelope }),
  });
  useEffect(() => {
    if (!actorPubkey || !companyId) return;
    void recordGrowthTelemetry("growth_report_viewed", {
      envelope,
    }).catch(() => {});
  }, [actorPubkey, companyId, envelope]);
  if (!companyId) {
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock Reports.
      </div>
    );
  }
  const data = report.data ?? {};
  const assessment = (data.assessment ?? {}) as Record<string, unknown>;
  const momentum = (data.executionMomentum ?? {}) as Record<string, unknown>;
  const outcomes = (data.recentOutcomes ?? {}) as Record<string, unknown>;
  const outcomeSummary = (outcomes.summary ?? {}) as Record<string, unknown>;
  const warnings = list(data.warnings);
  const highlights = list(data.priorityHighlights);
  const metricDefinitions = list(data.metricDefinitions);
  const metricComparisons = list(data.metricComparisons);
  const events = list(outcomes.events);
  const completedWork = list(data.completedWork);
  const experiments = list(data.experiments);
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        Growth OS
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
        Reports
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        A permanent, source-aware snapshot of progress, outcomes, and next
        decisions.
      </p>
      {report.isPending ? (
        <p className="mt-5 text-sm text-black/60 dark:text-white/60">
          Loading report…
        </p>
      ) : report.isError ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
          <span>Report could not be loaded.</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void report.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-5 text-xs text-black/50 dark:text-white/50">
            Generated {value(data.generatedAt, "time unavailable")} · LenGrowth
            reporting
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Growth score
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {String(assessment.growthScore ?? "—")}
              </p>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                Assessment input
              </p>
            </article>
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Execution
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {momentum.completionPercentage == null
                  ? "—"
                  : `${String(momentum.completionPercentage)}%`}
              </p>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                Task completion
              </p>
            </article>
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Observed outcomes
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {String(outcomeSummary.totalCount ?? 0)}
              </p>
              <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                Recorded, not assumed causal
              </p>
            </article>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <h2 className="font-medium text-black dark:text-white">
                Next decisions
              </h2>
              {highlights.length === 0 ? (
                <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                  No priority highlights returned.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                  {highlights.slice(0, 6).map((item, index) => (
                    <li key={String(item.id ?? index)}>
                      {value(
                        item.title ?? item.label ?? item.action,
                        "Priority item",
                      )}{" "}
                      ·{" "}
                      {value(
                        item.reason ?? item.summary,
                        "Review available evidence",
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="rounded-xl border border-amber-500/30 bg-amber-50/50 p-4 dark:bg-amber-950/20">
              <h2 className="font-medium text-black dark:text-white">
                Data gaps
              </h2>
              {warnings.length === 0 ? (
                <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                  No warnings returned.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                  {warnings.slice(0, 6).map((item, index) => (
                    <li key={String(item.id ?? item.source ?? index)}>
                      {value(
                        item.summary ?? item.message ?? item.trustReason,
                        "Reporting input may be incomplete.",
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <h2 className="font-medium text-black dark:text-white">
                Completed work
              </h2>
              {completedWork.length === 0 ? (
                <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                  No completed work in this reporting snapshot.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                  {completedWork.slice(0, 8).map((item, index) => (
                    <li key={String(item.taskId ?? index)}>
                      <span className="font-medium">
                        {value(item.title, "Completed task")}
                      </span>
                      {item.resultSummary
                        ? ` · ${value(item.resultSummary, "")}`
                        : ""}
                      {item.assetId
                        ? ` · Reusable asset: ${value(item.assetName, String(item.assetId))}`
                        : ""}
                      <span className="ml-1 text-xs text-black/50 dark:text-white/50">
                        ({value(item.resultReviewStatus, "review not recorded")}
                        )
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <h2 className="font-medium text-black dark:text-white">
                Experiments and learnings
              </h2>
              {experiments.length === 0 ? (
                <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                  No experiments in this reporting snapshot.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                  {experiments.slice(0, 8).map((item, index) => (
                    <li key={String(item.experimentId ?? index)}>
                      <span className="font-medium">
                        {value(item.title, "Experiment")}
                      </span>{" "}
                      · {value(item.status, "status unavailable")}
                      {item.observedResult
                        ? ` · Observed: ${value(item.observedResult, "")}`
                        : ""}
                      {item.learning
                        ? ` · Learning: ${value(item.learning, "")}`
                        : ""}
                      {Boolean(item.learning) && (
                        <span className="ml-1 text-xs text-black/50 dark:text-white/50">
                          ({value(item.learningApprovalStatus, "pending")})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
          {(metricDefinitions.length > 0 || metricComparisons.length > 0) && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {metricDefinitions.length > 0 && (
                <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <h2 className="font-medium text-black dark:text-white">
                    Metric definitions
                  </h2>
                  <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                    {metricDefinitions.slice(0, 8).map((metric, index) => (
                      <li key={String(metric.key ?? index)}>
                        <span className="font-medium">
                          {value(metric.label, "Metric")}
                        </span>
                        {": "}
                        {value(metric.definition, "Definition unavailable.")}
                        <span className="ml-1 text-xs text-black/50 dark:text-white/50">
                          ({value(metric.source, "source unavailable")})
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              )}
              {metricComparisons.length > 0 && (
                <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
                  <h2 className="font-medium text-black dark:text-white">
                    Audited period comparisons
                  </h2>
                  <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                    {metricComparisons.slice(0, 8).map((metric, index) => (
                      <li key={String(metric.metricKey ?? index)}>
                        {value(metric.label, "Metric")}:{" "}
                        {String(metric.currentValue ?? "—")} vs{" "}
                        {String(metric.previousValue ?? "—")}
                        <span className="text-xs text-black/50 dark:text-white/50">
                          ({value(metric.currentPeriodStart, "current period")}{" "}
                          → {value(metric.currentPeriodEnd, "end unavailable")})
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                    Compared only from audited manual-metric history; connector
                    history is not inferred.
                  </p>
                </article>
              )}
            </div>
          )}
          {events.length > 0 && (
            <article className="mt-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
              <h2 className="font-medium text-black dark:text-white">
                Recent observed outcomes
              </h2>
              <ul className="mt-2 space-y-2 text-sm text-black/70 dark:text-white/70">
                {events.slice(0, 8).map((event, index) => (
                  <li key={String(event.id ?? event.createdAt ?? index)}>
                    {value(
                      event.summary ?? event.description ?? event.type,
                      "Observed outcome",
                    )}{" "}
                    · {value(event.createdAt, "date unavailable")}
                  </li>
                ))}
              </ul>
            </article>
          )}
        </>
      )}
    </section>
  );
}
