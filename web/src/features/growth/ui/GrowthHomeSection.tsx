import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Target, TrendingUp } from "lucide-react";
import {
  closeGrowthNorthStar,
  getGrowthStrategyHistory,
  getGrowthCompanyReport,
  getGrowthExperiments,
  createGrowthManualMetric,
  updateGrowthManualMetric,
  getGrowthStrategy,
  getGrowthReadiness,
  getGrowthTasks,
  growthQueryKeys,
  growthCompanyStorageKey,
  upsertGrowthNorthStar,
  GrowthApiError,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { GrowthHomeInsights } from "./GrowthHomeInsights";

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function GrowthHomeSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [editingObjective, setEditingObjective] = useState(false);
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [objectiveDescription, setObjectiveDescription] = useState("");
  const [objectiveMetric, setObjectiveMetric] = useState("");
  const [objectiveBaseline, setObjectiveBaseline] = useState("");
  const [objectiveTarget, setObjectiveTarget] = useState("");
  const [objectiveTargetDate, setObjectiveTargetDate] = useState("");
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState("");
  const [metricLabel, setMetricLabel] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [metricPeriodStart, setMetricPeriodStart] = useState("");
  const [metricPeriodEnd, setMetricPeriodEnd] = useState("");
  const queryClient = useQueryClient();
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

  const readiness = useQuery({
    queryKey: growthQueryKeys.readiness(workspaceSlug),
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthReadiness({
        envelope: {
          correlationId: `growth-home:${workspaceSlug}`,
          idempotencyKey: `growth-home-readiness:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const strategy = useQuery({
    queryKey: growthQueryKeys.company(workspaceSlug, companyId ?? "strategy"),
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthStrategy(companyId as string, {
        envelope: {
          correlationId: `growth-home-strategy:${workspaceSlug}`,
          idempotencyKey: `growth-home-strategy:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const tasks = useQuery({
    queryKey: growthQueryKeys.tasks(workspaceSlug),
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthTasks(undefined, {
        envelope: {
          correlationId: `growth-home-tasks:${workspaceSlug}`,
          idempotencyKey: `growth-home-tasks:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const experiments = useQuery({
    queryKey: ["growth", "home-experiments", workspaceSlug, companyId],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthExperiments(companyId as string, "active", {
        envelope: {
          correlationId: `growth-home-experiments:${workspaceSlug}`,
          idempotencyKey: `growth-home-experiments:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const saveObjective = useMutation({
    mutationFn: () =>
      upsertGrowthNorthStar(
        companyId as string,
        {
          title: objectiveTitle,
          description: objectiveDescription || undefined,
          targetMetric: objectiveMetric || undefined,
          baselineValue: objectiveBaseline
            ? Number(objectiveBaseline)
            : undefined,
          targetValue: objectiveTarget ? Number(objectiveTarget) : undefined,
          targetDate: objectiveTargetDate || undefined,
        },
        {
          envelope: {
            correlationId: `growth-home-objective:${workspaceSlug}`,
            idempotencyKey: `growth-home-objective:${workspaceSlug}:${objectiveTitle.trim()}`,
            workspaceSlug,
            relayCommunityId: communityId as string,
            actorPubkey,
            companyId,
          },
        },
      ),
    onSuccess: () => {
      setEditingObjective(false);
      void queryClient.invalidateQueries({
        queryKey: growthQueryKeys.company(
          workspaceSlug,
          companyId ?? "strategy",
        ),
      });
    },
  });
  const closeObjective = useMutation({
    mutationFn: () =>
      closeGrowthNorthStar(companyId as string, {
        envelope: {
          correlationId: `growth-home-objective-close:${workspaceSlug}`,
          idempotencyKey: `growth-home-objective-close:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: growthQueryKeys.company(
          workspaceSlug,
          companyId ?? "strategy",
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ["growth", "strategy-history", workspaceSlug, companyId],
      });
    },
  });
  const objectiveHistory = useQuery({
    queryKey: ["growth", "strategy-history", workspaceSlug, companyId],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthStrategyHistory(companyId as string, {
        envelope: {
          correlationId: `growth-home-strategy-history:${workspaceSlug}`,
          idempotencyKey: `growth-home-strategy-history:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const report = useQuery({
    queryKey: growthQueryKeys.report(workspaceSlug, companyId ?? ""),
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () =>
      getGrowthCompanyReport(companyId as string, {
        envelope: {
          correlationId: `growth-home-report:${workspaceSlug}`,
          idempotencyKey: `growth-home-report:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      }),
    staleTime: 30_000,
  });
  const saveMetric = useMutation({
    mutationFn: () => {
      const input = {
        ...(editingMetricId ? {} : { metricKey }),
        label: metricLabel,
        value: Number(metricValue),
        unit: metricUnit || undefined,
        periodStart: metricPeriodStart,
        periodEnd: metricPeriodEnd,
      };
      const options = {
        envelope: {
          correlationId: `growth-home-metric:${workspaceSlug}`,
          idempotencyKey: `growth-home-metric:${workspaceSlug}:${editingMetricId ?? metricKey}`,
          workspaceSlug,
          relayCommunityId: communityId as string,
          actorPubkey,
          companyId,
        },
      };
      return editingMetricId
        ? updateGrowthManualMetric(
            companyId as string,
            editingMetricId,
            input,
            options,
          )
        : createGrowthManualMetric(companyId as string, input, options);
    },
    onSuccess: () => {
      setEditingMetricId(null);
      setMetricKey("");
      setMetricLabel("");
      setMetricValue("");
      setMetricUnit("");
      setMetricPeriodStart("");
      setMetricPeriodEnd("");
      void queryClient.invalidateQueries({
        queryKey: growthQueryKeys.report(workspaceSlug, companyId ?? ""),
      });
    },
  });

  if (!companyId) {
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock your Growth Home.
      </div>
    );
  }
  if (readiness.isPending)
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Loading your growth state…
      </div>
    );
  if (readiness.isError) {
    return (
      <div className="m-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Growth data is temporarily unavailable. Try again.</span>
        <Button
          type="button"
          variant="outline"
          onClick={() => void readiness.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const data = readiness.data ?? {};
  const objective = textValue(
    strategy.data?.northStar?.title ?? data.objective ?? data.macroObjective,
    "No objective set yet",
  );
  const bottleneck = textValue(
    data.bottleneck ?? data.primaryBottleneck,
    "No bottleneck identified yet",
  );
  const recommendation =
    typeof (
      data.recommendedAction ??
      data.nextRecommendedAction ??
      data.nextAction
    ) === "object" &&
    (data.recommendedAction ??
      data.nextRecommendedAction ??
      data.nextAction) !== null
      ? ((data.recommendedAction ??
          data.nextRecommendedAction ??
          data.nextAction) as Record<string, unknown>)
      : {};
  const nextActionValue =
    typeof data.nextAction === "object" && data.nextAction !== null
      ? ((data.nextAction as Record<string, unknown>).title ??
        (data.nextAction as Record<string, unknown>).label)
      : (data.nextAction ?? recommendation.title ?? recommendation.label);
  const nextAction = textValue(
    nextActionValue,
    "Review your current growth signals",
  );
  const whyThis = textValue(
    recommendation.whyThis ??
      recommendation.rationale ??
      data.recommendationRationale,
    "This is the next action suggested by the strongest available growth signal.",
  );
  const evidenceMissing = textValue(
    recommendation.evidenceMissing ?? data.evidenceMissing,
    "No additional evidence gap was returned.",
  );
  const evidence = textValue(
    data.evidence ?? data.evidenceStatus,
    "Evidence is being collected",
  );
  const objectiveDescriptionValue = textValue(
    strategy.data?.northStar?.description,
    "Set a clear outcome so the team can align work to it.",
  );
  const taskItems = tasks.data?.data ?? [];
  const activeTasks = taskItems.filter((task) =>
    ["active", "pending", "queue", "queued"].includes(
      String(task.status ?? "").toLowerCase(),
    ),
  );
  const attentionTasks = taskItems.filter((task) =>
    ["blocked", "approval_required", "needs_approval"].includes(
      String(task.status ?? "").toLowerCase(),
    ),
  );
  const assessment = (report.data?.assessment ?? {}) as Record<string, unknown>;
  const momentum = (report.data?.executionMomentum ?? {}) as Record<
    string,
    unknown
  >;
  const integrations = (report.data?.integrations ?? {}) as Record<
    string,
    unknown
  >;
  const integrationSources = Object.entries(integrations).slice(0, 3);
  const manualMetrics = Array.isArray(report.data?.manualMetrics)
    ? report.data.manualMetrics
    : [];
  const reportingWarnings = Array.isArray(report.data?.warnings)
    ? report.data.warnings
    : [];
  const recentOutcomes =
    report.data?.recentOutcomes &&
    typeof report.data.recentOutcomes === "object"
      ? (report.data.recentOutcomes as Record<string, unknown>)
      : {};
  const observedWins = Array.isArray(recentOutcomes.events)
    ? recentOutcomes.events.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
    : [];
  const activeExperiments = experiments.data?.items ?? [];
  const typedGrowthDisabled = [
    strategy.error,
    report.error,
    tasks.error,
    experiments.error,
  ].some(
    (error) =>
      error instanceof GrowthApiError && error.code === "growth_flag_disabled",
  );
  const hasSecondaryDataError =
    strategy.isError || report.isError || tasks.isError || experiments.isError;

  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
          Growth OS
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
          Growth Home
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Your current objective, strongest signal, and next useful move.
        </p>
      </div>
      {hasSecondaryDataError && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {typedGrowthDisabled
              ? "Some Growth OS features are not enabled for this workspace yet. The legacy LenGrowth dashboard remains available."
              : "Some growth details could not be loaded. Your available data is still shown."}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (strategy.isError) void strategy.refetch();
              if (report.isError) void report.refetch();
              if (tasks.isError) void tasks.refetch();
              if (experiments.isError) void experiments.refetch();
            }}
          >
            Retry details
          </Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <Target className="h-5 w-5 text-indigo-600" />
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            Objective
          </p>
          {editingObjective ? (
            <div className="mt-2 space-y-2">
              <Input
                aria-label="Objective title"
                value={objectiveTitle}
                onChange={(event) => setObjectiveTitle(event.target.value)}
                placeholder="What outcome matters most?"
              />
              <Textarea
                aria-label="Objective description"
                value={objectiveDescription}
                onChange={(event) =>
                  setObjectiveDescription(event.target.value)
                }
                placeholder="Why does this matter?"
              />
              <Input
                aria-label="North-star metric"
                value={objectiveMetric}
                onChange={(event) => setObjectiveMetric(event.target.value)}
                placeholder="North-star metric (optional)"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  aria-label="Objective baseline"
                  type="number"
                  inputMode="decimal"
                  value={objectiveBaseline}
                  onChange={(event) => setObjectiveBaseline(event.target.value)}
                  placeholder="Baseline"
                />
                <Input
                  aria-label="Objective target"
                  type="number"
                  inputMode="decimal"
                  value={objectiveTarget}
                  onChange={(event) => setObjectiveTarget(event.target.value)}
                  placeholder="Target"
                />
                <Input
                  aria-label="Objective target date"
                  type="date"
                  value={objectiveTargetDate}
                  onChange={(event) =>
                    setObjectiveTargetDate(event.target.value)
                  }
                />
              </div>
              {saveObjective.isError && (
                <p className="text-xs text-red-700 dark:text-red-300">
                  Could not save the objective. Check your permissions and try
                  again.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void saveObjective.mutateAsync()}
                  disabled={!objectiveTitle.trim() || saveObjective.isPending}
                >
                  {saveObjective.isPending ? "Saving…" : "Save objective"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingObjective(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 font-medium text-black dark:text-white">
                {objective}
              </p>
              <p className="mt-2 text-sm text-black/60 dark:text-white/60">
                {objectiveDescriptionValue}
              </p>
              {(strategy.data?.northStar?.baselineValue != null ||
                strategy.data?.northStar?.targetValue != null ||
                strategy.data?.northStar?.targetDate) && (
                <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                  Scorecard: {strategy.data.northStar.baselineValue ?? "—"} →{" "}
                  {strategy.data.northStar.targetValue ?? "—"}
                  {strategy.data.northStar.targetDate
                    ? ` by ${String(strategy.data.northStar.targetDate).slice(0, 10)}`
                    : ""}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                className="mt-2 px-0"
                onClick={() => {
                  setObjectiveTitle(strategy.data?.northStar?.title ?? "");
                  setObjectiveDescription(
                    strategy.data?.northStar?.description ?? "",
                  );
                  setObjectiveMetric(
                    strategy.data?.northStar?.targetMetric ?? "",
                  );
                  setObjectiveBaseline(
                    strategy.data?.northStar?.baselineValue == null
                      ? ""
                      : String(strategy.data.northStar.baselineValue),
                  );
                  setObjectiveTarget(
                    strategy.data?.northStar?.targetValue == null
                      ? ""
                      : String(strategy.data.northStar.targetValue),
                  );
                  setObjectiveTargetDate(
                    String(strategy.data?.northStar?.targetDate ?? "").slice(
                      0,
                      10,
                    ),
                  );
                  setEditingObjective(true);
                }}
              >
                Edit objective
              </Button>
              {strategy.data?.northStar && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 px-0 text-red-700 dark:text-red-300"
                  onClick={() => void closeObjective.mutateAsync()}
                  disabled={closeObjective.isPending}
                >
                  {closeObjective.isPending ? "Closing…" : "Close objective"}
                </Button>
              )}
            </>
          )}
        </article>
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <TrendingUp className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            Bottleneck
          </p>
          <p className="mt-1 font-medium text-black dark:text-white">
            {bottleneck}
          </p>
        </article>
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            Recommended action
          </p>
          <p className="mt-1 font-medium text-black dark:text-white">
            {nextAction}
          </p>
          <details className="mt-2 text-xs text-black/60 dark:text-white/60">
            <summary className="cursor-pointer font-medium text-black dark:text-white">
              Why this action?
            </summary>
            <p className="mt-2">{whyThis}</p>
            <p className="mt-2">
              <span className="font-medium text-black dark:text-white">
                Evidence still needed:
              </span>{" "}
              {evidenceMissing}
            </p>
          </details>
        </article>
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-black/50 dark:text-white/50">Evidence</p>
          <p className="mt-1 font-medium text-black dark:text-white">
            {evidence}
          </p>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            Source and freshness details will appear as reporting integrations
            connect.
          </p>
        </article>
      </div>
      {objectiveHistory.data && objectiveHistory.data.total > 0 && (
        <details className="mt-3 rounded-xl border border-black/10 bg-white/70 p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]">
          <summary className="cursor-pointer font-medium text-black dark:text-white">
            Objective history
          </summary>
          <ul className="mt-3 space-y-2 text-black/60 dark:text-white/60">
            {objectiveHistory.data.items.slice(0, 8).map((item, index) => (
              <li key={String(item._id ?? index)}>
                {textValue(item.action, "Objective changed")} ·{" "}
                {textValue(item.createdAt, "date unavailable")}
              </li>
            ))}
          </ul>
        </details>
      )}
      <section className="mt-3 rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium text-black dark:text-white">
              Scorecard
            </h2>
            <p className="text-xs text-black/50 dark:text-white/50">
              LenGrowth reporting ·{" "}
              {textValue(report.data?.generatedAt, "freshness unavailable")}
            </p>
          </div>
          {report.isError && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Reporting is unavailable
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">
              Growth score
            </p>
            <p className="mt-1 text-lg font-semibold text-black dark:text-white">
              {String(assessment.growthScore ?? "—")}
            </p>
            <p className="text-xs text-black/50 dark:text-white/50">
              Assessment source
            </p>
          </div>
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">
              Execution progress
            </p>
            <p className="mt-1 text-lg font-semibold text-black dark:text-white">
              {momentum.completionPercentage == null
                ? "—"
                : `${String(momentum.completionPercentage)}%`}
            </p>
            <p className="text-xs text-black/50 dark:text-white/50">
              Task completion
            </p>
          </div>
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">
              Data freshness
            </p>
            <p className="mt-1 text-sm font-medium text-black dark:text-white">
              {report.isPending
                ? "Loading…"
                : integrationSources.length
                  ? "Source-backed"
                  : "No integrations yet"}
            </p>
            <p className="text-xs text-black/50 dark:text-white/50">
              Manual values are labelled in LenGrowth reporting.
            </p>
          </div>
        </div>
        {integrationSources.length > 0 && (
          <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
            <p className="text-xs font-medium text-black/60 dark:text-white/60">
              Connected sources
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {integrationSources.map(([key, raw]) => {
                const source = (raw ?? {}) as Record<string, unknown>;
                return (
                  <li
                    key={key}
                    className="rounded-md bg-black/[0.03] p-2 text-xs dark:bg-white/[0.04]"
                  >
                    <span className="font-medium text-black dark:text-white">
                      {textValue(source.sourceLabel, key)}
                    </span>
                    <br />
                    <span className="text-black/50 dark:text-white/50">
                      {textValue(
                        source.freshnessLabel ?? source.syncStatusLabel,
                        "Freshness unavailable",
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
      <GrowthHomeInsights
        taskCount={taskItems.length}
        warningItems={reportingWarnings}
        sourceCount={integrationSources.length}
        objectiveStatus={strategy.data?.northStar?.status}
      />
      <section className="mt-3 rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium text-black dark:text-white">
              Manual metrics
            </h2>
            <p className="text-xs text-black/50 dark:text-white/50">
              User-entered values are clearly labelled and retain edit history.
            </p>
          </div>
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Manual · not an integration
          </span>
        </div>
        {manualMetrics.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {manualMetrics.slice(0, 6).map((metric, index) => (
              <li
                key={String(metric._id ?? index)}
                className="rounded-md border border-black/10 p-3 text-sm dark:border-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-black dark:text-white">
                    {textValue(
                      metric.label,
                      String(metric.metricKey ?? "Metric"),
                    )}
                  </span>
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    Manual
                  </span>
                </div>
                <p className="mt-1 text-black/70 dark:text-white/70">
                  {String(metric.value ?? "—")} {textValue(metric.unit, "")}
                </p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {textValue(metric.periodStart, "")} →{" "}
                  {textValue(metric.periodEnd, "")} ·{" "}
                  {textValue(metric.trustLabel, "User-entered")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-1 px-0 text-xs"
                  onClick={() => {
                    setEditingMetricId(String(metric._id ?? ""));
                    setMetricKey(String(metric.metricKey ?? ""));
                    setMetricLabel(String(metric.label ?? ""));
                    setMetricValue(String(metric.value ?? ""));
                    setMetricUnit(String(metric.unit ?? ""));
                    setMetricPeriodStart(String(metric.periodStart ?? ""));
                    setMetricPeriodEnd(String(metric.periodEnd ?? ""));
                  }}
                >
                  Edit metric
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            aria-label="Metric key"
            value={metricKey}
            onChange={(event) => setMetricKey(event.target.value)}
            placeholder="Metric key"
            disabled={Boolean(editingMetricId)}
          />
          <Input
            aria-label="Metric label"
            value={metricLabel}
            onChange={(event) => setMetricLabel(event.target.value)}
            placeholder="Label"
          />
          <Input
            aria-label="Metric value"
            type="number"
            value={metricValue}
            onChange={(event) => setMetricValue(event.target.value)}
            placeholder="Value"
          />
          <Input
            aria-label="Metric unit"
            value={metricUnit}
            onChange={(event) => setMetricUnit(event.target.value)}
            placeholder="Unit (optional)"
          />
          <Input
            aria-label="Metric period start"
            type="date"
            value={metricPeriodStart}
            onChange={(event) => setMetricPeriodStart(event.target.value)}
          />
          <Input
            aria-label="Metric period end"
            type="date"
            value={metricPeriodEnd}
            onChange={(event) => setMetricPeriodEnd(event.target.value)}
          />
        </div>
        {saveMetric.isError && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            Could not save this metric. Manual metric writes require
            company-owner or admin permission.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            onClick={() => void saveMetric.mutateAsync()}
            disabled={
              !metricKey.trim() ||
              !metricLabel.trim() ||
              !metricValue ||
              !metricPeriodStart ||
              !metricPeriodEnd ||
              saveMetric.isPending
            }
          >
            {saveMetric.isPending
              ? "Saving…"
              : editingMetricId
                ? "Save metric"
                : "Add manual metric"}
          </Button>
          {editingMetricId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditingMetricId(null)}
            >
              Cancel
            </Button>
          )}
        </div>
      </section>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-black/50 dark:text-white/50">
            Active work
          </p>
          {tasks.isPending ? (
            <p className="mt-2 text-sm text-black/50 dark:text-white/50">
              Loading work…
            </p>
          ) : activeTasks.length === 0 ? (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              No active growth work.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeTasks.slice(0, 5).map((task, index) => (
                <li
                  key={String(task._id ?? task.id ?? index)}
                  className="flex items-center justify-between gap-3 text-sm text-black dark:text-white"
                >
                  <span className="truncate">
                    {textValue(task.title, "Untitled task")}
                  </span>
                  <span className="shrink-0 text-xs text-black/50 dark:text-white/50">
                    {String(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-black/50 dark:text-white/50">
            Attention queue
          </p>
          {tasks.isError ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Work items could not be loaded.
            </p>
          ) : attentionTasks.length === 0 ? (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              Nothing needs attention.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {attentionTasks.slice(0, 5).map((task, index) => (
                <li
                  key={String(task._id ?? task.id ?? index)}
                  className="flex items-center justify-between gap-3 text-sm text-black dark:text-white"
                >
                  <span className="truncate">
                    {textValue(task.title, "Untitled task")}
                  </span>
                  <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">
                    {String(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-black/50 dark:text-white/50">
            Active experiments
          </p>
          {experiments.isPending ? (
            <p className="mt-2 text-sm text-black/50 dark:text-white/50">
              Loading experiments…
            </p>
          ) : activeExperiments.length === 0 ? (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              No active experiments.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeExperiments.slice(0, 5).map((experiment, index) => (
                <li
                  key={String(experiment._id ?? index)}
                  className="text-sm text-black dark:text-white"
                >
                  <span className="font-medium">
                    {textValue(experiment.title, "Untitled experiment")}
                  </span>
                  <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">
                    Metric: {textValue(experiment.metric, "not recorded")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-black/50 dark:text-white/50">
            Recent wins
          </p>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Observed outcomes, not assumed causal impact.
          </p>
          {observedWins.length === 0 ? (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              No observed wins recorded yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {observedWins.slice(0, 5).map((event, index) => (
                <li
                  key={String(event.id ?? event.occurredAt ?? index)}
                  className="text-sm text-black dark:text-white"
                >
                  <span className="font-medium">
                    {textValue(event.title, "Observed outcome")}
                  </span>
                  <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">
                    {textValue(event.summary, "Evidence details unavailable")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
