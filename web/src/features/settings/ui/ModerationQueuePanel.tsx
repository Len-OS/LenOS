import { useCallback, useEffect, useState } from "react";
import { Shield, Ban, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useCommunityId } from "@/shared/lib/workspace-context";
import {
  KIND_REPORT,
  KIND_MODERATION_BAN,
  KIND_MODERATION_TIMEOUT,
  KIND_MODERATION_RESOLVE_REPORT,
} from "@/shared/constants/kinds";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { useProfile } from "@/features/profiles/use-profile";
import { Button } from "@/shared/ui/button";

interface Report {
  id: string;
  reporter: string;
  target: string;
  reportedEventId: string | null;
  reason: string;
  content: string;
  createdAt: number;
}

type ModerationKind =
  | typeof KIND_MODERATION_BAN
  | typeof KIND_MODERATION_TIMEOUT
  | typeof KIND_MODERATION_RESOLVE_REPORT;

function ReportRow({
  report,
  communityId,
  onAction,
}: {
  report: Report;
  communityId: string;
  onAction: (reportId: string) => void;
}) {
  const reporterProfile = useProfile(report.reporter);
  const targetProfile = useProfile(report.target);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reporterName =
    reporterProfile?.name ?? `${report.reporter.slice(0, 8)}…`;
  const targetName = targetProfile?.name ?? `${report.target.slice(0, 8)}…`;

  const act = async (kind: ModerationKind, label: string) => {
    setActing(label);
    setError("");
    try {
      const tags: string[][] = [
        ["p", report.target],
        ["e", report.id],
        ["h", communityId],
      ];
      if (report.reportedEventId) tags.push(["e", report.reportedEventId]);

      const signed = await signNostrEvent(
        { kind, content: "", tags },
        { requireNip07: true },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
      onAction(report.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-black dark:text-white">
              {targetName}
            </span>
            <span className="text-xs text-black/40 dark:text-white/40">
              reported by {reporterName}
            </span>
          </div>
          {report.reason && (
            <p className="mt-0.5 text-xs font-medium text-black/50 dark:text-white/50">
              Reason: {report.reason}
            </p>
          )}
          {report.content && (
            <p className="mt-1 line-clamp-2 text-xs text-black/60 dark:text-white/60">
              {report.content}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!acting}
              onClick={() => void act(KIND_MODERATION_TIMEOUT, "timeout")}
            >
              <Clock className="h-3 w-3" />
              {acting === "timeout" ? "Acting…" : "Timeout"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!acting}
              onClick={() => void act(KIND_MODERATION_BAN, "ban")}
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              <Ban className="h-3 w-3" />
              {acting === "ban" ? "Acting…" : "Ban"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!acting}
              onClick={() =>
                void act(KIND_MODERATION_RESOLVE_REPORT, "resolve")
              }
            >
              <CheckCircle className="h-3 w-3" />
              {acting === "resolve" ? "Resolving…" : "Dismiss"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModerationQueuePanel() {
  const communityId = useCommunityId();
  const [reports, setReports] = useState<Report[]>([]);

  const handleAction = useCallback((reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }, []);

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 86400 * 30;

    const unsub = client.subscribe({
      id: `mod-queue-${communityId}`,
      filter: {
        kinds: [KIND_REPORT],
        "#h": [communityId],
        since,
        limit: 50,
      },
      onEvent: (raw) => {
        const id = raw.id as string;
        const tags = (raw.tags as string[][]) ?? [];
        const target = tags.find((t) => t[0] === "p")?.[1] ?? "";
        const reportedEventId = tags.find((t) => t[0] === "e")?.[1] ?? null;
        const reason = tags.find((t) => t[0] === "report")?.[1] ?? "";
        if (!target) return;
        const report: Report = {
          id,
          reporter: raw.pubkey as string,
          target,
          reportedEventId,
          reason,
          content: raw.content as string,
          createdAt: raw.created_at as number,
        };
        setReports((prev) => {
          if (prev.some((r) => r.id === id)) return prev;
          return [report, ...prev];
        });
      },
    });

    return () => {
      unsub();
      setReports([]);
    };
  }, [communityId]);

  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt);

  if (!communityId) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Moderation Queue
        </h3>
        <p className="text-sm text-black/40 dark:text-white/40">
          No workspace connected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Moderation Queue
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Reports from workspace members. Admin access required to take action.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-black/10 py-10 text-center dark:border-white/10">
          <Shield className="h-8 w-8 text-black/20 dark:text-white/20" />
          <p className="text-sm text-black/40 dark:text-white/40">
            No pending reports
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              communityId={communityId}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
