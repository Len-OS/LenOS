import { useState } from "react";
import { Bot } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useAgents, type Agent } from "../useAgents";
import { AgentCard } from "./AgentCard";
import { AgentSessionPanel } from "./AgentSessionPanel";

export function AgentsPage() {
  const communityId = useCommunityId();
  const agents = useAgents(communityId);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
          <Bot className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
          <span className="font-semibold text-black dark:text-white">
            Agents
          </span>
          {agents.length > 0 && (
            <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
              {agents.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Bot className="h-10 w-10 text-black/20 dark:text-white/20" />
              <div>
                <p className="text-sm font-medium text-black/50 dark:text-white/50">
                  No agents deployed
                </p>
                <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                  Deploy agents from the LenOS desktop app.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.pubkey}
                  agent={agent}
                  onClick={() =>
                    setSelectedAgent((prev) =>
                      prev?.pubkey === agent.pubkey ? null : agent,
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedAgent && (
        <div className="w-80 shrink-0">
          <AgentSessionPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        </div>
      )}
    </div>
  );
}
