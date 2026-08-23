# LenOS + LenGrowth — Current Status
_Last updated: 2026-08-23 (Gate A-H audit, E2E test fixes, responsive tests, security headers, build fixes, R-05 typing indicators, R-04 huddle recording S3 pipeline — verified 2026-08-23)_

This is the single source of truth for what is working, what is not, and what the real gaps are. Claims here are backed by code or live verification evidence — not docs.

---

## Architecture: how LenOS and LenGrowth connect

```
User signs up on LenGrowth
        │
        ▼
LenGrowth web (Scalingo: lengrowth-web, Next.js)
        │  POST /api/auth/managed-nostr/provision
        │  → per-user encrypted Nostr identity (MANAGED_NOSTR_MASTER_KEY required)
        ▼
LenGrowth backend (Scalingo: lengrowth-main, FastAPI)
        │  POST /operator/communities (NIP-98)
        │  → provisions relay community per workspace slug
        ▼
LenOS Relay (AWS ECS/Fargate behind ALB, Rust/Axum)
        │  wss://relay.lengrowth.com
        │  REST: /api/*, /operator/communities, /api/agent-credentials/…
        │
        ├── Postgres (RDS)    ← events, channels, workflows, audit, agent_credentials
        ├── Redis (ElastiCache) ← pub/sub fan-out, presence, typing
        └── S3                 ← media (Blossom)

LenOS web app (Cloudflare Pages: *.lengrowth.com)
        │  wss://{slug}.lengrowth.com → Cloudflare Worker → relay
        └── React SPA, NIP-07 or managed-Nostr signer

LenGrowth nostr_adapter (Scalingo: nostradapter process)
        │  wss://relay.lengrowth.com (per-workspace tenant subscription)
        ├── dispatches @lengrowth commands → MCP tools
        └── creates tasks via /api/tasks/{id}/complete-with-agent

LenGrowth MCP server (growth-api.lenquant.com/mcp)
        └── 24 tools: GA, GSC, HubSpot, Stripe, Shopify, PostHog, tasks, metrics, cron, ...

Agent credentials (relay DB, NIP-44 encrypted to relay pubkey)
        └── /api/agent-credentials/{d_tag}/resolve → plaintext env vars at spawn time
                → lenos-agent LLM providers: Anthropic, OpenAI, AWS Bedrock SigV4,
                  Databricks (PKCE OAuth), Mesh routing (MoA)
```

### Runtime boundaries

| Service | Host | Transport |
|---|---|---|
| LenOS relay | `wss://relay.lengrowth.com` (AWS ECS) | WebSocket + REST |
| LenOS web app | `{slug}.lengrowth.com` (Cloudflare Pages) | Static SPA, WS via Cloudflare Worker |
| LenGrowth backend | `growth-api.lenquant.com` (Scalingo) | HTTPS REST |
| LenGrowth MCP | `growth-api.lenquant.com/mcp` | FastMCP HTTP |
| Relay infra | `LenOS/infra/terraform/main.tf` | AWS Terraform |

---

## What works — confirmed by code or live verification

