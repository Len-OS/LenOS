import { useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function AgentDefaultsSettingsPanel() {
  const [model, setModel] = useState("claude-sonnet-5");
  const [maxTokens, setMaxTokens] = useState("4096");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Agent Defaults
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Default configuration for new agents in this workspace.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="agent-model"
            className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
          >
            Default Model
          </label>
          <select
            id="agent-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          >
            <option value="claude-sonnet-5">Claude Sonnet 5</option>
            <option value="claude-opus-5">Claude Opus 5</option>
            <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="agent-max-tokens"
            className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60"
          >
            Max Output Tokens
          </label>
          <input
            id="agent-max-tokens"
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
        </div>

        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-black/40 dark:text-white/40" />
            <p className="text-xs text-black/50 dark:text-white/50">
              These defaults apply to agents created via the web interface.
              Desktop app agents use their own configuration.
            </p>
          </div>
        </div>
      </div>

      <Button size="sm">Save Defaults</Button>
    </div>
  );
}
