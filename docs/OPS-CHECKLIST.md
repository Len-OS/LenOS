# Pre-Launch Ops Checklist

Items requiring human action — cannot be automated. Check off and record date when done.

---

## Critical (P0 — must complete before any user traffic)

- [ ] **G-10a: Fix Scalingo production environment**

  Current state: `ENVIRONMENT=development` on production — exposes `/docs`, disables `https_only` on session cookies, `SESSION_SECRET` falls back to `JWT_SECRET`.

  ```bash
  scalingo -a lengrowth-main env-set \
    SESSION_SECRET=$(openssl rand -hex 32) \
    ENVIRONMENT=production
  ```

  Verify: `curl https://growth-api.lenquant.com/docs` must return 404.

- [ ] **Production wildcard DNS/TLS + Cloudflare routing**

  Each workspace uses a subdomain (`{slug}.lengrowth.com`). Requires:
  1. Wildcard DNS `*.lengrowth.com → Cloudflare` (or per-slug CNAME if wildcard not available on plan)
  2. Wildcard TLS cert provisioned on Cloudflare (automatic if proxied, else upload)
  3. Cloudflare route/worker to forward `{slug}.lengrowth.com` to the correct Pages origin or relay

  Verify: `curl -I https://testworkspace.lengrowth.com` must resolve and return 200/301 (not NXDOMAIN).

- [ ] **Deploy Cloudflare security headers**

  File `web/public/_headers` was created 2026-08-23 — needs a Cloudflare Pages deploy.

  ```bash
  git push origin main
  ```

  Verify after deploy:
  ```bash
  curl -I https://lenos-e2e32.lengrowth.com | grep -i "content-security-policy\|x-frame-options"
  ```

---

## High (P1 — before inviting beta users)

- [x] **Browser workspace persists messages after refresh** *(code-verified 2026-08-23)*

  `web/src/features/messages/use-messages.ts:74-89` — `queryEvents()` fetches history with
  `limit: HISTORY_LIMIT` on channel mount. `use-messages.ts:93-110` — persistent REQ subscription
  with `since` timestamp for incremental sync after reconnect.
  Desktop reconnect replay: `desktop/src/shared/api/relayReconnectReplay.ts:81` — `replayReconnectHistoryPages`.

- [x] **Relay WSS + community isolation verified** *(code-verified 2026-08-23)*

  Connection: `web/src/shared/lib/relay-live-client.ts:36` — NIP-42 authenticated WebSocket.
  Community isolation: `web/src/shared/lib/workspace.ts:77` — `communityId: data.relay_community_id`
  scoped per workspace. Desktop reconnect replay: `relayReconnectReplay.ts:81-119`.
  **Still needed:** live E2E test with two workspaces confirming event isolation.

- [x] **Default channels for new workspace** *(code-verified 2026-08-23)*

  `desktop/src/features/communities/ui/HostedCommunityCreateFlow.tsx:254-258` — calls `onboarding.start()`
  after provisioning. `desktop/src/features/onboarding/welcome.ts:234` — seeds Welcome/general channels
  on first-run. `#general` is pre-seeded in test bridge (`tests/helpers/bridge.ts:747`).
  **Decision already made**: `#general` is the default. No action needed.

- [x] **LenGrowth link/revoke/reconnect** *(code-verified 2026-08-23)*

  Connect: `desktop/src/features/settings/ui/LenGrowthSettingsPanel.tsx:26` — `buildConnectUrl()` OAuth.
  Revoke: `LenGrowthSettingsPanel.tsx:122` — `DELETE /api/auth/nostr-link`.
  Reconnect: `LenGrowthSettingsPanel.tsx:48` — `deep-link-lengrowth-auth` event listener.
  **Still needed:** live smoke test of all three flows.

- [ ] **Provision durable test identities for E2E**

  Call `POST https://growth-api.lenquant.com/api/auth/managed-nostr/provision` for:
  - `fern2gue+32@gmail.com` (Supabase JWT required)
  - `fern2gue+33@gmail.com`

  Use the approved password-manager entry for these synthetic identities; do not
  place credentials in this checklist or repository.

  Update `LenGrowth/docs/lenos-web-authenticated-fixture.json` with returned pubkeys.
  Confirm `relay_member=true` via relay operator endpoint.

- [ ] **Workspace delete/recovery policy** *(gap identified 2026-08-23)*

  Workspace creation exists (`desktop/tests/helpers/bridge.ts:747`).
  Channel deletion/archive exists (`channels.spec.ts:1517`).
  **Missing: workspace deletion.** No `deleteWorkspace` or `destroyWorkspace` found in codebase.
  Decide: implement deletion, or document "no deletion in beta" as explicit policy.

- [x] **Verify task dispatch end-to-end** *(code-reviewed 2026-08-23)*

  All five code paths confirmed:
  - Read: `GET /tasks/{id}` → `LenGrowth/backend/routes/tasks.py:1377`
  - Create: `POST /tasks` → `LenGrowth/backend/routes/tasks.py:1117`
  - Agent trigger: `POST /growth/tasks/{id}/complete-with-agent` → `services/task_agent_dispatch.py`
  - Success: `worker/agent_tasks.py:884` `_update_task_status(DONE)`
  - Failure: `worker/agent_tasks.py:877` `_update_task_status(FAILED)`

  Fix applied: `worker/task_signals.py` was overwriting `executionMetadata` sub-doc on Celery postrun
  signal. Now uses dot-notation `$set` — preserves `proofStage`, `pipelineSummary`, `reminderState`.

  **Still needed for full sign-off:** live smoke test — in a live workspace channel type
  `@lengrowth create task: test task dispatch callback`, confirm task appears in dashboard
  and completion event arrives in channel.

- [ ] **G-10b: Create 4 OAuth apps and set 12 workspace integration env vars**

  Full checklist: `LenGrowth/docs/workspace-integrations-oauth-setup.md`

  Apps needed: GitHub, Notion, Linear, Slack (workspace integrations).
  Callbacks: `https://growth-api.lenquant.com/api/workspace-integrations/{provider}/callback`

---

## Medium (P2 — within first week of beta)

- [ ] Screen reader audit — VoiceOver (macOS) + NVDA (Windows) manual tab-order review
- [ ] Gate F (desktop/native) — sidecar lifecycle, `lenos://` deep links, Tauri updater (requires real signed build)
- [ ] Live E2E (Gates B–E) — requires real NIP-07 identities and live relay membership
- [ ] Fill in `[relay-owner]` etc. in `docs/ON-CALL.md`

---

## Future (P3 — roadmap)

- [ ] SSO / SAML for enterprise
- [ ] Event TTL / automated Postgres purge
- [ ] S3 lifecycle policy for media
- [ ] GDPR deletion endpoint
- [ ] Age-gate
- [ ] Per-workspace provider credentials
- [ ] Per-track huddle recording