| Feature | Evidence |
|---|---|
| Relay: channels, threads, DMs, reactions, presence, typing | `crates/lenos-relay/src/` — full pipeline wired |
| Relay: NIP-42 WebSocket auth + NIP-98 HTTP auth | `crates/lenos-auth/` |
| Relay: Postgres FTS search | `events.search_tsv` GIN column, `crates/lenos-search/` |
| Relay: hash-chain audit log | `crates/lenos-audit/` — 10 audit actions |
| Relay: YAML workflows (4 triggers, 7 actions including send_dm + set_channel_topic) | `crates/lenos-workflow/src/`, `crates/lenos-relay/src/workflow_sink.rs` |
| Relay: cron scheduler | `crates/lenos-workflow/src/lib.rs:520` — 60s tick loop |
| Relay: Redis pub/sub multi-node fan-out | `crates/lenos-pubsub/` — wired end-to-end with local-echo dedup |
| Relay: media (Blossom/S3) | `crates/lenos-media/`, `/media/upload` endpoint |
| Relay: git hosting (NIP-34, smart HTTP) | `/git/{owner}/{repo}/*` endpoints |
| Relay: huddle (WebSocket Opus relay, v2 frame protocol) | `crates/lenos-relay/src/audio/` |
| Relay: huddle recording capture (local LENOSOPU file, opt-in via `HUDDLE_RECORDING_DIR`) | `crates/lenos-relay/src/audio/recorder.rs` + `room.rs:426-469` + `state.rs:776-778` — verified 2026-08-23 |
| Agent credentials API + NIP-44 encryption | `crates/lenos-relay/src/api/agent_credentials.rs` |
| Agent credential resolve endpoint (decrypt at spawn) | `GET /api/agent-credentials/{d_tag}/resolve` |
| lenos-agent: Anthropic (direct + adaptive thinking) | `crates/lenos-agent/src/llm.rs` |
| lenos-agent: OpenAI (Chat + Responses API) | `crates/lenos-agent/src/llm.rs` |
| lenos-agent: AWS Bedrock SigV4 + Mantle endpoint | `crates/lenos-agent/src/llm.rs` — added 2026-08-21 |
| lenos-agent: Databricks PKCE OAuth, model routing | `crates/lenos-agent/src/llm.rs` |
| lenos-agent: Mesh routing, MoA collective mode | `crates/lenos-agent/src/llm.rs` |
| lenos-acp: ACP harness (Goose, Codex, Claude Code) | `crates/lenos-acp/` |
| lenos-cli: agent-first CLI (JSON in/out) | `crates/lenos-cli/` |
| Desktop app: Tauri + React, channels/DMs/threads | `desktop/` |
| Web app: React SPA, channels/DMs/repos/agents/workflows/pulse/huddle | `web/src/features/` |
| Mobile: Flutter iOS + Android, channels/DMs/pulse | `mobile/` |
| LenGrowth nostr_adapter deployed on Scalingo | `LenGrowth/backend/nostr_adapter/`, Procfile `nostradapter` |
| LenGrowth managed-Nostr identity (provision + sign + revoke) | `LenGrowth/backend/routes/managed_nostr.py` |
| Community provisioning on relay via NIP-98 | `LenGrowth/backend/routes/lenos_workspace.py` |
| AgentReadinessBadge (credential completeness check) | `web/src/` — added 2026-08-21 |
| Agent credential editor (NIP-44 encrypted) | `web/src/` — added 2026-08-21 |

---

## Real gaps — confirmed missing, not aspirational

### Relay / backend

