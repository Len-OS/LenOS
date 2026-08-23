import { Settings2 } from "lucide-react";

import type { Agent } from "../useAgents";
import { AgentReadinessBadge } from "./AgentReadinessBadge";

interface Props {
  agent: Agent;
  onConfigure?: () => void;
}

const STATUS_DOT: Record<Agent["status"], string> = {
  online: "bg-green-500",
  away: "bg-yellow-400",
  offline: "bg-gray-400",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function relativeTime(unix: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unix;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function AgentMemberCard({ agent, onConfigure }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="relative shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
          {initials(agent.name)}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1e1e1e] ${STATUS_DOT[agent.status]}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-black dark:text-white">
            {agent.name}
          </span>
          {agent.remote && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              Remote LenGrowth agent
            </span>
          )}
        </div>
        <p className="text-xs text-black/40 dark:text-white/40">
          {agent.agentType}
        </p>
        <AgentReadinessBadge agentDTag={agent.id} onConfigure={onConfigure} />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="text-xs text-black/30 dark:text-white/30">
          {relativeTime(agent.createdAt)}
        </p>
        {onConfigure && (
          <button
            type="button"
            onClick={onConfigure}
            className="rounded-md p-1 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Configure agent"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
