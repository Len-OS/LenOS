import { X, Lock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useAgentSessions } from "../useAgentSessions";
import { useAgentTranscript } from "../useAgentTranscript";
import { AgentActivityRow } from "./AgentActivityRow";
import { relativeTime } from "@/shared/lib/relative-time";

interface Props {
  agentPubkey: string;
  agentName: string;
  onClose: () => void;
}

export function AgentTranscriptViewer({
  agentPubkey,
  agentName,
  onClose,
}: Props) {
  const sessions = useAgentSessions(agentPubkey);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  const activeSessionId = selectedSessionId ?? sessions[0]?.id ?? null;
  const { frames, isLoading } = useAgentTranscript(activeSessionId);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="truncate font-semibold text-black dark:text-white">
          {agentName}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="shrink-0 border-b border-black/10 px-4 py-2 dark:border-white/10">
          <label
            htmlFor="session-select"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40"
          >
            Session
          </label>
          <div className="relative">
            <select
              id="session-select"
              value={activeSessionId ?? ""}
              onChange={(e) => setSelectedSessionId(e.target.value || null)}
              className="w-full appearance-none rounded-md border border-black/10 bg-transparent py-1.5 pl-2.5 pr-7 font-mono text-xs text-black/70 dark:border-white/10 dark:text-white/70"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 16)}… · {relativeTime(s.createdAt)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/40 dark:text-white/40" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-black/30 dark:text-white/30">
            No sessions recorded
          </p>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 w-full animate-pulse rounded-lg bg-black/5 dark:bg-white/5"
              />
            ))}
          </div>
        ) : frames.length === 0 ? (
          <div className="m-4 flex items-start gap-2 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
            <p className="text-xs text-black/50 dark:text-white/50">
              Observer transcripts are encrypted end-to-end. Full session
              transcripts are available in the LenOS desktop app.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {frames.map((frame) => (
              <AgentActivityRow
                key={frame.id}
                type={frame.type}
                content={frame.content}
                timestamp={frame.timestamp}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