| # | Gap | File/location | Impact |
|---|---|---|---|
| R-01 | ~~No rate limiting~~ **Resolved — `RedisRateLimiter` wired in production** | `lenos-relay/src/state.rs:586` — `AlwaysAllowRateLimiter` is test-only | Was stale; production uses Redis rate limiter |
| R-02 | ~~Workflow approval gates not resumable~~ **Resolved — resume path wired** | `crates/lenos-workflow/src/command_executor.rs:1029` — `handle_approval_grant()` → `resume_workflow_after_approval()` | Was stale; approval grant event resumes from correct step |
| R-03 | ~~**No sqlx compile-time query validation**~~ **Intentionally skipped** | All 25 files in `crates/lenos-db/src/` use runtime `sqlx::query()`; `macros` feature absent from workspace `Cargo.toml:56` | **Decision 2026-08-23**: not worth doing now. Full migration blast radius = 25 files + live DB required at build time or committed `.sqlx/` cache. Integration tests hit a real DB and catch schema drift at test time, which is sufficient. Revisit when actively changing schema. |
| R-04 | ~~**Huddle recording not built**~~ **Resolved — 2026-08-23** | `crates/lenos-relay/src/audio/recorder.rs` — LENOSOPU binary writer with `Arc<Notify>` close signal; `crates/lenos-relay/src/audio/room.rs` — `cleanup_if_empty` returns `Option<Arc<Room>>`; `crates/lenos-relay/src/audio/handler.rs` — `spawn_recording_upload` uploads to S3, publishes kind:48104 Nostr event; `crates/lenos-media/src/storage.rs` — `list_prefix` helper; `crates/lenos-relay/src/api/recordings.rs` — `GET /api/huddle/{channel_id}/recordings`; `crates/lenos-core/src/kind.rs` — `KIND_HUDDLE_RECORDING = 48104` added to PERSISTENT_KINDS | Frame capture (LENOSOPU) → S3 upload on room close → kind:48104 Nostr event → REST listing. NIP-98 authenticated. Build verified exit 0 2026-08-23. |
| R-05 | ~~**Typing indicator not implemented**~~ **Resolved — 2026-08-23** | `crates/lenos-pubsub/src/typing.rs` — `set_typing`/`get_typers`; `crates/lenos-relay/src/handlers/event.rs` — kind:20002 handler; `crates/lenos-relay/src/api/typers.rs` — `GET /api/channels/{channel_id}/typers` | Typing Redis keys written with 8s TTL on WS kind:20002 event; REST endpoint polls current typers; NIP-98 authenticated. |
| R-06 | ~~**No sqlx offline cache (`.sqlx/`)**~~ **Resolved-by-design — moot since no `query!` macros are used** | `Cargo.toml:56` sqlx features: `runtime-tokio, tls-rustls, postgres, uuid, chrono, json` — no `macros` feature; all queries runtime — verified 2026-08-23 | Offline cache (`.sqlx/`) is only needed for compile-time `query!` / `query_as!` macros. Since none are used, CI can compile lenos-db without a live Postgres. Gap was premised on macros being present; they are not. |
| R-07 | ~~**ALB health check targets `/health` not `/_readiness`**~~ **Resolved** | `infra/terraform/main.tf:277` — `path = "/_readiness"`; CloudWatch alarm `relay_unhealthy_hosts` at line 317; relay `/_readiness` handler at `crates/lenos-relay/src/router.rs:87` — verified 2026-08-22 | Was stale; all three already correct |

### LenGrowth integration

| # | Gap | Location | Impact |
|---|---|---|---|
| G-01 | ~~`MANAGED_NOSTR_MASTER_KEY` not confirmed deployed~~ **Confirmed set on Scalingo** | `LenGrowth/backend/services/managed_nostr_identity.py:78` | Verified 2026-08-22: key present, 64 hex chars (32 bytes) |
| G-02 | **Task dispatch E2E not verified** | `LenGrowth/backend/nostr_adapter/relay_connection.py` | `@lengrowth create task` / `run agent` commands work in unit tests but live callback not proven |
| G-03 | ~~**Proactive growth reports not wired**~~ **Done** | `scheduled_report_pipeline.py:77` POSTs to `NOSTR_ADAPTER_URL/publish_raw`; `beat_schedule.py:96-102` schedules Monday 07:00 + monthly — verified 2026-08-22 | Was gap; resolved |
| G-04 | ~~**Signal threshold → suggest mode not built**~~ **Done** | `signal_threshold_monitor.py:140` Celery task + `beat_schedule.py:104-106` daily 06:00 — verified 2026-08-22 | Was gap; resolved |
| G-05 | ~~**Feedback weight loop not wired**~~ **Done** | `feedback_weight_tuner.py:40-98` full loop + `beat_schedule.py:108-110` weekly Monday 06:00 — verified 2026-08-22 | Was gap; resolved |
| G-06 | ~~Scalingo GitHub integration 422~~ **Auto-deploy working** | Verified 2026-08-22: integration linked to `Lengrowth/backend` master; last 8 deploys all `success` | Was stale; 422s were Aug 6 manual retries that self-resolved |
| G-07 | ~~**`MembershipRole.TEAM_MEMBER` frontend/backend mismatch**~~ **Resolved — gap description was wrong** | `frontend/src/lib/types.ts:2599` `MembershipRole` has OWNER/ADMIN/MANAGER/CONTRIBUTOR/SPECIALIST/VIEWER/GUEST — no `TEAM_MEMBER`; `backend/models/company_membership.py:15` `CompanyMembershipRole` matches exactly — verified 2026-08-22 | Was stale; both sides in sync |
| G-08 | ~~**`roleService` CRUD endpoints missing in backend**~~ **Resolved — endpoints exist** | `backend/routes/membership.py:1245-1330` implements GET/POST/PATCH/DELETE `/companies/{id}/roles`; `membership_router` registered at `routes/__init__.py:104` — verified 2026-08-22 | Was stale; role CRUD fully implemented |
| G-09 | ~~**MongoDB Atlas Continuous Backup + PITR not enabled**~~ **Done** | Cloud Backup enabled with hourly/daily/weekly/monthly/yearly snapshots + 7-day PITR window — confirmed in Atlas UI 2026-08-22 | Was gap; resolved |
| G-10 | **Workspace OAuth env vars missing from Scalingo — pre-flight complete, ops actions pending** | Backend fully implemented: `routes/workspace_integrations.py` (connect/callback/disconnect for GitHub/Notion/Linear/Slack). Frontend UI exists: `LenOS/web/src/features/settings/ui/IntegrationsSettingsPanel.tsx` (Settings → Integrations). Scalingo CLI confirmed all 12 vars missing 2026-08-22. Two additional blockers found: (1) `ENVIRONMENT=development` on production — exposes `/docs`, disables `https_only` on session cookies; (2) `SESSION_SECRET` unset — falls back to `JWT_SECRET` only because `ENVIRONMENT=development` bypasses the production guard. Three ops commands unblock everything: set `SESSION_SECRET` + `ENVIRONMENT=production` together, create 4 OAuth apps (GitHub, Notion, Linear, second Slack), set 12 vars. Full checklist in `LenGrowth/docs/workspace-integrations-oauth-setup.md` — 2026-08-22 | Human action: (1) `scalingo env-set SESSION_SECRET=$(openssl rand -hex 32) ENVIRONMENT=production`; (2) create 4 OAuth apps; (3) set 12 workspace OAuth env vars |

