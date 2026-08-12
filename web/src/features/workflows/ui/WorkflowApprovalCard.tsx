import { useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { Button } from "@/shared/ui/button";
import { relativeTime } from "@/shared/lib/relative-time";

export const KIND_WORKFLOW_APPROVAL = 9091;

export interface PendingApproval {
  runId: string;
  workflowName: string;
  triggeredBy: string;
  createdAt: number;
  prompt?: string;
}

interface Props {
  approval: PendingApproval;
  onResolved: (runId: string) => void;
}

export function WorkflowApprovalCard({ approval, onResolved }: Props) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  const respond = async (decision: "approve" | "reject") => {
    setActing(decision);
    setError("");
    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_WORKFLOW_APPROVAL,
          content: "",
          tags: [
            ["e", approval.runId],
            ["decision", decision],
          ],
        },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      onResolved(approval.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit decision.");
      setActing(null);
    }
  };

  return (
    <div className="rounded-lg border border-yellow-300/60 bg-yellow-50/50 p-4 dark:border-yellow-700/40 dark:bg-yellow-950/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-black dark:text-white">
            Approval required
          </p>
          <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
            {approval.workflowName}
          </p>
          {approval.prompt && (
            <p className="mt-2 rounded-md bg-black/5 px-3 py-2 text-xs text-black/70 dark:bg-white/5 dark:text-white/70">
              {approval.prompt}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1 text-[11px] text-black/40 dark:text-white/40">
            <Clock className="h-3 w-3" />
            {relativeTime(approval.createdAt)}
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => void respond("approve")}
          disabled={acting !== null}
          className="flex-1 gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {acting === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void respond("reject")}
          disabled={acting !== null}
          className="flex-1 gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          <XCircle className="h-3.5 w-3.5" />
          {acting === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </div>
  );
}
