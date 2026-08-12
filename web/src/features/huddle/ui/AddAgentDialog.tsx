import { Bot } from "lucide-react";
import { useState } from "react";
import { useAgents } from "@/features/agents/useAgents";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { AgentAddResult } from "../lib/huddleAgents";

interface AddAgentDialogProps {
  parentChannelId: string;
  currentAgentPubkeys: string[];
  onAdd: (pubkey: string) => Promise<AgentAddResult>;
  onClose: () => void;
}

export function AddAgentDialog({
  parentChannelId,
  currentAgentPubkeys,
  onAdd,
  onClose,
}: AddAgentDialogProps) {
  const agents = useAgents(parentChannelId);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const available = agents.filter(
    (a) => a.status === "online" && !currentAgentPubkeys.includes(a.pubkey),
  );

  async function handleAdd(pubkey: string) {
    if (adding) return;
    setAdding(pubkey);
    setError(null);
    setWarning(null);
    try {
      const result = await onAdd(pubkey);
      if (result.parentError) {
        setWarning(
          `Added to huddle, but parent channel add failed: ${result.parentError}`,
        );
      } else {
        onClose();
      }
    } catch (e) {
      setError(
        `Failed to add agent: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[60vh] max-w-sm flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Add Agent to Huddle</DialogTitle>
          <DialogDescription>
            Select an online agent to join the huddle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {warning && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <span>{warning}</span>
              <button
                className="shrink-0 font-medium underline-offset-2 hover:underline"
                onClick={onClose}
                type="button"
              >
                Dismiss
              </button>
            </div>
          )}

          {available.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {agents.filter((a) => a.status === "online").length > 0
                ? "All online agents are already in this huddle."
                : "No online agents found."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {available.map((agent) => (
                <li key={agent.pubkey}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    disabled={adding === agent.pubkey}
                    onClick={() => void handleAdd(agent.pubkey)}
                    type="button"
                  >
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">
                      {agent.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      online
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-6 py-4">
          <Button className="w-full" onClick={onClose} variant="outline">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
