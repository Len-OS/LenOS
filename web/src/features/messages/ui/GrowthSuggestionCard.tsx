import { useState } from "react";
import type { Message } from "@/features/messages/use-messages";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface SuggestionPayload {
  signal_type: string;
  severity: number;
  title: string;
  description: string;
  suggested_action: string;
  expires_at: number;
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
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);
  const payload = parsePayload(msg.content);

  // The growth agent pubkey is the author of this suggestion event.
  const growthAgentPubkey = msg.pubkey;

  if (!payload || dismissed) return null;

  const handleCreateTask = async () => {
    if (creating) return;
    setCreating(true);
    try {
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
    } catch (err) {
      console.error("create task from suggestion failed", err);
    } finally {
      setCreating(false);
    }
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
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={creating}
          onClick={handleCreateTask}
          className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create task"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded border border-black/15 px-3 py-1 text-xs font-medium text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/50 dark:hover:bg-white/5"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
