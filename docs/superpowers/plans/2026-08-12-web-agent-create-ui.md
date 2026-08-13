# Web Agent Create UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Create Agent" button to the web `AgentsPage` so users can define and publish a new agent (kind:30177) directly from the browser.

**Architecture:** A new `CreateAgentDialog` component handles the form (name, description, agent type). On submit it publishes a kind:30177 Nostr event using the same `signNostrEvent` + `publishAndWait` pattern as `starterWorkspace.ts`. The dialog is triggered from a button in the `AgentsPage` header.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `signNostrEvent` + `getRelayClient` utilities, kind:30177 (agent definition event)

## Global Constraints

- Use the existing `signNostrEvent` helper and `getRelayClient(relayWsUrl()).publishAndWait(...)` pattern — do not introduce new publish helpers.
- `d` tag (the agent's stable identifier) must be a UUID — use `crypto.randomUUID()`.
- No new dependencies.
- The component must work without NIP-07 extension installed — show a user-friendly error if `window.nostr` is absent.
- Run `pnpm -F web lint` and `pnpm -F web typecheck` before committing.

---

### Task 1: Create `CreateAgentDialog` component

**Files:**
- Create: `web/src/features/agents/ui/CreateAgentDialog.tsx`
- Test: visual test — open the dialog in the browser and verify form fields appear

**Interfaces:**
- Produces: `CreateAgentDialog({ open: boolean, onClose: () => void, onCreated: (agent: { name: string, pubkey: string }) => void })`

- [ ] **Step 1: Create the file with a minimal stub that renders nothing**

```tsx
// web/src/features/agents/ui/CreateAgentDialog.tsx
export function CreateAgentDialog(_props: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: { name: string; pubkey: string }) => void;
}) {
  return null;
}
```

- [ ] **Step 2: Run typecheck to verify the stub compiles**

```
pnpm -F web typecheck
```

Expected: no errors related to the new file.

- [ ] **Step 3: Implement the full dialog**

Replace the stub with:

```tsx
import { useState } from "react";
import { Bot, X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/sign-nostr-event";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const AGENT_TYPES = [
  { value: "remote", label: "Remote (LenGrowth managed)" },
  { value: "local", label: "Local (runs in this browser)" },
];

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
  const [agentType, setAgentType] = useState("remote");
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

    if (!window.nostr) {
      setError(
        "No NIP-07 extension found. Install a Nostr signer (e.g. Alby, nos2x) to create agents.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const agentPubkey = crypto.randomUUID();
      const event = await signNostrEvent(
        {
          kind: 30177,
          content: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            agent_type: agentType,
            status: "online",
            remote: agentType !== "local",
          }),
          tags: [
            ["d", agentPubkey],
            ["name", name.trim()],
            ["about", description.trim()],
            ["agent_type", agentType],
            ["status", "online"],
          ],
        },
        { requireNip07: true },
      );

      await getRelayClient(relayWsUrl()).publishAndWait(
        event as Record<string, unknown>,
      );

      onCreated({ name: name.trim(), pubkey: agentPubkey });
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

          <div>
            <label
              htmlFor="agent-type"
              className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60"
            >
              Type
            </label>
            <select
              id="agent-type"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-white/20"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

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
```

- [ ] **Step 4: Run typecheck**

```
pnpm -F web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/agents/ui/CreateAgentDialog.tsx
git commit -m "feat(web/agents): add CreateAgentDialog component"
```

---

### Task 2: Wire `CreateAgentDialog` into `AgentsPage`

**Files:**
- Modify: `web/src/features/agents/ui/AgentsPage.tsx`

**Interfaces:**
- Consumes: `CreateAgentDialog({ open, onClose, onCreated })` from Task 1

- [ ] **Step 1: Write the expected final render structure as a comment**

Before editing, add this comment to `AgentsPage.tsx` as your target:

```tsx
// Target: header row has <span>Agents</span> + count badge + <button>Create</button>
// Clicking Create opens CreateAgentDialog.
// onCreated closes dialog (handled inside CreateAgentDialog via onClose).
```

- [ ] **Step 2: Update `AgentsPage` to add the Create button and dialog**

Replace `web/src/features/agents/ui/AgentsPage.tsx` entirely:

```tsx
import { useState } from "react";
import { Bot, Plus } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useAgents, type Agent } from "../useAgents";
import { AgentCard } from "./AgentCard";
import { AgentTranscriptViewer } from "./AgentTranscriptViewer";
import { AgentConfigDialog } from "./AgentConfigDialog";
import { CreateAgentDialog } from "./CreateAgentDialog";

export function AgentsPage() {
  const communityId = useCommunityId();
  const agents = useAgents(communityId);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
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

      {selectedAgent && (
        <AgentTranscriptViewer
          agentPubkey={selectedAgent.pubkey}
          agentName={selectedAgent.name}
          onClose={() => setSelectedAgent(null)}
        />
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
```

- [ ] **Step 3: Run lint + typecheck**

```
pnpm -F web lint
pnpm -F web typecheck
```

Expected: clean.

- [ ] **Step 4: Open in browser and test the golden path**

Start dev server:
```
pnpm -F web dev
```

1. Navigate to the Agents page.
2. Click "Create".
3. Fill in Name = "Test Bot", Description = "A test", Type = Remote.
4. Click "Create Agent".
5. Expected: dialog closes and the new agent appears in the list within ~2 seconds (via the kind:30177 subscription in `useAgents`).

Also test: blank name → shows "Name is required." error without submitting.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/agents/ui/AgentsPage.tsx
git commit -m "feat(web/agents): wire Create button and CreateAgentDialog into AgentsPage"
```
