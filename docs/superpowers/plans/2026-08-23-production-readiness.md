# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all NIP-07 extension hard requirements, add systematic desktop-required UX gating, and fill every confirmed documentation gap so LenOS web is launchable without asking users to install anything outside the app.

**Architecture:** Web users authenticate via managed-Nostr (LenGrowth-issued session token in URL) or local nsec — no browser extension needed. Desktop-only capabilities surface a download CTA + deep link instead of silently failing. Documentation gaps become first-class markdown files in `docs/`.

**Tech Stack:** React 19, TypeScript, nostr-tools, Tailwind CSS, TanStack Router

**Spec:** `docs/STATUS.md` — confirmed gaps section; prior analysis in this conversation

## Global Constraints

- Never add `requireNip07: true` to new signing calls — use `requireDurableSigner: true` (renamed option, Task 1.2)
- All new UI components: Tailwind only, no inline styles, follow existing dark-mode pattern (`dark:...`)
- New docs: markdown only, no frontmatter unless the file already uses it
- No external dependencies beyond what is already in `web/package.json`
- `just ci` must pass after every phase

---

## Phase 1 — Code Bugs (P0)

### Task 1.1: Fix `CreateAgentDialog` — Remove Manual NIP-07 Gate

The only hard NIP-07 requirement in the codebase is a manual `!window.nostr` check that bypasses the `signNostrEvent` cascade. Users with a managed-Nostr session or a local nsec cannot create agents. Also fixes misleading `agentPubkey` variable name (it's a UUID d-tag identifier, not a Nostr public key).

**Files:**
- Modify: `web/src/features/agents/ui/CreateAgentDialog.tsx`

**Interfaces:**
- Consumes: `signNostrEvent` from `@/shared/lib/nostr-signer` (already imported)
- Produces: no interface changes — `onCreated({ name, pubkey })` signature unchanged (pubkey field carries the d-tag UUID, renamed internally only)

- [ ] **Step 1: Read current file**

  Verify lines 32–38 contain the manual `!window.nostr` guard and line 60 has `{ requireNip07: true }`.

  ```bash
  grep -n "window.nostr\|requireNip07\|agentPubkey\|agentId" web/src/features/agents/ui/CreateAgentDialog.tsx
  ```

  Expected output includes lines 32, 38, 42, 60, 67.

- [ ] **Step 2: Remove manual NIP-07 guard and fix variable name**

  In `web/src/features/agents/ui/CreateAgentDialog.tsx`:

  Remove lines 32–38 (the entire `if (!window.nostr)` block):
  ```ts
  // DELETE THIS BLOCK:
  if (!window.nostr) {
    setError(
      "No NIP-07 extension found. Install a Nostr signer (e.g. Alby, nos2x) to create agents.",
    );
    return;
  }
  ```

  Rename `agentPubkey` to `agentId` (2 occurrences: declaration on line 42, usage on line 67):
  ```ts
  // BEFORE:
  const agentPubkey = crypto.randomUUID();
  // ...
  onCreated({ name: name.trim(), pubkey: agentPubkey });

  // AFTER:
  const agentId = crypto.randomUUID();
  // ...
  onCreated({ name: name.trim(), pubkey: agentId });
  ```

  Change `{ requireNip07: true }` to `{}` on the `signNostrEvent` call (line 60):
  ```ts
  // BEFORE:
  const event = await signNostrEvent(
    { kind: 30177, content: JSON.stringify({...}), tags: [...] },
    { requireNip07: true },
  );

  // AFTER:
  const event = await signNostrEvent(
    { kind: 30177, content: JSON.stringify({...}), tags: [...] },
  );
  ```

  Update the info note text (the `<p>` about "local agents") — it was the only copy referring to "Local agents... require the LenOS desktop app". Keep it — it's accurate — but update the first sentence since we no longer restrict based on NIP-07:
  ```tsx
  // BEFORE first sentence:
  // "Remote (LenGrowth managed) — agents run through LenGrowth and are accessible from any browser."

  // AFTER (no change needed to first sentence, it's already correct)
  // Just ensure the error state can no longer be triggered by missing NIP-07.
  ```

- [ ] **Step 3: Verify the build passes**

  ```bash
  cd web && pnpm tsc --noEmit
  ```

  Expected: 0 errors for `CreateAgentDialog.tsx`. If type errors appear on `agentId`, grep for any remaining `agentPubkey` references.

- [ ] **Step 4: Commit**

  ```bash
  git add web/src/features/agents/ui/CreateAgentDialog.tsx
  git commit -m "fix(web): remove hard NIP-07 gate from CreateAgentDialog

  Managed-signer and local-nsec users can now create agents without
  installing a browser extension. The manual window.nostr check bypassed
  the signNostrEvent cascade; removing it lets all three signer paths work.
  Rename agentPubkey → agentId (it is a UUID d-tag, not a Nostr pubkey)."
  ```

---

### Task 1.2: Rename `requireNip07` → `requireDurableSigner` (Clarity)

`requireNip07: true` actually works for managed-signer and local-nsec users — it only rejects ephemeral keys. The name is a lie and misleads future devs. Rename the option and the error class. All existing `requireNip07: true` callers remain correct in intent.

**Files:**
- Modify: `web/src/shared/lib/nostr-signer.ts`
- Modify: `web/src/shared/lib/nip98.ts`
- Modify (bulk rename): all 20+ files that use `requireNip07`

**Interfaces:**
- Produces: `signNostrEvent(template, { requireDurableSigner?: boolean })`
- Produces: `DurableSignerRequiredError` (replaces `Nip07UnavailableError`)
- Both old name still exported as deprecated aliases to avoid breaking anything during migration

- [ ] **Step 1: Update `nostr-signer.ts`**

  ```ts
  // Replace class name:
  export class DurableSignerRequiredError extends Error {
    constructor() {
      super("Sign in to LenGrowth or import a key to perform this action.");
      this.name = "DurableSignerRequiredError";
    }
  }
  // Keep deprecated alias for any external consumers:
  /** @deprecated Use DurableSignerRequiredError */
  export const Nip07UnavailableError = DurableSignerRequiredError;

  // Replace option name in signNostrEvent signature:
  export async function signNostrEvent(
    template: Omit<UnsignedNostrEvent, "created_at"> & { created_at?: number },
    options?: { requireDurableSigner?: boolean; requireNip07?: boolean },
  ): Promise<SignedNostrEvent> {
    // ...
    // Replace the check:
    if (options?.requireDurableSigner || options?.requireNip07) {
      throw new DurableSignerRequiredError();
    }
    // ...
  }
  ```

- [ ] **Step 2: Update `nip98.ts`**

  In `web/src/shared/lib/nip98.ts`, update the `requireNip07` forward:
  ```ts
  // BEFORE:
  options?: { body?: string; requireNip07?: boolean },
  // ...
  { requireNip07: options?.requireNip07 },

  // AFTER:
  options?: { body?: string; requireDurableSigner?: boolean; requireNip07?: boolean },
  // ...
  { requireDurableSigner: options?.requireDurableSigner ?? options?.requireNip07 },
  ```

- [ ] **Step 3: Bulk-rename callers (pass `requireDurableSigner: true`)**

  Run in `web/src/`:
  ```bash
  grep -rl "requireNip07: true" web/src/ | grep -v "nostr-signer\|nip98"
  ```

  For each file returned, change `{ requireNip07: true }` → `{ requireDurableSigner: true }`.
  Files include (based on grep output):
  - `useCreateInvite.ts`, `CommunitySettingsModal.tsx`, `invite-api.ts`
  - `useTypingState.ts`, `useMessageActions.ts`, `useDrafts.ts`
  - `ForumComposer.tsx`, `WorkflowFormBuilder.tsx`, `WorkflowCard.tsx`, `WorkflowApprovalCard.tsx`
  - `useChannelMutations.ts`, `starterWorkspace.ts`
  - `GrowthSuggestionCard.tsx`, `MessageComposer.tsx`, `RemindersPage.tsx`
  - `SetReminderPopover.tsx`, `ThreadPanel.tsx`, `ProfileSettingsPanel.tsx`
  - `MessageReactions.tsx`, `useModerationActions.ts`, `ModerationQueuePanel.tsx`

  Leave `requireNip07: false` callers alone — those already work with ephemeral keys and don't need renaming.

- [ ] **Step 4: Verify build**

  ```bash
  cd web && pnpm tsc --noEmit
  ```

  Expected: 0 errors.

- [ ] **Step 5: Commit**

  ```bash
  git add web/src/shared/lib/nostr-signer.ts web/src/shared/lib/nip98.ts
  git add $(git diff --name-only -- 'web/src/features/**/*.ts' 'web/src/features/**/*.tsx')
  git commit -m "refactor(web): rename requireNip07 → requireDurableSigner

  The option has never required NIP-07 specifically — it blocks only
  ephemeral keys and works with managed-signer and local-nsec. Rename
  removes false implication. Nip07UnavailableError kept as deprecated alias."
  ```

---

## Phase 2 — Onboarding: Zero-Extension Path

### Task 2.1: Clarify `IdentityStep` "Connect with LenGrowth" for Standalone Users

For LenGrowth users the identity step is never shown (managed token arrives in URL before the gate is evaluated). For standalone/self-hosted users the "Connect with LenGrowth" button currently calls `onComplete()` without setting an identity — the ephemeral key is used until `WebBackupStep` saves an nsec. The button label implies an external redirect that doesn't happen.

**Files:**
- Modify: `web/src/features/onboarding/ui/IdentityStep.tsx`

- [ ] **Step 1: Rename "Connect with LenGrowth" for standalone context**

  Change the first button's label and description so it accurately describes "create a new local key":

  ```tsx
  // BEFORE:
  <span className="text-sm font-semibold ...">Connect with LenGrowth</span>
  <p className="...">Your key stays encrypted on LenGrowth servers. No setup required.</p>

  // AFTER:
  <span className="text-sm font-semibold ...">Create a new identity</span>
  <p className="...">Generate a key now. You can back it up with a password — no extension needed.</p>
  ```

  Keep the `Sparkles` icon and all other styles unchanged.

- [ ] **Step 2: Verify onboarding flow in the web dev server**

  ```bash
  just web-dev
  ```

  Open `http://localhost:5173`, clear localStorage, confirm the identity step shows three options with updated copy. Navigate through the full flow (create identity → avatar → backup → done). Confirm `hasDurableIdentity()` returns true after backup step completes.

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/features/onboarding/ui/IdentityStep.tsx
  git commit -m "fix(web): rename 'Connect with LenGrowth' to 'Create a new identity' in onboarding

  For standalone users this button never triggered a LenGrowth redirect —
  it advanced to the key-generation backup flow. Rename matches the actual behavior."
  ```

---

### Task 2.2: Improve `DurableSignerRequiredError` User Messaging

When a user with an ephemeral session tries to perform a write that requires a durable identity, they see an error. The error must direct them to the correct recovery path (LenGrowth login OR import key), not tell them to install an extension.

**Files:**
- Modify: `web/src/shared/lib/nostr-signer.ts` (already updated in Task 1.2)
- Modify: any component that catches `DurableSignerRequiredError`/`Nip07UnavailableError` and shows a hardcoded "install extension" message

- [ ] **Step 1: Search for hardcoded extension install messages**

  ```bash
  grep -rn "Alby\|nos2x\|NIP-07 extension\|nip-07 extension\|nip07" web/src/features --include="*.tsx" --include="*.ts"
  ```

- [ ] **Step 2: Update any hardcoded fallback messages**

  For each match that suggests installing a browser extension as the resolution:

  ```tsx
  // BEFORE (any component showing this):
  "No NIP-07 extension found. Install a Nostr signer (e.g. Alby, nos2x)..."

  // AFTER:
  "You need a durable identity to do this. Sign in through LenGrowth or import a key in Settings → Identity."
  ```

  `IdentityStep.tsx` may still list Alby/nos2x as one option — that is fine (it is a valid option). Only remove it as the ONLY option presented on error.

- [ ] **Step 3: Commit**

  ```bash
  git add -p  # stage only the error message changes
  git commit -m "fix(web): update DurableSignerRequiredError messages to not require NIP-07

  Extension is one option, not the only option. Error messages now direct
  to LenGrowth or key import as the primary recovery path."
  ```

---

## Phase 3 — Desktop-Required UX Gating

### Task 3.1: Platform Detection Utility

**Files:**
- Create: `web/src/shared/lib/platform.ts`

- [ ] **Step 1: Create `platform.ts`**

  ```ts
  // web/src/shared/lib/platform.ts

  /**
   * Returns true when running inside the Tauri desktop shell.
   * window.__TAURI_INTERNALS__ is injected by Tauri 2 on all webview pages.
   */
  export function isDesktopApp(): boolean {
    return (
      typeof window !== "undefined" &&
      (window as Record<string, unknown>).__TAURI_INTERNALS__ != null
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd web && pnpm tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/shared/lib/platform.ts
  git commit -m "feat(web): add isDesktopApp() platform detection utility"
  ```

---

### Task 3.2: `DesktopRequiredCard` Component

Displays when a user on the web app attempts a feature that needs the local Tauri shell (local agents, dev MCP tools, lenos-dev-mcp shell access). Shows what the feature does and offers a download link.

**Files:**
- Create: `web/src/shared/ui/DesktopRequiredCard.tsx`

- [ ] **Step 1: Create the component**

  ```tsx
  // web/src/shared/ui/DesktopRequiredCard.tsx
  import { Monitor } from "lucide-react";

  interface Props {
    /** Short label: what the user was trying to do. e.g. "Local agent execution" */
    feature: string;
    /** One sentence explaining what the desktop app enables for this feature. */
    description?: string;
  }

  export function DesktopRequiredCard({ feature, description }: Props) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mt-0.5 shrink-0 rounded-lg bg-black/5 p-2 dark:bg-white/5">
          <Monitor className="h-5 w-5 text-black/50 dark:text-white/50" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black dark:text-white">
            {feature} requires the LenOS desktop app
          </p>
          {description && (
            <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">
              {description}
            </p>
          )}
          <a
            href="https://lengrowth.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Download LenOS desktop
          </a>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify build**

  ```bash
  cd web && pnpm tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/shared/ui/DesktopRequiredCard.tsx
  git commit -m "feat(web): add DesktopRequiredCard component for desktop-only features"
  ```

---

### Task 3.3: Wire `DesktopRequiredCard` into `CreateAgentDialog`

When a web user tries to select "local" agent type, show `DesktopRequiredCard` instead of an error. The remote (LenGrowth managed) path remains fully available.

**Files:**
- Modify: `web/src/features/agents/ui/CreateAgentDialog.tsx`

- [ ] **Step 1: Identify local-agent detection surface**

  Currently `CreateAgentDialog` only creates `remote` agents — the info note says local agents require desktop. The note is already correct (added in U-08). The fix is to make the note look like `DesktopRequiredCard` for visual consistency rather than a plain paragraph.

  Replace the current `<div>` info note (the block starting `<div className="rounded-lg border...">`) with:

  ```tsx
  import { isDesktopApp } from "@/shared/lib/platform";
  import { DesktopRequiredCard } from "@/shared/ui/DesktopRequiredCard";

  // Inside the form, replace the plain info note:
  {!isDesktopApp() && (
    <DesktopRequiredCard
      feature="Local agent execution"
      description="Local agents run on your machine and can access your files, shell, and dev tools. Remote agents run through LenGrowth and are available from any browser."
    />
  )}
  ```

- [ ] **Step 2: Verify UI looks correct in web dev server**

  ```bash
  just web-dev
  ```

  Open the Create Agent dialog on web — should see the `DesktopRequiredCard` instead of the old plain paragraph. Remote agent creation must still work end-to-end.

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/features/agents/ui/CreateAgentDialog.tsx
  git commit -m "feat(web): replace plain local-agent note with DesktopRequiredCard

  Consistent gating pattern. DesktopRequiredCard shows on web; desktop app
  shows nothing (no gate needed). Remote agent creation unaffected."
  ```

---

### Task 3.4: Audit Other Desktop-Only Surfaces

Check remaining surfaces where desktop-only features exist on web without a clear CTA.

**Files:**
- Modify: any surface identified by the grep below

- [ ] **Step 1: Find surfaces that reference desktop or Tauri**

  ```bash
  grep -rn "desktop app\|tauri\|local agent\|lenos-dev-mcp\|sprig" \
    web/src/features --include="*.tsx" -l
  ```

- [ ] **Step 2: For each file found, add `DesktopRequiredCard` where applicable**

  Pattern: any feature or button that silently fails or shows a plain text note about needing desktop. Replace with `DesktopRequiredCard` for visual consistency. Remote/web alternatives (if they exist) must remain accessible alongside the card.

- [ ] **Step 3: Verify build and commit per file**

  ```bash
  cd web && pnpm tsc --noEmit
  git add <file>
  git commit -m "feat(web): add DesktopRequiredCard to <feature name>"
  ```

---

## Phase 4 — Documentation

### Task 4.1: Agent Capabilities Guide

**Files:**
- Create: `docs/AGENT-GUIDE.md`

- [ ] **Step 1: Create the guide**

  ```markdown
  # Agent Guide — What Can You Ask Your Agents?

  ## Two kinds of agents

  | Type | Where it runs | Needs |
  |------|--------------|-------|
  | Remote (LenGrowth managed) | LenGrowth cloud | Any browser |
  | Local (Sprig / lenos-acp) | Your machine | LenOS desktop app |

  ## Talking to agents

  Agents listen for `@mentions` in any channel they are members of.
  Type `@lengrowth your question` in any channel.

  ---

  ## 10 things you can ask on **web** (remote agents)

  Remote agents connect to LenGrowth's 24 MCP tools: GA, GSC, HubSpot, Stripe, Shopify, PostHog, tasks, cron, and more.

  1. `@lengrowth pull this week's Google Analytics report — top 5 pages by sessions, bounce rate, avg session duration`
  2. `@lengrowth show me Search Console queries with impressions >500 and CTR <2% this month — flag quick wins`
  3. `@lengrowth summarize the HubSpot pipeline: deals by stage, total ARR, which deals have been stale >14 days`
  4. `@lengrowth check Stripe: MRR this month vs last, who churned, any failed payments outstanding`
  5. `@lengrowth analyze Shopify orders last 30 days — AOV, top SKUs, refund rate — flag anomalies`
  6. `@lengrowth run initial assessment for this workspace and generate my first task list`
  7. `@lengrowth write a cold outreach email for a B2B SaaS founder who just hit 100 paying customers`
  8. `@lengrowth what did our PostHog funnel look like last week — signup to activation, where do users drop off`
  9. `@lengrowth create a cron workflow that posts a Monday morning growth summary every week at 8am`
  10. `@lengrowth check my agent's readiness — are all credentials set, which MCP tools are unavailable`

  ---

  ## 10 things you can ask on **desktop** (local agents)

  Local agents run on your machine via Sprig (lenos-acp + lenos-agent + lenos-dev-mcp). They can read files, run shell commands, and access your local dev environment.

  1. `@agent fix the TypeScript error on line 42 of src/auth.ts and run the test suite`
  2. `@agent write a commit message for my staged diff, push to a new branch, open a draft PR with screenshots`
  3. `@agent grep the entire repo for TODO comments older than 3 months and list them by file`
  4. `@agent run cargo test --package lenos-db and fix any failing tests without changing test logic`
  5. `@agent sign this commit with my Nostr key and push to the relay-hosted git repo`
  6. `@agent check all files in crates/ for unsafe blocks, unwrap() calls in production paths, and SQL string concatenation`
  7. `@agent read my .env file and tell me which required vars from .env.example are missing`
  8. `@agent take a screenshot of the unread state in the sidebar, then post it to PR #803`
  9. `@agent run lenos-admin list-members on my local relay and tell me who has the Bot role`
  10. `@agent read ARCHITECTURE.md, compare it with router.rs endpoints, and list any documented endpoints that no longer exist`

  ---

  ## Starting a local agent

  Requires [LenOS desktop app](https://lengrowth.com/download). In the desktop app:

  1. Open **Agents** in the sidebar
  2. Click **+ Add agent**
  3. Choose **Local** — this starts a Sprig subprocess on your machine
  4. The agent joins your workspace channels and responds to `@mentions`

  Local agents have shell and file access scoped to directories you allow in the agent configuration.

  ---

  ## Agent credentials

  Remote agents need API credentials to access your tools (GA, HubSpot, etc.). Configure them in **Settings → Agent Credentials**. Credentials are NIP-44 encrypted before storage — the relay never sees them in plaintext.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/AGENT-GUIDE.md
  git commit -m "docs: add AGENT-GUIDE.md — web vs desktop agent capabilities with 20 examples"
  ```

---

### Task 4.2: User-Facing Onboarding Guide

**Files:**
- Create: `docs/ONBOARDING.md`

- [ ] **Step 1: Create the guide**

  ```markdown
  # Onboarding Guide

  ## Web app (hosted on LenGrowth)

  ### For LenGrowth users (recommended)

  1. Sign in at [lengrowth.com](https://lengrowth.com)
  2. Open your workspace — you are redirected to `{your-slug}.lengrowth.com`
  3. LenGrowth provisions your encrypted Nostr identity automatically — no extension or key management required
  4. Your starter channels and agents appear within a few seconds
  5. Talk to Len in `#general` to get started

  You do not need to install anything. Your identity is managed by LenGrowth and encrypted server-side.

  ### For self-hosted / standalone users

  1. Visit your relay's web app URL
  2. Choose an identity path:
     - **Create a new identity** — generates a local key in your browser; backup with a password on the next screen
     - **I have a Nostr key** — paste your `nsec` or drop an encrypted backup file
     - **Browser extension** — Alby or nos2x if you have one; optional
  3. After identity setup, join a workspace with an invite link or connect to a relay directly in **Settings → Relay**

  ### Key backup (important for standalone users)

  After creating a new identity, the backup step encrypts your key with a password and saves it as a file. **Store this file somewhere safe.** If you clear your browser data, your key is lost without this backup.

  ---

  ## Desktop app

  ### Requirements

  - macOS 12+, Windows 10+, or Linux (x86_64/arm64)
  - Download from [lengrowth.com/download](https://lengrowth.com/download)

  ### Setup

  1. Install and open LenOS desktop
  2. On first launch, enter your relay URL (e.g. `wss://relay.lengrowth.com`) or use the default LenGrowth relay
  3. Sign in with your existing identity (nsec or NIP-07 extension) or create a new one
  4. If you are a LenGrowth user, use the same identity you set up on web — both clients share one relay, so channels and messages are synchronized

  ### Key features only on desktop

  - Local agent execution (Sprig harness — shell, file, git access)
  - Cmd+/- text zoom (accessibility)
  - Multiple community switching in the sidebar
  - `lenos://` deep links from terminal or other apps
  - git-sign-nostr and git-credential-nostr for Nostr-signed git operations

  ---

  ## Mobile app (iOS + Android)

  Mobile app is available for iOS and Android. Supports channels, DMs, and pulse.
  Download from the App Store or Google Play (coming soon — contact support for early access).

  ---

  ## Troubleshooting

  | Problem | Fix |
  |---------|-----|
  | "Sign in to LenGrowth or import a key to perform this action." | Your session is ephemeral (page was refreshed). Re-open from LenGrowth, or go to **Settings → Identity** and import your backup key. |
  | Channels not loading | Check your relay URL in **Settings → Relay**. The relay must be reachable (`/health` should return 200). |
  | Agent not responding | Check **Settings → Agent Credentials** — all required API keys must be set. |
  | Local agents not available | Local agents require the desktop app. Install from [lengrowth.com/download](https://lengrowth.com/download). |
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/ONBOARDING.md
  git commit -m "docs: add ONBOARDING.md — web, desktop, mobile setup guide"
  ```

---

### Task 4.3: On-Call and Ownership Document

**Files:**
- Create: `docs/ON-CALL.md`

- [ ] **Step 1: Create the document**

  Fill in the placeholders below with real names/contacts before merging. The structure must exist even if some fields are TBD — leaving this document absent is worse than a partial one.

  ```markdown
  # On-Call and Ownership

  ## Service owners

  | Service | Owner | Backup |
  |---------|-------|--------|
  | LenOS relay (AWS ECS) | [relay-owner] | [backup] |
  | LenOS web (Cloudflare Pages) | [web-owner] | [backup] |
  | LenGrowth backend (Scalingo) | [backend-owner] | [backup] |
  | Postgres (RDS) | [db-owner] | [backup] |
  | Redis (ElastiCache) | [db-owner] | [backup] |
  | S3 / media | [infra-owner] | [backup] |

  ## Alerting

  - Relay health: `https://relay.lengrowth.com/health` — CloudWatch alarm `relay_unhealthy_hosts` pages [on-call channel]
  - Web app: Cloudflare Pages deploy notifications go to [channel/email]
  - Scalingo: process restarts and error logs go to [channel]

  ## Incident response

  ### P0 — Relay down / data loss risk

  1. Page on-call via [alerting channel]
  2. Check `https://relay.lengrowth.com/_readiness` — if non-200, check ECS task health in AWS console
  3. If relay is down: `aws ecs update-service --cluster lenos --service relay --force-new-deployment`
  4. Check RDS and ElastiCache connectivity — both must be reachable from ECS
  5. If data loss suspected: stop writes (scale relay to 0), take RDS snapshot, investigate before resuming
  6. Post incident summary to [channel] within 24h

  ### P1 — Degraded (auth failures, search broken, pub/sub lag)

  1. Check relay logs in CloudWatch log group `/ecs/lenos-relay`
  2. Check Redis health: `redis-cli -u $REDIS_URL ping`
  3. Check Postgres: `psql $DATABASE_URL -c "SELECT count(*) FROM events WHERE created_at > now() - interval '5 minutes'"`
  4. Escalate to relay owner if root cause not identified within 30 minutes

  ### P2 — Web app deploy failure

  1. Check Cloudflare Pages build logs
  2. Run `cd web && pnpm build` locally to reproduce
  3. Fix, push, and verify new deploy

  ## Escalation path

  [on-call] → [relay-owner] → [CTO/eng lead]

  ## Privacy and retention

  - Events stored in Postgres indefinitely (no automated TTL/purge today — add to roadmap)
  - Media (S3) has no lifecycle policy — add to roadmap
  - Audit log: append-only, hash-chained, no deletion
  - Age-gate: not implemented — add to roadmap if required by jurisdiction
  - GDPR export: `GET /api/export` (NIP-98 auth) — admin can export by pubkey
  - GDPR deletion: not implemented — add to roadmap

  ## Support escalation

  User reports go to [support channel] → on-call triages → routes to owner.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/ON-CALL.md
  git commit -m "docs: add ON-CALL.md — ownership, incident response, escalation, privacy"
  ```

---

### Task 4.4: Ops Checklist (Human-Action Items)

Collects all remaining items that require human ops action (cannot be automated). Single reference for whoever owns the launch.

**Files:**
- Create: `docs/OPS-CHECKLIST.md`

- [ ] **Step 1: Create the checklist**

  ```markdown
  # Pre-Launch Ops Checklist

  Items here require human action — they cannot be run by CI or agents.
  Check off each item and record the date when done.

  ---

  ## Critical (P0 — must complete before any user traffic)

  - [ ] **G-10a: Fix Scalingo production environment**

    Current state: `ENVIRONMENT=development` on production — exposes `/docs` endpoint,
    disables `https_only` on session cookies, `SESSION_SECRET` falls back to `JWT_SECRET`.

    Run these two commands in sequence (they restart the app):
    ```bash
    scalingo -a lengrowth-main env-set \
      SESSION_SECRET=$(openssl rand -hex 32) \
      ENVIRONMENT=production
    ```

    Verify: `curl https://growth-api.lenquant.com/docs` must return 404 (not the API docs page).

  - [ ] **Deploy Cloudflare security headers**

    File `web/public/_headers` was created 2026-08-23 but requires a Cloudflare Pages deploy.

    ```bash
    git push origin main
    ```

    Verify on next deploy: `curl -I https://lenos-e2e32.lengrowth.com | grep -i "content-security-policy\|x-frame-options"`

  ---

  ## High (P1 — complete before inviting beta users)

  - [ ] **Provision durable test identities for E2E**

    Call `POST https://growth-api.lenquant.com/api/auth/managed-nostr/provision` for:
    - `fern2gue+32@gmail.com` (Supabase JWT required — log in at `https://jyzsoytiyubhtdzjuhah.supabase.co`)
    - `fern2gue+33@gmail.com`

    Password for both: `Teste009@!`

    After provisioning, update `LenGrowth/docs/lenos-web-authenticated-fixture.json` with returned pubkeys.
    Confirm `relay_member=true` via `GET /operator/communities` on the relay.

  - [ ] **Verify task dispatch end-to-end**

    In a live workspace channel, type: `@lengrowth create task: test task dispatch callback`
    Expected: agent acknowledges, task appears in LenGrowth dashboard, completion event arrives in channel.
    If it fails: check `LenGrowth/backend/nostr_adapter/relay_connection.py` subscriber log on Scalingo.

  - [ ] **G-10b: Create 4 OAuth apps and set 12 workspace integration env vars**

    Required for Settings → Integrations (GitHub, Notion, Linear, Slack workspace integrations).

    Full checklist: `LenGrowth/docs/workspace-integrations-oauth-setup.md`

    Steps:
    1. Create GitHub OAuth app — callback: `https://growth-api.lenquant.com/api/workspace-integrations/github/callback`
    2. Create Notion OAuth app — callback: `https://growth-api.lenquant.com/api/workspace-integrations/notion/callback`
    3. Create Linear OAuth app — callback: `https://growth-api.lenquant.com/api/workspace-integrations/linear/callback`
    4. Create Slack OAuth app (second one, for workspace integrations, not the existing nostr_adapter app)
    5. Run `scalingo -a lengrowth-main env-set GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... [all 12 vars]`

  ---

  ## Medium (P2 — complete within first week of beta)

  - [ ] **Screen reader audit** — VoiceOver (macOS) and NVDA (Windows) manual tab-order review
  - [ ] **Gate F (desktop/native)** — sidecar lifecycle, `lenos://` deep links, Tauri updater require real signed build
  - [ ] **Live E2E** (Gates B–E) — requires real NIP-07 identities and live relay membership (blocked by durable test identity provisioning above)
  - [ ] **Ops doc owner field** — fill in `[relay-owner]` etc. in `docs/ON-CALL.md`

  ---

  ## Future (P3 — roadmap items, not blocking launch)

  - [ ] SSO / SAML for enterprise
  - [ ] Event TTL / automated Postgres purge
  - [ ] S3 lifecycle policy for media
  - [ ] GDPR deletion endpoint
  - [ ] Age-gate (jurisdiction-dependent)
  - [ ] Per-workspace provider credentials (beyond single Scalingo env var set)
  - [ ] Per-track huddle recording
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/OPS-CHECKLIST.md
  git commit -m "docs: add OPS-CHECKLIST.md — human-action items with exact commands"
  ```

---

### Task 4.5: Clean Up `ARCHITECTURE.md` Known Limitations

The Known Limitations table has stale resolved entries. The doc contradicts STATUS.md.

**Files:**
- Modify: `ARCHITECTURE.md` section `## 9. Known Limitations`

- [ ] **Step 1: Update the Known Limitations table**

  Replace the entire `## 9. Known Limitations` section with:

  ```markdown
  ## 9. Known Limitations

  These are verified gaps — not design aspirations.

  | # | Limitation | Detail |
  |---|-----------|--------|
  | 1 | **No sqlx compile-time query validation** | All queries use runtime `sqlx::query()`. No `.sqlx/` offline cache. Integration tests hit a real DB and catch schema drift at test time — sufficient for now. Revisit when actively changing schema. |
  | 2 | **Webhook HMAC not used** | Workflow webhook secrets are compared directly with constant-time XOR, not HMAC over the request body. Protects against timing attacks but does not authenticate the payload body. Outbound webhooks (CallWebhook) are SSRF-protected and redirect-disabled. |
  | 3 | **Presence fan-out is local-only** | kind:20001 presence events skip Redis PUBLISH and use local-only fan-out. Multi-node presence requires Redis pub/sub wiring — documented as future work. |
  | 4 | **Per-track huddle recording not built** | Recording captures mixed room audio (LENOSOPU format → S3 → kind:48104). Per-participant track publishing: kind range reserved, no producer. |
  | 5 | **Initiative persistence blocked** | Execution platform roadmap (InitiativeRun, outbound connectors, campaigns) is aspirational. Blocked explicitly in `LenGrowth/backend/services/orchestration/types.py:406,1029,1055`. |
  | 6 | **SSO / SAML not implemented** | Nostr keys only. No enterprise identity federation. P3 roadmap item. |
  ```

  Remove all `~~strikethrough resolved~~` entries — they are noise. The doc should only list real open items.

- [ ] **Step 2: Verify no other sections of ARCHITECTURE.md reference resolved limitations**

  ```bash
  grep -n "~~\|strikethrough\|Resolved\|R-0[1-7]" ARCHITECTURE.md
  ```

  If any found, remove or update them.

- [ ] **Step 3: Commit**

  ```bash
  git add ARCHITECTURE.md
  git commit -m "docs: clean up ARCHITECTURE.md Known Limitations — remove resolved stale entries"
  ```

---

### Task 4.6: Update `README.md` to Reference New Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add new docs to the key docs table**

  In `README.md`, find the `| Doc | Purpose |` table and add:

  ```markdown
  | [docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md) | What agents can do — web vs desktop, 20 task examples |
  | [docs/ONBOARDING.md](docs/ONBOARDING.md) | User-facing setup guide for web, desktop, mobile |
  | [docs/ON-CALL.md](docs/ON-CALL.md) | Ownership, incident response, escalation, privacy |
  | [docs/OPS-CHECKLIST.md](docs/OPS-CHECKLIST.md) | Human-action ops items with exact commands |
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add README.md
  git commit -m "docs: link new AGENT-GUIDE, ONBOARDING, ON-CALL, OPS-CHECKLIST from README"
  ```

---

## Phase 5 — Verification

### Task 5.1: Full CI Pass

- [ ] **Run `just ci`**

  ```bash
  just ci
  ```

  Expected: all checks pass. If any fail, fix before marking phases complete.

### Task 5.2: Deploy and Smoke-Test

- [ ] **Push to main and watch Cloudflare Pages deploy**

  ```bash
  git push origin main
  ```

  After deploy:
  ```bash
  # Security headers now live
  curl -I https://lenos-e2e32.lengrowth.com | grep -i "content-security-policy\|x-frame-options\|x-content-type"

  # Relay still healthy
  curl https://relay.lengrowth.com/health
  ```

### Task 5.3: Manual Onboarding Test

- [ ] **Web: confirm no extension required for agent creation**

  Open `https://lenos-e2e32.lengrowth.com` in a browser with no NIP-07 extension installed.
  Navigate to Agents → Create Agent.
  Expected: form submits successfully using the managed-Nostr session (no error about extensions).

- [ ] **Web: confirm `DesktopRequiredCard` appears for local agent creation**

  In the Create Agent dialog, confirm the card shows with download link (web context only).

---

## Summary

| Phase | What changes | Commits |
|-------|-------------|---------|
| 1 — Bug fixes | Remove NIP-07 hard gate; rename `requireNip07` | 2 |
| 2 — Onboarding | Fix IdentityStep copy; update error messages | 2 |
| 3 — Desktop gating | Platform detection; DesktopRequiredCard; wire it in | 3–4 |
| 4 — Docs | AGENT-GUIDE, ONBOARDING, ON-CALL, OPS-CHECKLIST, ARCHITECTURE cleanup, README update | 6 |
| 5 — Verify | CI + deploy + smoke | 1 (push) |

All phases are independent. Phase 1 is P0 — do it first. Phases 2–4 can be executed in parallel by separate agents.
