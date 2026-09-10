import { useEffect, useState } from "react";
import type { Message } from "@/features/messages/use-messages";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import {
  createGrowthTask,
  GrowthApiError,
  growthCompanyStorageKey,
  recordGrowthTelemetry,
} from "@/features/growth/api/growth-api";

interface SuggestionPayload {
  signal_type: string;
  severity: number;
  title: string;
  description: string;
  suggested_action: string;
  expires_at: number;
  why_this_business?: string;
  whyThisBusinessExplanation?: string;
  evidence_summary?: string;
  evidenceSummary?: string;
  missing_evidence?: string[];
}

function parsePayload(content: string): SuggestionPayload | null {
  try {
    return JSON.parse(content) as SuggestionPayload;
  } catch {
    return null;
  }
}

function severityBadgeClass(severity: number): string {
  if (severity >= 0.9) return "bg-red-500/15 text-red-600 dark:text-red-400";
  if (severity >= 0.75)
    return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
}

async function publishLegacyTaskRequest(
  msg: Message,
  channelId: string,
  growthAgentPubkey: string,
  payload: SuggestionPayload,
) {
  const signed = await signNostrEvent(
    {
      kind: 9,
      content: JSON.stringify({
        action: "create_task_from_suggestion",
        signal_type: payload.signal_type,
        title: payload.title,
        description: payload.description,
        suggested_action: payload.suggested_action,
        suggestion_event_id: msg.id,
      }),
      tags: [
        ["h", channelId],
        ["p", growthAgentPubkey],
        ["t", "leng-task-from-suggestion"],
        ["suggestion_event_id", msg.id],
        ["signal_type", payload.signal_type],
      ],
    },
    { requireDurableSigner: true },
  );
  await getRelayClient(relayWsUrl()).publishAndWait(
    signed as Record<string, unknown>,
  );
}

interface Props {
  msg: Message;
  channelId: string;
  currentPubkey: string | null;
}

