import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteGrowthAutomation,
  getGrowthAutomations,
  type GrowthRequestOptions,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";

export function AutomationsSettingsPanel() {
  const [crons, setCrons] = useState<
    Awaited<ReturnType<typeof getGrowthAutomations>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [actorPubkey, setActorPubkey] = useState("");
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";

  useEffect(() => {
    getCurrentPubkey()
      .then((value) => setActorPubkey(value ?? ""))
      .catch(() => {});
  }, []);

  const requestOptions = useMemo<GrowthRequestOptions | undefined>(
    () =>
      workspaceSlug && communityId && actorPubkey
        ? {
            envelope: {
              correlationId: `growth-automation:${workspaceSlug}`,
              idempotencyKey: `growth-automation-read:${workspaceSlug}`,
              workspaceSlug,
              relayCommunityId: communityId,
              actorPubkey,
              companyId,
            },
          }
        : undefined,
    [actorPubkey, companyId, communityId, workspaceSlug],
  );

  const fetchCrons = useCallback(
    async (cid: string) => {
      setLoading(true);
      try {
        setCrons(
          await getGrowthAutomations(
            cid,
            requestOptions
              ? {
                  ...requestOptions,
                  envelope: {
                    ...requestOptions.envelope,
                    companyId: cid,
                  },
                }
              : undefined,
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [requestOptions],
  );

  useEffect(() => {
    const cid = localStorage.getItem("lengrowth-company-id") ?? "";
    setCompanyId(cid);
    if (cid) fetchCrons(cid);
  }, [fetchCrons]);

  const handleDelete = async (cronId: string) => {
    await deleteGrowthAutomation(
      companyId,
      cronId,
      requestOptions
        ? {
            ...requestOptions,
            envelope: {
              ...requestOptions.envelope,
              correlationId: `growth-automation:delete:${cronId}`,
              idempotencyKey: `growth-automation:delete:${companyId}:${cronId}`,
              companyId,
            },
          }
        : undefined,
    );
    setCrons((prev) => prev.filter((c) => c.cron_id !== cronId));
  };

  return (
    <div className="max-w-md">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Automations
      </p>
      <p className="mb-5 text-xs text-black/50 dark:text-white/50">
        Recurring tasks created by Len. Cancel them here or by asking Len to
        stop them.
      </p>

      {!companyId ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Connect LenGrowth first in Settings → LenGrowth
        </p>
      ) : loading ? (
        <p className="text-sm text-black/40 dark:text-white/40">Loading…</p>
      ) : crons.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40">
          No active automations. Ask Len to create one: "Send me a standup every
          morning at 8am."
        </p>
      ) : (
        <div className="space-y-2">
          {crons.map((c) => (
            <div
              key={c.cron_id}
              className="rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-black dark:text-white line-clamp-2 flex-1">
                  {c.prompt}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(c.cron_id)}
                  className="mt-0.5 shrink-0 text-black/30 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400"
                  aria-label="Cancel automation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                {c.schedule} · {c.timezone} · ran {c.run_count}×
                {c.next_run_at
                  ? ` · next ${new Date(c.next_run_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