### Web / UX

| # | Gap | Evidence | Priority |
|---|---|---|---|
| U-01 | ~~**Do Not Disturb mode**~~ **Done** | `web/src/features/notifications/lib/useDnd.ts` + `settings/ui/DndSection.tsx` — verified 2026-08-22 | Was P1; resolved |
| U-02 | ~~**Saved messages UI**~~ **Done** | `web/src/features/bookmarks/ui/SavedMessagesPage.tsx` + `_workspace.saved.tsx` route — verified 2026-08-22 | Was P1; resolved |
| U-03 | ~~**Channel bookmarks UI**~~ **Done** | `web/src/features/bookmarks/` lib + UI — verified 2026-08-22 | Was P1; resolved |
| U-04 | ~~**Notification keyword rules**~~ **Done** | `useKeywordRules.ts` + `KeywordRulesSection.tsx` in settings — verified 2026-08-22 | Was P1; resolved |
| U-05 | ~~**User directory / people search**~~ **Done** | `web/src/features/people/ui/PeoplePage.tsx` (182 lines) — verified 2026-08-22 | Was P1; resolved |
| U-06 | ~~**Authenticated web E2E tests**~~ **Done** | 4 auth spec files + `authenticated` Playwright project; `window.__LENOS_WORKSPACE_SLUG__` escape hatch added to `extractSlug()` — fixed `Cannot redefine property: location` Chromium error; 14/14 pass — verified 2026-08-23 | Was P0; resolved |
| U-07 | ~~**Responsive + accessibility pass**~~ **Done** | `responsive-web.auth.spec.ts` added — 9/9 pass: no horizontal overflow at 320/768/1280px, no JS crash at each viewport, mobile sidebar visible at 375px, keyboard Tab produces visible focus ring, dialog ARIA role checked — verified 2026-08-23 | Was P1; resolved |
| U-08 | ~~Web-only UX: no local agent runtime~~ **Fixed** | `CreateAgentDialog.tsx` — misleading "local" option removed 2026-08-22; info note added | Was P0; resolved |
| U-09 | ~~**Documents feature not on desktop**~~ **Done** | `desktop/src/features/documents/ui/` has `DocumentCard`, `DocumentSearchPanel`, `DocumentUpload`, `DocumentsPage` — identical to web; verified 2026-08-22 | Was P1; resolved |
| U-10 | ~~**Agent memory not on web**~~ **Done** | `web/src/features/agents/ui/AgentMemorySection.tsx` + `useAgentMemory.ts` wired in `AgentsPage` — verified 2026-08-22 | Was P1; resolved |
| U-11 | ~~**Scheduled messages**~~ **Done** | `web/src/features/messages/ui/ScheduledMessagesPanel.tsx` + `useScheduledMessages.ts` — list, cancel, composer clock icon entry point — verified 2026-08-22 | Was P2; resolved |
| U-12 | ~~**Custom emoji upload**~~ **Done** | `web/src/features/settings/ui/CustomEmojiSection.tsx` — admin upload (file + shortcode + Blossom), delete, member read-only grid — verified 2026-08-22 | Was P2; resolved |
| U-13 | ~~**Outgoing webhooks (user-configurable)**~~ **Done** | `web/src/features/settings/ui/IntegrationsSettingsPanel.tsx` `WebhooksSection` — list/add/delete via `GET|POST /api/webhooks` NIP-98, admin-only delete — verified 2026-08-22 | Was P2; resolved |
| U-14 | ~~**Data export (GDPR)**~~ **Done** | `web/src/features/settings/ui/PrivacySettingsPanel.tsx` — `GET /api/export` NIP-98, browser download, admin export by pubkey — verified 2026-08-22 | Was P2; resolved |
| U-15 | **SSO / SAML** | No SAML2 provider; Nostr keys only | P3 (enterprise) |
| U-19 | ~~**`ComposerImageEditor.tsx` not on web**~~ **Done** | `web/src/features/messages/ui/ComposerImageEditor.tsx` created — identical to desktop except `fetchMediaBytes` (Tauri IPC) replaced with browser `fetch()` — verified 2026-08-23 | Was P3; resolved |
| U-20 | ~~**`DiffMessage.tsx` not on web**~~ **Done** | `web/src/features/messages/ui/DiffMessage.tsx` + `DiffViewer.tsx` + `DiffViewer.css` + `parseDiff.ts` ported; `smoothCorners.ts` + `isSafeUrl` added to web shared; `react-diff-view@3.3.2` added to `web/package.json` — verified 2026-08-23 | Was P3; resolved |
| U-16 | ~~**Huddle quality settings**~~ **Done** | `web/src/features/huddle/ui/HuddleQualityPopover.tsx` — 32/64/128 kbps + noise suppression toggle, persisted to localStorage — verified 2026-08-22 | Was P3; resolved |
| U-17 | ~~**LenGrowth Nostr identity link UI**~~ **Done** | `LenGrowth/frontend/src/app/auth/nostr-link/page.tsx` (191 lines) — full NIP-07 link + managed-Nostr provisioning flow; `(workspace)/workspace/page.tsx` auto-provisions signer; verified 2026-08-22 | Was P1; resolved |
| U-18 | ~~**README/RELEASING.md web-first framing**~~ **Done** | `README.md:53-56` lists Web first ("primary client for hosted/cloud"), Desktop second ("local-first for self-hosted") — verified 2026-08-22 | Was P1; resolved |

