import { useState, useEffect } from "react";
import { Bot, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { Separator } from "@/shared/ui/separator";
import { Button } from "@/shared/ui/button";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import type { Agent } from "../useAgents";
import { AgentMemorySection } from "./AgentMemorySection";
import { AgentCredentialEditor } from "./AgentCredentialEditor";
import { PROVIDER_OPTIONS } from "../lib/providerCredentialConfig";

interface Props {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 dark:border-white/10">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-black/70 dark:text-white/70">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="ml-2 shrink-0 rounded p-1 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function AgentConfigDialog({ agent, open, onClose }: Props) {
  const [tab, setTab] = useState("overview");
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  const viewerIsOwner = currentPubkey === agent.pubkey;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <DialogTitle>{agent.name}</DialogTitle>
              <p className="text-xs text-black/40 dark:text-white/40">
                {agent.agentType} agent
              </p>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="space-y-3">
              {agent.description && (
                <p className="text-sm text-black/70 dark:text-white/70">
                  {agent.description}
                </p>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
                    Status
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-black/70 dark:text-white/70">
                    <span
                      className={[
                        "h-2 w-2 rounded-full",
                        agent.status === "online"
                          ? "bg-green-400"
                          : agent.status === "away"
                            ? "bg-yellow-400"
                            : "bg-gray-400",
                      ].join(" ")}
                    />
                    {agent.status}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
                    Type
                  </p>
                  <p className="mt-0.5 text-black/70 dark:text-white/70">
                    {agent.remote ? "Remote (LenGrowth)" : "Local"}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="config">
            <div className="space-y-2">
              <CopyField label="Agent ID" value={agent.id} />
              <CopyField label="Pubkey" value={agent.pubkey} />
              <CopyField label="Agent Type" value={agent.agentType} />
              <Separator />
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
                  LLM Provider
                </label>
                <select
                  value={selectedProvider ?? ""}
                  onChange={(e) =>
                    setSelectedProvider(e.target.value || null)
                  }
                  className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs text-black/70 dark:border-white/10 dark:text-white/70"
                >
                  <option value="">Select provider…</option>
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <AgentCredentialEditor
                agentDTag={agent.id}
                currentProvider={selectedProvider}
              />
            </div>
          </TabsContent>

          <TabsContent value="channels">
            <p className="text-sm text-black/30 dark:text-white/30">
              Channel assignments will appear here when configured.
            </p>
          </TabsContent>

          <TabsContent value="memory">
            <AgentMemorySection
              agentPubkey={agent.pubkey}
              viewerIsOwner={viewerIsOwner}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
