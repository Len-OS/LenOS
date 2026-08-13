import { useState } from "react";
import { Bot, Plus } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useAgents, type Agent } from "../useAgents";
import { AgentCard } from "./AgentCard";
import { AgentMemorySection } from "./AgentMemorySection";
import { AgentTranscriptViewer } from "./AgentTranscriptViewer";
import { AgentConfigDialog } from "./AgentConfigDialog";
import { CreateAgentDialog } from "./CreateAgentDialog";

type AgentPanelTab = "activity" | "memory";

export function AgentsPage() {
  const communityId = useCommunityId();
  const agents = useAgents(communityId);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [panelTab, setPanelTab] = useState<AgentPanelTab>("activity");
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Bot className="h-10 w-10 text-black/20 dark:text-white/20" />
              <div>
                <p className="text-sm font-medium text-black/50 dark:text-white/50">
                  No agents in this workspace yet
                </p>
                <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                  Your LenGrowth team will appear here as soon as your workspace
                  is ready, or create one above.
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
                  onConfigure={() => setConfigAgent(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedAgent && panelTab === "activity" && (
        <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-black/10 dark:border-white/10">
          <div className="flex h-8 shrink-0 items-center border-b border-black/10 dark:border-white/10">
            {(["activity", "memory"] as AgentPanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPanelTab(tab)}
                className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                  panelTab === tab
                    ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                    : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <AgentTranscriptViewer
            agentPubkey={selectedAgent.pubkey}
            agentName={selectedAgent.name}
            onClose={() => setSelectedAgent(null)}
          />
        </div>
      )}
      {selectedAgent && panelTab === "memory" && (
        <div className="flex w-80 shrink-0 flex-col border-l border-black/10 dark:border-white/10">
          <div className="flex h-8 shrink-0 items-center border-b border-black/10 dark:border-white/10">
            {(["activity", "memory"] as AgentPanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPanelTab(tab)}
                className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
                  panelTab === tab
                    ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                    : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <AgentMemorySection
              agentPubkey={selectedAgent.pubkey}
              viewerIsOwner
            />
          </div>
        </div>
      )}

      {configAgent && (
        <AgentConfigDialog
          agent={configAgent}
          open
          onClose={() => setConfigAgent(null)}
        />
      )}

      <CreateAgentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setCreateOpen(false)}
      />
    </div>
  );
}
