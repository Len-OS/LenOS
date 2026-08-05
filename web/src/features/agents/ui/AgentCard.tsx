import type { Agent } from "../useAgents";

interface Props {
  agent: Agent;
  onClick: () => void;
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

export function AgentCard({ agent, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-3 rounded-xl border border-black/10 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[#1e1e1e] dark:hover:bg-[#252525]"
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
            {initials(agent.name)}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#1e1e1e] ${STATUS_DOT[agent.status]}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-black dark:text-white">
            {agent.name}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">
            {agent.agentType}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            agent.status === "online"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : agent.status === "away"
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          {agent.status}
        </span>
      </div>
      {agent.description && (
        <p className="line-clamp-2 text-sm text-black/60 dark:text-white/60">
          {agent.description}
        </p>
      )}
      <p className="text-xs text-black/30 dark:text-white/30">
        Created {relativeTime(agent.createdAt)}
      </p>
    </button>
  );
}
