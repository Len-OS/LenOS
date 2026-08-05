import { X, Lock } from "lucide-react";
import { useAgentSessions } from "../useAgentSessions";
import type { Agent } from "../useAgents";

interface Props {
  agent: Agent;
  onClose: () => void;
}

function relativeTime(unix: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unix;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function AgentSessionPanel({ agent, onClose }: Props) {
  const sessions = useAgentSessions(agent.pubkey);

  return (
    <div className="flex h-full flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          {agent.name}
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

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
          <p className="text-xs text-black/50 dark:text-white/50">
            Observer transcripts are encrypted end-to-end. Full session
            transcripts are available in the LenOS desktop app.
          </p>
        </div>

        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-black/30 dark:text-white/30">
            No sessions recorded
          </p>
        ) : (
          <div className="space-y-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
              Recent Sessions ({sessions.length})
            </p>
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-black/10 p-3 dark:border-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-black/50 dark:text-white/50">
                    {session.id.slice(0, 16)}…
                  </span>
                  <span className="shrink-0 text-xs text-black/30 dark:text-white/30">
                    {relativeTime(session.createdAt)}
                  </span>
                </div>
                {session.channelId && (
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                    Channel: {session.channelId.slice(0, 12)}…
                  </p>
                )}
                {session.model && (
                  <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                    Model: {session.model}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
