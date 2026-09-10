import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getGrowthAssets,
  getGrowthAsset,
  downloadGrowthAsset,
  growthCompanyStorageKey,
  requestGrowthAssetReview,
  type GrowthAsset,
  verifyGrowthAsset,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function GrowthAssetsSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
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
    correlationId: `growth-assets:${workspaceSlug}`,
    idempotencyKey: `growth-assets-read:${workspaceSlug}`,
    workspaceSlug,
    relayCommunityId: communityId ?? "",
    actorPubkey: actorPubkey ?? "",
    companyId,
  };
  const assets = useQuery({
    queryKey: ["growth", "assets", workspaceSlug, companyId],
    enabled: Boolean(workspaceSlug && communityId && actorPubkey && companyId),
    queryFn: () => getGrowthAssets(companyId as string, { envelope }),
  });
  const detail = useQuery({
    queryKey: ["growth", "asset", workspaceSlug, companyId, selectedAssetId],
    enabled: Boolean(
      workspaceSlug &&
        communityId &&
        actorPubkey &&
        companyId &&
        selectedAssetId,
    ),
    queryFn: () =>
      getGrowthAsset(companyId as string, selectedAssetId as string, {
        envelope,
      }),
  });
  const review = useMutation({
    mutationFn: () =>
      requestGrowthAssetReview(companyId as string, selectedAssetId as string, {
        envelope,
      }),
    onSuccess: () => {
      void detail.refetch();
      void assets.refetch();
    },
  });
  const verify = useMutation({
    mutationFn: () =>
      verifyGrowthAsset(companyId as string, selectedAssetId as string, {
        envelope,
      }),
    onSuccess: () => {
      void detail.refetch();
      void assets.refetch();
    },
  });
  const download = async (format: "docx" | "markdown") => {
    if (!selectedAssetId) return;
    setDownloadError(null);
    try {
      const blob = await downloadGrowthAsset(
        companyId as string,
        selectedAssetId,
        format,
        { envelope },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `growth-asset.${format === "markdown" ? "md" : "docx"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setDownloadError(
        cause instanceof Error ? cause.message : "Asset export failed.",
      );
    }
  };
  if (!companyId) {
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock Assets.
      </div>
    );
  }
  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        Growth OS
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
        Assets
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Reusable outputs from completed work, kept in the authoritative
        LenGrowth asset library.
      </p>
      <div className="mt-5 space-y-3">
        {assets.isPending ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Loading assets…
          </p>
        ) : assets.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <span>Assets could not be loaded.</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void assets.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (assets.data?.assets ?? []).length === 0 ? (
          <p className="rounded-xl border border-black/10 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
            No reusable assets yet. Complete a task with the asset option to
            create one.
          </p>
        ) : (
          (assets.data?.assets ?? []).map((asset: GrowthAsset) => (
            <article
              key={String(asset._id)}
              className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-medium text-black dark:text-white">
                  {text(asset.asset_name, "Untitled asset")}
                </h2>
                <span className="rounded-full bg-black/[0.06] px-2 py-1 text-xs capitalize dark:bg-white/10">
                  {text(asset.status, "draft")}
                </span>
              </div>
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                {text(asset.asset_type, "Asset")} · {String(asset._id ?? "")}
              </p>
              {asset.generated_by_task_id && (
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  Generated by task {asset.generated_by_task_id}
                </p>
              )}
              {asset.content_current && (
                <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                  {asset.content_current.slice(0, 240)}
                  {asset.content_current.length > 240 ? "…" : ""}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setSelectedAssetId(String(asset._id))}
              >
                {selectedAssetId === String(asset._id)
                  ? "Selected"
                  : "Open details"}
              </Button>
            </article>
          ))
        )}
      </div>
      {selectedAssetId && (
        <article className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-50/40 p-4 dark:bg-indigo-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-black dark:text-white">
              Asset detail and review
            </h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedAssetId(null)}
            >
              Close
            </Button>
          </div>
          {detail.isPending ? (
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">
              Loading asset detail…
            </p>
          ) : detail.isError ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <span>Asset detail could not be loaded.</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void detail.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : detail.data ? (
            <>
              <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                Version {String(detail.data.version ?? "—")} ·{" "}
                {text(detail.data.review_status, "review status unavailable")}
              </p>
              {Array.isArray(detail.data.versions) &&
                detail.data.versions.length > 0 && (
                  <div className="mt-2 text-xs text-black/60 dark:text-white/60">
                    <p className="font-medium">Version history</p>
                    <ul className="mt-1 space-y-1">
                      {detail.data.versions
                        .slice(-5)
                        .reverse()
                        .map((version, index) => (
                          <li key={String(version.version ?? index)}>
                            v{String(version.version ?? "—")} ·{" "}
                            {text(version.change_reason, "content revision")} ·{" "}
                            {text(version.created_by, "author unavailable")}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              {detail.data.source_document_ids?.length ? (
                <p className="mt-2 text-xs text-black/60 dark:text-white/60">
                  Source documents: {detail.data.source_document_ids.join(", ")}
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
                {text(detail.data.content_current, "Preview unavailable.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate()}
                >
                  Request review
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate()}
                >
                  Verify asset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void download("markdown")}
                >
                  Export Markdown
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void download("docx")}
                >
                  Export DOCX
                </Button>
              </div>
              {(review.isError || verify.isError || downloadError) && (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                  {downloadError ??
                    "The asset action failed. Check permissions and retry."}
                </p>
              )}
            </>
          ) : null}
        </article>
      )}
    </section>
  );
}