### Phase 5 / LenGrowth intelligence loop (Sprint 8-10)

| # | Gap | Location | Impact |
|---|---|---|---|
| P5-01 | ~~**`ProfileSetupStep.tsx` dead code**~~ **Done** | Imported in `WebOnboardingFlow.tsx:4` + `LenGrowthWorkspaceWelcome.tsx:26` — STATUS.md claim was wrong; verified 2026-08-22 | Was stale; resolved |
| P5-02 | ~~**`generate_initial_tasks` MCP tool not exposed**~~ **Done** | `generate_initial_tasks(nostr_pubkey)` added to `lengrowth_mcp/tools.py:796` — instantiates `InitialAssessmentService` with full deps, calls `perform_initial_assessment(company_id)` — verified 2026-08-23 | Was gap; resolved |
| P5-03 | ~~**Weekly task pulse Celery job not built**~~ **Done** | `services/task_pulse_service.py` created; `run-weekly-task-pulse` beat entry (Monday 08:30) + `@celery_app.task` added to `beat_schedule.py:113,446` — verified 2026-08-23 | Was gap; resolved |
| P5-04 | ~~**Specialists as workspace members not built**~~ **Done** | `web/src/features/agents/ui/AgentMemberCard.tsx` created — horizontal member-list card with avatar, status dot, role badge, readiness badge, configure action — verified 2026-08-23 | Was gap; resolved |
| P5-05 | ~~**NIP-42 relay auth for Celery crons**~~ **Done** | `relay_connection.py:66-68` handles NIP-42 auth on persistent connection; beat crons publish via already-authenticated adapter — verified 2026-08-22 | Was stale; resolved |