export function GrowthSuggestionCard({
  msg,
  channelId,
  currentPubkey: _currentPubkey,
}: Props) {
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [legacyQueued, setLegacyQueued] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const payload = parsePayload(msg.content);
  const signalType = payload?.signal_type;
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";
  const companyId = workspaceSlug
    ? localStorage.getItem(growthCompanyStorageKey(workspaceSlug))?.trim()
    : null;

  useEffect(() => {
    if (dismissed || !signalType || !_currentPubkey || !communityId) return;
    if (!workspaceSlug || !companyId) return;
    void recordGrowthTelemetry(
      "growth_first_recommendation_seen",
      {
        envelope: {
          correlationId: `suggestion:${msg.id}`,
          idempotencyKey: `suggestion-seen:${msg.id}`,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey: _currentPubkey,
          companyId,
          originEventId: msg.id,
          originChannelId: channelId,
        },
      },
      { signalType },
    ).catch(() => {});
  }, [
    _currentPubkey,
    channelId,
    communityId,
    dismissed,
    msg.id,
    signalType,
    workspaceSlug,
    companyId,
  ]);

  // The growth agent pubkey is the author of this suggestion event.
  const growthAgentPubkey = msg.pubkey;

  if (!payload || dismissed) return null;

  const handleCreateTask = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const workspaceSlug =
      workspace.status === "found" ? workspace.workspace.slug : "";
    try {
      const companyId = workspaceSlug
        ? localStorage.getItem(growthCompanyStorageKey(workspaceSlug))?.trim()
        : null;
      const currentPubkey = _currentPubkey?.trim();
      if (!companyId || !currentPubkey || !workspaceSlug || !communityId) {
        throw new Error(
          "Connect this workspace to LenGrowth before creating a task.",
        );
      }

      const task = await createGrowthTask(
        {
          companyId,
          taskType: "growth_strategy_development",
          title: payload.title,
          description: `${payload.description}\n\nSuggested action: ${payload.suggested_action}`,
          objective: payload.suggested_action || payload.title,
          priority: payload.severity >= 0.9 ? "high" : "medium",
        },
        {
          envelope: {
            correlationId: `suggestion:${msg.id}`,
            idempotencyKey: `suggestion-task:${msg.id}`,
            workspaceSlug,
            relayCommunityId: communityId,
            originEventId: msg.id,
            originChannelId: channelId,
            actorPubkey: currentPubkey,
            companyId,
          },
        },
      );
      const taskId = typeof task.task_id === "string" ? task.task_id : null;
      void recordGrowthTelemetry(
        "growth_task_created",
        {
          envelope: {
            correlationId: `suggestion:${msg.id}`,
            idempotencyKey: `suggestion-task-telemetry:${msg.id}`,
            workspaceSlug,
            relayCommunityId: communityId,
            actorPubkey: currentPubkey,
            companyId,
            originEventId: msg.id,
            originChannelId: channelId,
          },
        },
        { taskId, signalType: payload.signal_type },
      ).catch(() => {});
      setCreatedTaskId(taskId);
      if (taskId) {
        window.dispatchEvent(
          new CustomEvent("lenos:growth-open-task", { detail: { taskId } }),
        );
      }
    } catch (err) {
      try {
        await publishLegacyTaskRequest(
          msg,
          channelId,
          growthAgentPubkey,
          payload,
        );
        setLegacyQueued(true);
      } catch (fallbackError) {
        const message =
          err instanceof GrowthApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Task creation failed.";
        setCreateError(
          `${message} Legacy request also failed: ${fallbackError instanceof Error ? fallbackError.message : "try again."}`,
        );
      }
    } finally {
      setCreating(false);
    }
  };

  const openCreatedTask = () => {
    if (!createdTaskId) return;
    window.dispatchEvent(
      new CustomEvent("lenos:growth-open-task", {
        detail: { taskId: createdTaskId },
      }),
    );
  };

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      const deletion = await signNostrEvent(
        {
          kind: 5,
          content: "",
          tags: [["e", msg.id]],
        },
        { requireDurableSigner: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        deletion as Record<string, unknown>,
      );

      const feedback = await signNostrEvent(
        {
          kind: 9,
          content: JSON.stringify({
            action: "dismiss_suggestion",
            suggestion_event_id: msg.id,
            signal_type: payload.signal_type,
          }),
          tags: [
            ["h", channelId],
            ["p", growthAgentPubkey],
            ["t", "leng-suggestion-dismissed"],
            ["suggestion_event_id", msg.id],
            ["signal_type", payload.signal_type],
          ],
        },
        { requireDurableSigner: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        feedback as Record<string, unknown>,
      );
    } catch (err) {
      console.error("dismiss suggestion failed", err);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-orange-200 bg-orange-50/50 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/20">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${severityBadgeClass(payload.severity)}`}
          >
            {Math.round(payload.severity * 100)}% severity
          </span>
          <span className="text-xs capitalize text-black/40 dark:text-white/30">
            {payload.signal_type.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-sm font-medium text-black/90 dark:text-white/80">
          {payload.title}
        </p>
        <p className="text-xs leading-relaxed text-black/60 line-clamp-2 dark:text-white/50">
          {payload.description}
        </p>
        {payload.suggested_action && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            → {payload.suggested_action}
          </p>
        )}
        {(payload.why_this_business ||
          payload.whyThisBusinessExplanation ||
          payload.evidence_summary ||
          payload.evidenceSummary ||
          payload.missing_evidence?.length) && (
          <details className="mt-2 rounded-md border border-black/10 bg-white/40 px-2 py-1 text-xs dark:border-white/10 dark:bg-black/10">
            <summary className="cursor-pointer font-medium text-black/70 dark:text-white/70">
              Why this recommendation?
            </summary>
            <div className="mt-2 space-y-1.5 text-black/60 dark:text-white/55">
              {(payload.why_this_business ||
                payload.whyThisBusinessExplanation) && (
                <p>
                  <span className="font-medium">Why it fits:</span>{" "}
                  {payload.why_this_business ||
                    payload.whyThisBusinessExplanation}
                </p>
              )}
              {(payload.evidence_summary || payload.evidenceSummary) && (
                <p>
                  <span className="font-medium">Evidence:</span>{" "}
                  {payload.evidence_summary || payload.evidenceSummary}
                </p>
              )}
              {payload.missing_evidence?.length ? (
                <p>
                  <span className="font-medium">Evidence still missing:</span>{" "}
                  {payload.missing_evidence.join(", ")}
                </p>
              ) : null}
            </div>
          </details>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={creating}
          onClick={handleCreateTask}
          className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {creating
            ? "Creating…"
            : createdTaskId
              ? "Task created"
              : legacyQueued
                ? "Request sent"
                : "Create task"}
        </button>
        {createdTaskId && (
          <button
            type="button"
            onClick={openCreatedTask}
            className="rounded border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
          >
            Open in Work
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded border border-black/15 px-3 py-1 text-xs font-medium text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/50 dark:hover:bg-white/5"
        >
          Dismiss
        </button>
      </div>
      {createError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {createError}
        </p>
      )}
      {createdTaskId && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Task {createdTaskId} is ready in LenGrowth.
        </p>
      )}
      {legacyQueued && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          LenGrowth is handling this request through the compatibility path.
        </p>
      )}
    </div>
  );
}
