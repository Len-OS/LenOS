import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { Button } from "@/shared/ui/button";
import {
  growthCompanyStorageKey,
  getGrowthCompanyMembers,
  getGrowthSpecialistPipeline,
  getGrowthSpecialists,
  inviteGrowthCompanyMember,
  updateGrowthCompanyMember,
} from "@/features/growth/api/growth-api";

export function GrowthTeamSection() {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const [email, setEmail] = useState("");
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
    correlationId: `growth-team:${workspaceSlug}`,
    idempotencyKey: `growth-team-read:${workspaceSlug}`,
    workspaceSlug,
    relayCommunityId: communityId ?? "",
    actorPubkey: actorPubkey ?? "",
    companyId,
  };
  const members = useQuery({
    queryKey: ["growth", "team", workspaceSlug, companyId],
    enabled: Boolean(companyId && workspaceSlug && communityId && actorPubkey),
    queryFn: () => getGrowthCompanyMembers(companyId as string, { envelope }),
  });
  const pipeline = useQuery({
    queryKey: ["growth", "specialist-pipeline", workspaceSlug, companyId],
    enabled: Boolean(companyId && workspaceSlug && communityId && actorPubkey),
    queryFn: () =>
      getGrowthSpecialistPipeline(companyId as string, { envelope }),
  });
  const specialists = useQuery({
    queryKey: ["growth", "specialists", workspaceSlug, companyId],
    enabled: Boolean(companyId && workspaceSlug && communityId && actorPubkey),
    queryFn: () => getGrowthSpecialists({ envelope }),
  });
  if (!companyId)
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/60">
        Complete your Growth intake to unlock Team.
      </div>
    );
  const invite = async () => {
    if (!email.trim()) return;
    setError(null);
    try {
      await inviteGrowthCompanyMember(
        companyId,
        { email: email.trim() },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-team-invite:${companyId}`,
            idempotencyKey: `growth-team-invite:${companyId}:${email.trim().toLowerCase()}`,
          },
        },
      );
      setEmail("");
      await members.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invite failed.");
    }
  };
  const changeRole = async (member: Record<string, unknown>, role: string) => {
    const membershipId = String(member._id ?? "");
    if (!membershipId) return;
    setError(null);
    try {
      await updateGrowthCompanyMember(
        companyId,
        membershipId,
        { role },
        {
          envelope: {
            ...envelope,
            correlationId: `growth-team-role:${membershipId}`,
            idempotencyKey: `growth-team-role:${membershipId}:${role}`,
          },
        },
      );
      await members.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Role update failed.");
    }
  };
  const items = members.data?.items ?? members.data?.members ?? [];
  const pendingItems = items.filter(
    (member) => String(member.status ?? "").toLowerCase() === "pending",
  );
  return (
    <section className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
        Growth OS
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-black dark:text-white">
        Team
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Invite collaborators and make ownership visible.
      </p>
      <div className="mt-5 flex gap-2">
        <input
          aria-label="Team member email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
          className="min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
        />
        <Button
          type="button"
          onClick={() => void invite()}
          disabled={!email.trim()}
        >
          Invite
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
      )}
      {pendingItems.length > 0 && (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
          role="status"
        >
          {pendingItems.length} pending invitation
          {pendingItems.length === 1 ? "" : "s"} awaiting acceptance.
        </div>
      )}
      <div className="mt-5 space-y-2">
        {members.isPending ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Loading team…
          </p>
        ) : members.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <span>Team could not be loaded.</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void members.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/15 p-4 text-sm text-black/55 dark:border-white/15 dark:text-white/55">
            No team members yet. Invite someone to share ownership of growth
            work.
          </p>
        ) : (
          items.map((member, index) => (
            <div
              key={String(member._id ?? member.email ?? index)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <span className="block text-black dark:text-white">
                  {String(member.name ?? member.email ?? "Member")}
                </span>
                <span className="text-xs capitalize text-black/50 dark:text-white/50">
                  {String(member.status ?? "active")}
                  {String(member.role ?? "") === "owner" ? " · owner" : ""}
                </span>
              </div>
              <select
                aria-label={`Role for ${String(member.name ?? member.email ?? "member")}`}
                value={String(member.role ?? "contributor")}
                onChange={(event) =>
                  void changeRole(member, event.target.value)
                }
                className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs capitalize dark:border-white/10"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="contributor">Contributor</option>
                <option value="specialist">Specialist</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          ))
        )}
      </div>
      <div className="mt-8 border-t border-black/10 pt-5 dark:border-white/10">
        <h2 className="text-sm font-medium text-black dark:text-white">
          Specialist availability
        </h2>
        {specialists.isPending ? (
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            Loading availability…
          </p>
        ) : specialists.isError ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <span>Specialist availability could not be loaded.</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void specialists.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : specialists.data?.length ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {specialists.data.slice(0, 6).map((specialist, index) => {
              const name = String(
                specialist.displayName ?? specialist.name ?? "Specialist",
              );
              const canReceiveWork = specialist.canReceiveWork !== false;
              return (
                <div
                  key={String(specialist._id ?? index)}
                  className="rounded-lg border border-black/10 p-3 text-xs dark:border-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-black dark:text-white">
                      {name}
                    </span>
                    <span
                      className={
                        canReceiveWork
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300"
                      }
                    >
                      {canReceiveWork ? "Available" : "At capacity"}
                    </span>
                  </div>
                  <p className="mt-1 text-black/50 dark:text-white/50">
                    {String(
                      specialist.assignmentBlockReason ??
                        String(specialist.activeAssignedTaskCount ?? 0) +
                          " active tasks",
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            No specialist profiles are available yet.
          </p>
        )}
      </div>
      <div className="mt-8 border-t border-black/10 pt-5 dark:border-white/10">
        <h2 className="text-sm font-medium text-black dark:text-white">
          Specialist attention
        </h2>
        {pipeline.isPending ? (
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            Loading pipeline…
          </p>
        ) : pipeline.isError ? (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            Specialist pipeline could not be loaded.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Array.isArray(pipeline.data?.buckets)
              ? pipeline.data.buckets
              : []
            ).map((bucket, index) => {
              const entry = bucket as {
                label?: unknown;
                count?: unknown;
                description?: unknown;
              };
              return (
                <div
                  key={String(entry.label ?? index)}
                  className="rounded-lg border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <p className="text-sm font-medium text-black dark:text-white">
                    {String(entry.label ?? "Pipeline")}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-indigo-600 dark:text-indigo-300">
                    {String(entry.count ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    {String(entry.description ?? "")}
                  </p>
                </div>
              );
            })}
            {(!Array.isArray(pipeline.data?.buckets) ||
              pipeline.data.buckets.length === 0) && (
              <p className="text-xs text-black/50 dark:text-white/50">
                No specialist requests are currently waiting for attention.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