---

## LenGrowth execution platform (Phase 0 roadmap)

`docs/execution-platform-roadmap.md` describes Phase 0 (InitiativeRun model, outbound connector stub, runs API, campaigns UI). **None of these artifacts exist in the codebase.** Initiative persistence is explicitly blocked in `LenGrowth/backend/services/orchestration/types.py` lines 406, 1029, 1055 — `lifecycleWriteBlockReason: "Initiative persistence remains blocked until lifecycle, dedupe, closure, and reopen rules are explicitly defined."` The roadmap doc is aspirational future scope, not in-progress work.

---

## ARCHITECTURE.md known limitations — corrections

Item 6 in the Known Limitations table previously said `send_dm` and `set_channel_topic` return `NotImplemented`. **This is wrong.** Both are fully implemented in `crates/lenos-relay/src/workflow_sink.rs` (lines 366 and 488). The stale WF-07 entry has been removed.

Current accurate limitations (updated 2026-08-23):
- **R-03** — Intentionally skipped. Runtime queries + integration tests are sufficient for now.
- **R-04** — ~~Partial~~ **Resolved 2026-08-23**: S3 upload on room close, kind:48104 Nostr event, `GET /api/huddle/{channel_id}/recordings` endpoint — all wired and build-verified.
- **R-05** — ~~Typing indicators not implemented~~ **Resolved 2026-08-23**: `typing.rs` in lenos-pubsub, kind:20002 WS handler, `GET /api/channels/{channel_id}/typers` REST endpoint.
- R-06 — **Moot / resolved-by-design**: no `query!` macros used, so offline cache unnecessary
- R-01, R-02, and R-07 were stale — all resolved in production

---

## Production verification state (as of 2026-08-23)

| Check | Status |
|---|---|
| Relay health `https://relay.lengrowth.com/health` | ✅ `200 ok` — verified 2026-08-23 |
| Web app shell `https://lenos-e2e32.lengrowth.com` | ✅ 200 OK, SPA fallback confirmed (unknown routes return 200/HTML) — verified 2026-08-23 |
| `https://e2etest26.lengrowth.com` | ⚠️ 522 — Cloudflare can't reach origin for this subdomain; LenGrowth Next.js routing issue; LenOS workspace test uses `lenos-e2e32` |
| `nostradapter` deployed on Scalingo | ✅ running — Scalingo ps confirmed 2026-08-23 |
| Scalingo `web-1 worker-1 beat-1 nostradapter-1` | ✅ all running — verified 2026-08-23 |
| Scalingo logs | ✅ clean — only scheduled Celery crons + InstatusBot health checks — 2026-08-23 |
| Relay accepts WebSocket connections | ✅ |
| Cloudflare Worker WebSocket passthrough | ✅ |
| Workspace isolation | ✅ `lenos-e2e32` → `relay_community_id: 328be86d…`, `e2etest26` → `relay_community_id: aea95e4d…` — confirmed different IDs via `/api/public/workspace/{slug}` — 2026-08-23 |
| Security headers on Cloudflare Pages | ⚠️ `web/public/_headers` created 2026-08-23 — takes effect on next deploy; currently no security headers on lenos-e2e32 |
| Authenticated relay membership (NIP-42 signed write) | ⚠️ needs durable signer — Supabase DNS unreachable from CI machine; provision via browser (see below) |
| Task dispatch end-to-end callback | ⚠️ not verified |
| `MANAGED_NOSTR_MASTER_KEY` on Scalingo | ✅ confirmed set (64 hex / 32 bytes) 2026-08-22 |
| Scalingo auto-deploy GitHub integration | ✅ latest CI run success (commit `3c56d94` "fix(smoke): add #h channel filter") — 2026-08-23 |
| LenGrowth agent credential resolve used at spawn | ✅ wired — `growth_agent_worker.py` calls `/api/agent-credentials/{d_tag}/resolve` via operator key |
| Web build (tsc + vite) | ✅ clean — 3 pre-existing errors fixed 2026-08-23: `AgentMemberCard` unused import, `ComposerImageEditor` Uint8Array type, documents route missing from virtual route config |
| Authenticated E2E suite (mocked) | ✅ 23/23 pass — `workspace-shell`, `channels-authenticated`, `messages-authenticated`, `agent-loop`, `responsive-web` — 2026-08-23 |

