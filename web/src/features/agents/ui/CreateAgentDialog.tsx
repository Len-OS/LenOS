import { useState } from "react";
import { Bot, X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { isDesktopApp } from "@/shared/lib/platform";
import { DesktopRequiredCard } from "@/shared/ui/DesktopRequiredCard";

export function CreateAgentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: { name: string; pubkey: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const agentId = crypto.randomUUID();
      const event = await signNostrEvent({
        kind: 30177,
        content: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          agent_type: "remote",
          status: "online",
          remote: true,
        }),
        tags: [
          ["d", agentId],
          ["name", name.trim()],
          ["about", description.trim()],
          ["agent_type", "remote"],
          ["status", "online"],
        ],
      });

      await getRelayClient(relayWsUrl()).publishAndWait(
        event as Record<string, unknown>,
      );

      onCreated({ name: name.trim(), pubkey: agentId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-900">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5 text-black/60 dark:text-white/60" />
          <h2 className="text-base font-semibold text-black dark:text-white">
            Create Agent
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="agent-name"
              className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Name *
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Analytics Reporter"
              maxLength={64}
              className="w-full rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-white/20"
            />
          </div>

          <div>
            <label
              htmlFor="agent-description"
              className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Description
            </label>
            <textarea
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              rows={3}
              maxLength={256}
              className="w-full rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-white/20"
            />
          </div>

          {!isDesktopApp() && (
            <DesktopRequiredCard
              feature="Local agent execution"
              description="Local agents run on your machine and can access your files, shell, and dev tools. Remote agents run through LenGrowth and are available from any browser."
            />
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              {submitting ? "Creating…" : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
