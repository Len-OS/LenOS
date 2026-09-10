import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  exportGrowthAgencyMetrics,
  getGrowthAgencyClients,
  getGrowthAgencyMetrics,
  getGrowthAgencyWorkspaces,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";

function text(input: unknown, fallback: string) {
  return typeof input === "string" && input.trim() ? input : fallback;
}

function count(metrics: Record<string, unknown> | undefined, key: string) {
  return typeof metrics?.[key] === "number" ? (metrics[key] as number) : 0;
}

export function GrowthPortfolioSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [exportState, setExportState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [exportedMetrics, setExportedMetrics] = useState<Record<
    string,
    unknown
  > | null>(null);
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";
  useEffect(() => {
    getCurrentPubkey()
      .then(setActorPubkey)
      .catch(() => {});
  }, []);
  const envelope = {
    correlationId: `growth-portfolio:${workspaceSlug}`,
    idempotencyKey: `growth-portfolio-read:${workspaceSlug}`,
    workspaceSlug,
    relayCommunityId: communityId ?? "",
    actorPubkey: actorPubkey ?? "",
  };
  const workspaces = useQuery({
    queryKey: ["growth", "agency", "workspaces", workspaceSlug],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey),
    queryFn: () => getGrowthAgencyWorkspaces({ envelope }),
  });
  const selectedId =
    selectedWorkspaceId ?? String(workspaces.data?.[0]?._id ?? "");
  const clients = useQuery({
    queryKey: ["growth", "agency", "clients", workspaceSlug, selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => getGrowthAgencyClients(selectedId, { envelope }),
  });
  const portfolioMetrics = useQueries({
    queries: (workspaces.data ?? []).map((agencyWorkspace) => {
      const id = String(agencyWorkspace._id ?? "");
      return {
        queryKey: ["growth", "agency", "metrics", workspaceSlug, id],
        enabled: Boolean(id),
        retry: false,
        queryFn: () => getGrowthAgencyMetrics(id, { envelope }),
      };
    }),
  });
  const selectedMetricsIndex = (workspaces.data ?? []).findIndex(
    (agencyWorkspace) => String(agencyWorkspace._id ?? "") === selectedId,
  );
  const selectedMetricsQuery =
    selectedMetricsIndex >= 0
      ? portfolioMetrics[selectedMetricsIndex]
      : undefined;
  const selectedMetrics = selectedMetricsQuery?.data;
  const failedMetricQueries = portfolioMetrics.filter((query) => query.isError);
  const retryFailedMetrics = () => {
    for (const query of failedMetricQueries) void query.refetch();
  };
  const aggregateMetrics = portfolioMetrics.reduce(
    (summary, query) => ({
      linked: summary.linked + count(query.data, "linked_client_count"),
      active: summary.active + count(query.data, "active_client_count"),
      pending: summary.pending + count(query.data, "pending_client_count"),
    }),
    { linked: 0, active: 0, pending: 0 },
  );
  const exportMetrics = async () => {
    if (!selectedId) return;
    setExportState("loading");
    try {
      const result = await exportGrowthAgencyMetrics(selectedId, {
        envelope: {
          ...envelope,
          correlationId: `growth-portfolio-metrics-export:${selectedId}`,
          idempotencyKey: `growth-portfolio-metrics-export:${selectedId}`,
        },
      });
      setExportedMetrics(result);
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  };
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        Growth OS
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
        Portfolio
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Agency attention across only the client workspaces granted to your
        identity.
      </p>
      {workspaces.isPending ? (
        <p className="mt-5 text-sm text-black/60 dark:text-white/60">
          Loading portfolio…
        </p>
      ) : workspaces.isError ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
          <span>Portfolio access could not be loaded.</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void workspaces.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : workspaces.data?.length === 0 ? (
        <p className="mt-5 rounded-xl border border-black/10 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          No agency workspaces are available for this identity.
        </p>
      ) : (
        <>
          <div
            className="mt-5 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Agency workspaces"
          >
            {(workspaces.data ?? []).map((agencyWorkspace) => {
              const id = String(agencyWorkspace._id ?? "");
              return (
                <Button
                  key={id}
                  type="button"
                  variant={id === selectedId ? "default" : "outline"}
                  onClick={() => setSelectedWorkspaceId(id)}
                  role="tab"
                  aria-selected={id === selectedId}
                >
                  {text(agencyWorkspace.name, "Agency workspace")}
                </Button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Linked clients
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {String(
                  selectedMetrics?.linked_client_count ??
                    clients.data?.length ??
                    "—",
                )}
              </p>
            </article>
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Active links
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {String(selectedMetrics?.active_client_count ?? "—")}
              </p>
            </article>
            <article className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-xs text-black/50 dark:text-white/50">
                Pending attention
              </p>
              <p className="mt-1 text-2xl font-semibold text-black dark:text-white">
                {String(selectedMetrics?.pending_client_count ?? "—")}
              </p>
            </article>
          </div>
          {failedMetricQueries.length > 0 && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
            >
              <span>
                Metrics for {failedMetricQueries.length} portfolio workspace
                {failedMetricQueries.length === 1 ? " are" : "s are"}{" "}
                unavailable; aggregate totals may be partial.
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={retryFailedMetrics}
              >
                Retry failed metrics
              </Button>
            </div>
          )}
          {portfolioMetrics.length > 1 && (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Portfolio total
                {failedMetricQueries.length > 0 ? " (partial)" : ""}
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <p className="text-sm text-black/70 dark:text-white/70">
                  <span className="block text-lg font-semibold text-black dark:text-white">
                    {aggregateMetrics.linked}
                  </span>
                  linked clients
                </p>
                <p className="text-sm text-black/70 dark:text-white/70">
                  <span className="block text-lg font-semibold text-black dark:text-white">
                    {aggregateMetrics.active}
                  </span>
                  active links
                </p>
                <p className="text-sm text-black/70 dark:text-white/70">
                  <span className="block text-lg font-semibold text-black dark:text-white">
                    {aggregateMetrics.pending}
                  </span>
                  pending attention
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={exportState === "loading"}
              onClick={() => void exportMetrics()}
            >
              {exportState === "loading"
                ? "Exporting…"
                : "Export portfolio metrics"}
            </Button>
            {exportState === "error" && (
              <span className="text-xs text-red-700 dark:text-red-300">
                Export failed. Check permission and retry.
              </span>
            )}
          </div>
          {selectedMetricsQuery?.isError && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <span>Portfolio metrics could not be loaded.</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void selectedMetricsQuery.refetch()}
              >
                Retry metrics
              </Button>
            </div>
          )}
          {exportedMetrics && (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">
              Export prepared for the selected agency workspace. Client details
              remain scoped and redacted by LenGrowth.
            </p>
          )}
          {clients.isError ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <span>Client attention could not be loaded.</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void clients.refetch()}
              >
                Retry clients
              </Button>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {(clients.data ?? []).map((client) => (
                <li
                  key={String(client._id)}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-black dark:text-white">
                      {text(client.client_company_name, "Client company")}
                    </span>
                    <span className="text-xs capitalize text-black/50 dark:text-white/50">
                      {text(client.status, "unknown")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    Scopes: {client.scopes?.join(", ") || "none returned"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