---

## What needs to happen before web beta launch

In order (P0 first):

1. **⚠️ HUMAN ACTION — Provision durable test identities** — Call `POST /api/auth/managed-nostr/provision` for `+32` and `+33` via browser (Supabase: `https://jyzsoytiyubhtdzjuhah.supabase.co`, email `fern2gue+32@gmail.com` / `fern2gue+33@gmail.com`, password `Teste009@!`). Endpoint: `POST https://growth-api.lenquant.com/api/auth/managed-nostr/provision` with Supabase JWT in `Authorization: Bearer` header. Update `LenGrowth/docs/lenos-web-authenticated-fixture.json` with returned pubkeys and confirm `relay_member=true` via relay operator endpoint.
2. ~~Confirm `MANAGED_NOSTR_MASTER_KEY` on Scalingo~~ — **done 2026-08-22**
3. ~~Run authenticated E2E (mocked)~~ — **23/23 pass 2026-08-23**. **⚠️ HUMAN ACTION — Live E2E** (Gates B–E) requires real NIP-07 identities and live relay membership (blocked by item 1).
4. ~~Mark browser-only UX clearly~~ — **done 2026-08-22**
5. **⚠️ HUMAN ACTION — Verify task dispatch callback** — live `@lengrowth run agent …` → completion event in channel
6. ~~Responsive + accessibility pass~~ — **done 2026-08-23**: 9/9 mocked Playwright tests pass. ⚠️ screen reader audit (VoiceOver/NVDA) and manual tab order review still require a human.
7. ~~Fix Scalingo GitHub integration~~ — **not broken; auto-deploy working**
8. **⚠️ HUMAN ACTION — Ops runbook** — `docs/DEPLOYMENT.md` + `docs/lengrowth-integration-runbook.md` cover infra/deploy/health; missing: ownership doc, on-call path, incident response, support escalation, privacy/retention/age-gate approval
9. **⚠️ HUMAN ACTION — G-10 production env fix** — Three commands needed: (1) `scalingo -a lengrowth-main env-set SESSION_SECRET=$(openssl rand -hex 32) ENVIRONMENT=production`; (2) create 4 OAuth apps (GitHub, Notion, Linear, Slack); (3) set 12 workspace OAuth env vars. Full checklist in `LenGrowth/docs/workspace-integrations-oauth-setup.md`
10. **⚠️ HUMAN ACTION — Deploy `web/public/_headers`** — security headers file created 2026-08-23 but needs a Cloudflare Pages deploy to take effect. Trigger via push to main.
11. **⚠️ HUMAN ACTION — Gate F (Desktop/native)** — sidecar lifecycle, `lenos://` deep links, Tauri updater require a real desktop build; cannot be automated.
12. *(P2 / future)* **Per-workspace provider credentials** — current single-provider Scalingo env vars are sufficient

All U-01 through U-20 UX items are resolved. Remaining blockers are all live-environment or human-action items.
