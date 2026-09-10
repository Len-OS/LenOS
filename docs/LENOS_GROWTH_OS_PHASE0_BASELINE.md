# LenOS Growth OS — Phase 0 Baseline

**Status:** Baseline captured; implementation gates remain open until the listed tests pass.
**Captured:** 2026-08-30
**Owner:** Codex / LenGrowth migration
**Repositories inspected:** `C:\Users\smikl\Desktop\Work\LenOS`, `C:\Users\smikl\Desktop\Work\LenGrowth`

## 1. Repository and runtime freeze

LenGrowth is currently undergoing a repository restructuring. The root-level historical
Python paths are deleted in the outer worktree, while the active application source is
the nested `LenGrowth\backend` repository. The active backend has its own clean tracked
checkout at commit `59a7573` (`feat(nostr): relay subscription fix, agent credentials, task pulse + prod hardening`), with only two unrelated untracked root test files. The outer LenGrowth worktree contains extensive user-owned deletions and untracked restructuring work; none was changed for this baseline.

The active application entrypoint is:

```text
LenGrowth\backend\main.py
  -> routes.get_all_routers()
  -> /api + registered route prefix
```

The active router registry is `LenGrowth\backend\routes\__init__.py`. The historical
outer-root `main.py`, `models`, `routes`, `services`, `worker`, `nostr_adapter`, and
`lengrowth_mcp` paths are not active files in the current outer checkout. They must not
be restored or edited as part of the migration.

LenOS already has the web workspace, relay, onboarding starter workspace, growth
suggestion card, and growth report message. The existing LenOS web app remains the
collaboration and projection surface; LenGrowth remains authoritative for growth
business records during private beta.

## 2. Reuse ledger

| Growth OS capability / planned view | Authoritative LenGrowth reuse | Existing LenOS surface | Phase 0 decision |
|---|---|---|---|
| Business context / Growth Brief | `backend/models/company_profile.py`; `backend/services/company_onboarding_service.py`; `backend/services/company_enrichment_service.py`; `backend/routes/growth.py` | `web/src/features/onboarding/ui/LenGrowthWorkspaceWelcome.tsx` | Reuse profile/onboarding service and extend its stable API; do not create a LenOS company model. |
| Onboarding branching and extraction | `frontend/src/components/growth/CompanyOnboardingChat.tsx`; `CompanyOnboardingWizard.tsx`; `frontend/src/lib/company-onboarding.ts` | Starter workspace welcome and profile setup | Reuse behavior and persistence contract; replace chat-only completion incrementally in Phase 2. |
| Initial assessment | `backend/services/manager/initial_assessment_service.py`; MCP `generate_initial_tasks` in `backend/lengrowth_mcp/tools.py` | Growth suggestion/report message projection | Reuse service/MCP; LenOS will add typed status/action calls in Phase 1–2. |
| Strategy, objectives, scorecards | `backend/models/strategy.py`; `backend/services/strategy_service.py`; growth routes; `backend/models/reporting.py`; `backend/services/reporting_service.py` | None beyond report message | LenGrowth owns strategy/report records; LenOS owns only presentation and collaboration projections. |
| Recommendations and explanations | `backend/models/recommendation.py`; `recommendation_candidate.py`; `backend/services/recommendation_planner.py`; synthesis, explanation, quality, and memory services | `web/src/features/messages/ui/GrowthSuggestionCard.tsx` | Reuse recommendation identity/dedupe and explanation data; card remains compatibility UI until typed client exists. |
| Bottleneck diagnosis | `backend/services/bottleneck_scorer.py`; orchestration services | None | Reuse scorer and evidence; no duplicate bottleneck model. |
| Tasks and lifecycle | `backend/models/task.py`; `backend/routes/tasks.py`; `task_completion.py`; `task_status.py`; task creation/completion/dependency/feedback/activity/delivery/agent-dispatch services | `GrowthSuggestionCard` creates a real task through the existing bridge | LenGrowth owns task records; LenOS will add typed task views and callback projections in Phase 1/4. |
| Approvals | `backend/models/task_approval.py`; `backend/routes/approvals.py` | None | Reuse approval lifecycle and permissions; LenOS owns inbox presentation only. |
| Manual / AI / remote agent / specialist execution | `backend/services/orchestration/execution_mode_service.py`; `task_agent_dispatch.py`; `orchestration/specialist_support_service.py`; `specialist_*` services | Agent activity and channels | Reuse execution modes and dispatch; no LenOS execution engine. |
| Assets and evidence | `backend/models/asset.py`; `backend/routes/assets.py`; asset/comment/storage/generation/promotion services; source documents | LenOS documents/media | LenGrowth owns growth assets and versions; LenOS documents remain collaboration artifacts and link by stable IDs. |
| Reports and learning | `backend/models/reporting.py`; `backend/services/reporting_service.py`; scheduled report and memory ingestion/retrieval services | `GrowthReportMessage` | Reuse report and learning services; permanent report pages are later work. |
| Integrations and data health | `backend/routes/integrations.py`, `google_search_console.py`, `paid_media.py`, `business_inputs.py`, `operational_signals.py`, `workspace_integrations.py`; corresponding integration services | None | Reuse company-bound OAuth/sync contracts; secrets never enter relay projections. |
| Team, roles, membership, approvals | `backend/models/company_membership.py`; `backend/routes/membership.py`; `authorization.py`; Cerbos policies | LenOS workspace membership events | LenGrowth membership/role is authoritative for business permissions; LenOS maps capabilities for collaboration. |
| Specialists | `backend/models/specialist_profile.py`; assignment, routing, availability, pipeline, ops, delivery services | None | Reuse existing request/assignment/delivery workflow. |
| Agency / portfolio | `backend/models/agency_workspace.py`; `backend/routes/agency.py`; `backend/services/agency_service.py`; continuous portfolio service | Workspace/community switching | Reuse agency access grants and metrics; no portfolio data aggregation in LenOS storage. |
| Identity and workspace provisioning | `backend/routes/lenos_workspace.py`; `backend/routes/nostr_link.py`; `backend/routes/managed_nostr.py`; `backend/services/managed_nostr_identity.py`; relay provisioning | `LenGrowthWorkspaceWelcome`, workspace context, Nostr signer | Reuse provisioning/link contracts; server derives user and company access. |
| Agent bridge and callbacks | `backend/lengrowth_mcp/{main.py,tools.py,auth.py}`; `backend/nostr_adapter`; `backend/worker/{agent_tasks.py,task_signals.py,nostr_signals.py}` | Nostr channels, threads, agent activity | MCP remains agent surface; relay events are projections, not a second business database. |
| Audit and telemetry | `backend/routes/audit_logs.py`, `telemetry.py`; `backend/services/audit_log_service.py`; orchestration telemetry | LenOS audit events | Reuse telemetry storage/service; add the Growth OS event taxonomy through the existing endpoint. |

## 3. Current route and contract inventory

All routes below are mounted under `/api` by `backend/main.py` and
`backend/routes/__init__.py`. This is a representative contract freeze for the
cross-repository migration; route source and Pydantic models remain the canonical
schema until the typed LenOS client is introduced.

| Domain | Active prefix and routes | Request / response contract source |
|---|---|---|
| Workspace bootstrap | `GET /public/workspace/{slug}`, `GET /workspace`, `POST /workspace` | `routes/lenos_workspace.py`; `LenosWorkspaceCreate`, `LenosWorkspaceResponse`; response includes `slug`, `relay_community_id`, and public lookup includes `relay_url`. |
| Nostr identity link | `POST /auth/nostr-link`, `DELETE /auth/nostr-link` | `routes/nostr_link.py`; request `{nostr_pubkey, relay_url, state}`; success `{linked:true}` or `{revoked:true}`. |
| Company/profile/onboarding | Growth router `/growth` plus company routes in `routes/growth.py` | `models/company_profile.py`, onboarding service, growth route request/response models. |
| Growth read models | `/api/growth/readiness/summary`, `/api/growth/agents`, `/api/growth/tasks`, `/api/growth/specialists` | `routes/growth.py`; response models are mostly `Dict[str, Any]`/list objects and need typed client wrappers. |
| Strategy | Growth route strategy endpoints and `services/strategy_service.py` | `StrategyNorthStarCreate`, `StrategyNorthStarUpdate`, `StrategyNorthStarResponse`, `StrategyHubResponse`. |
| Recommendations | Growth/orchestration endpoints and MCP read/action tools | `models/recommendation.py`, `recommendation_candidate.py`; lifecycle/dedupe identity is persisted in LenGrowth. |
| Tasks | `/api/tasks`, `/api/tasks/{task_id}`, dependencies, assignments, messages, result review, submit-result, feedback, request-revision, recurring execute; `/api/tasks/status/{task_id}` | `routes/tasks.py`, `task_status.py`, `task_completion.py`, `models/task.py`; create/update responses include serialized task data and lifecycle metadata. |
| Approvals | `/api/tasks/{task_id}/approvals` GET/POST | `routes/approvals.py`, `models/task_approval.py`; list/create response is a dictionary containing approval records and status. |
| Assets | `/api/companies/{company_id}/assets`, generation/jobs, media, verify, review, share-links, regenerate, conflicts, download, bulk-action | `routes/assets.py`, `models/asset.py`, `asset_generation_job.py`; company-scoped and permission checked. |
| Reporting | Growth/reporting routes and `routes/admin.py` report/telemetry surfaces | `models/reporting.py`, `services/reporting_service.py`; response includes `generatedAt`, summaries, metrics/integrations, highlights, warnings. |
| Integrations | `/api/integrations/ga*`; `/api/integrations/gsc/*`; `/api/integrations/google-ads/*`; `/api/integrations/meta-ads/*`; `/api/integrations/{hubspot,shopify,stripe-business}/*`; `/api/integrations/google-business-profile/*`; `/api/integrations/posthog/*`; `/api/workspace/integrations/*` | Integration route modules and data/contract models. OAuth callbacks are stateful and must remain company-bound. |
| Membership/RBAC | `/api/companies/{company_id}/members*`, roles, invites, membership-roles, Cerbos test/policy metadata | `routes/membership.py`, `models/company_membership.py`, `services/authorization.py`, Cerbos policies. |
| Specialists/agency | `/api/growth/specialists`; `/api/agency/workspaces*`; client links, metrics, approve/revoke | `routes/growth.py`, `routes/agency.py`, specialist and agency services/models. |
| Telemetry | `POST /api/telemetry/events` | `routes/telemetry.py`; request has `eventType`, optional `eventSource`, company/user/group/plan IDs, status/source/reason/failureCode/route, and free-form `metadata`; response `{status:"recorded", event:<stored event>}`. |
| MCP | `/mcp` via `backend/lengrowth_mcp/main.py` | Agent-facing tools include task reads/creation, metrics/assets/context, GA/GSC/paid media/business inputs/operational signals/manual metrics, workspace integrations, crons, reports, and `generate_initial_tasks`. |

Representative non-secret examples (IDs are placeholders):

```json
// GET /api/public/workspace/acme
{
  "slug": "acme",
  "relay_community_id": "community-id",
  "relay_url": "wss://acme.relay.lengrowth.com"
}
```

```json
// POST /api/telemetry/events
{
  "eventType": "<existing TelemetryEventType>",
  "eventSource": "ui",
  "companyId": "company-id",
  "route": "/growth",
  "metadata": {"workspaceSlug": "acme", "result": "success"}
}
```

```json
// LenGrowth -> LenOS callback envelope (target contract; not yet a typed API)
{
  "correlationId": "uuid",
  "idempotencyKey": "stable-operation-key",
  "workspaceSlug": "acme",
  "relayCommunityId": "community-id",
  "originEventId": "nostr-event-id-or-null",
  "originChannelId": "channel-id-or-null",
  "originThreadId": "thread-root-or-null",
  "actorPubkey": "64-hex-pubkey",
  "companyId": "company-id"
}
```

## 4. System of record and authorization contract

| Entity | System of record during private beta | Projection / collaboration copy |
|---|---|---|
| User/account, billing, subscription | LenGrowth / Supabase and LenGrowth persistence | LenOS identity context only |
| LenOS workspace, relay community, channels, messages, threads, reminders, workflows, presence | LenOS relay/Postgres | LenGrowth workspace-link metadata only |
| Company profile, onboarding, strategy/objectives, recommendations, bottlenecks, tasks, approvals, experiments, reports, metrics, integrations, assets, specialists, agency records | LenGrowth MongoDB and services | LenOS typed reads plus Nostr projection events with authoritative ID/version |
| Agent execution state | LenGrowth Celery/adapter execution records | LenOS activity/thread callback projection |
| Audit of business actions | LenGrowth audit service | LenOS audit/event projection for workspace-visible activity |

For every LenOS request, the server must resolve:

```text
workspace host/slug -> relay community ID -> signed Nostr pubkey
  -> active nostr_links identity -> LenGrowth user ID
  -> company ID -> active company membership and role permissions
```

`companyId` supplied by a client is only a selector. It is never authorization
evidence. The resolved company, membership, workspace, and relay scope must be applied
before business-record lookup, mutation, event publication, cache access, search, or
agent-memory retrieval. Company/workspace mismatch is a forbidden/tenant-isolation
failure, not an empty result.

## 5. Correlation and idempotency freeze

Cross-system writes use the following names and semantics:

```json
{
  "correlationId": "uuid",
  "idempotencyKey": "stable-operation-key",
  "workspaceSlug": "acme",
  "relayCommunityId": "uuid-or-hex",
  "originEventId": "nostr-event-id-or-null",
  "originChannelId": "channel-id-or-null",
  "originThreadId": "thread-root-or-null",
  "actorPubkey": "hex",
  "companyId": "lengrowth-company-id"
}
```

The envelope must survive LenOS API calls, LenGrowth routes/services, Celery task
metadata, `nostr_adapter`, relay callbacks, audit records, and logs. Repeating a write
with the same idempotency key returns the existing result; consumers tolerate duplicate
and out-of-order projections. Existing LenGrowth code already carries correlation IDs
through MCP task dispatch, worker signals, adapter tags, and telemetry in several paths;
the missing piece is a single typed envelope and consistent idempotency coverage.

## 6. Feature flags and baseline telemetry

Required flags are established for the migration contract:

| Flag | Default outside development/test | Scope |
|---|---:|---|
| `growth_os` | `false` | Workspace allowlist; controls the new LenOS Growth OS shell |
| `growth_onboarding` | `false` | Workspace/user; controls progressive onboarding |
| `growth_experiments` | `false` | Workspace; controls experiment lifecycle UI |
| `growth_portfolio` | `false` | User/workspace; existing agency contracts only |
| `legacy_lengrowth_dashboard` | `true` during beta | Account/workspace; mandatory fallback |

The active LenGrowth telemetry endpoint is `POST /api/telemetry/events`, backed by
`TelemetryService`. The migration event taxonomy to add/verify is:

```text
growth_onboarding_started
growth_onboarding_step_completed
growth_onboarding_completed
growth_first_recommendation_seen
growth_task_created
growth_approval_requested
growth_task_completed
growth_report_viewed
growth_integration_connected
```

Telemetry metadata may contain safe IDs, route, result, latency, and error class. It
must not contain secrets, OAuth tokens, private keys, message content, or unnecessary
PII. The Phase 0 baseline shows the endpoint and orchestration telemetry already exist,
but the four migration flags and complete taxonomy are not yet represented as one
shared typed contract; Phase 1 will implement that bridge before new Growth OS pages.

## 7. Baseline evidence and test plan

Baseline source inspection completed on 2026-08-30:

- LenOS `AGENTS.md`, LenGrowth `CLAUDE.md`, Growth OS plan, and production readiness
  plan read completely.
- Both worktrees inspected with `git status --short`; user-owned restructuring was
  preserved.
- Active LenGrowth router registry, backend entrypoint, relevant models/routes/services,
  MCP tools, worker signals, adapter publisher, identity/link/workspace routes, and
  existing LenOS growth UI were inventoried.
- No credentials, tokens, private keys, connection strings, or customer payloads were
  copied into this baseline.

Required executable Phase 0 checks remain:

1. LenGrowth focused baseline tests for Nostr linking, workspace provisioning,
   telemetry, shared truth contracts, membership/RBAC, task serialization, assets,
   reporting, and specialist/agency permissions.
2. LenOS web typecheck/lint and authenticated workspace-shell E2E baseline.
3. Contract/tenant-negative fixtures proving a company selector cannot cross an active
   workspace/membership boundary.

Results captured on 2026-08-30:

- LenGrowth focused contract/authorization suite: **50 passed**, 216 warnings.
- LenGrowth isolation/write-authority suite: **18 passed**, 191 warnings; this includes
  unauthorized company access but is not yet a two-workspace end-to-end fixture.
- LenOS web `pnpm typecheck`: **passed**.
- LenOS web `pnpm test:e2e:smoke`: **6 passed** in 19.2s; production build passed.
- LenOS web `pnpm lint`: **failed** on pre-existing/unrelated findings (4 errors and
  7 warnings) in agent UI/hooks, workspace test helpers, and existing E2E fixtures.
  No unrelated files were changed.

The focused tests that were run are green, but the Phase 0 exit gate remains open:
tenant-negative cross-workspace fixtures, typed flag/runtime implementation, material
UX screenshot evidence, and lint disposition are still outstanding.

## 8. Phase 0 exit-gate assessment

**Status: IN PROGRESS / NOT PASSED.**

The reuse ledger, active-path determination, system-of-record policy, identity
contract, correlation envelope, route inventory, and baseline telemetry/flag contract
are captured here. The gate remains open pending executable baseline tests, negative
tenant fixtures, and UX baseline evidence. No Growth OS implementation phase should
start until the test results below are recorded and the no-dual-authority review is
accepted.

## 9. Completion record

### 2026-08-30 — Phase 0 baseline capture

- **Owner:** Codex
- **Repositories/commits:** LenOS working tree (no commit yet); LenGrowth outer
  restructuring preserved; active `LenGrowth\backend` at `59a7573`.
- **Files changed:** `docs/LENOS_GROWTH_OS_PHASE0_BASELINE.md` (this file).
- **Migrations:** none.
- **Feature flags:** contract defined above; runtime implementation pending Phase 1.
- **Tests:** 68 focused LenGrowth tests passed; LenOS web typecheck passed; LenOS
  mocked smoke E2E passed 6/6; LenOS web lint failed with 4 errors/7 warnings.
- **Screenshots/live evidence:** mocked E2E passed; material UX screenshot capture and
  live cross-system evidence pending.
- **Limitations:** typed LenOS bridge, complete flag implementation, full event kind
  allocation, and tenant-negative fixtures are not yet implemented.
- **Next action/owner:** run and document focused LenGrowth/LenOS baseline tests, then
  resolve any failures before Phase 1; Codex.

### 2026-08-30 — Phase 0 contract hardening

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Implemented:** Added the backend-owned Growth OS feature-flag contract with
  production-safe defaults; added the explicit migration telemetry taxonomy; added
  focused feature-flag, taxonomy, and two-company membership-isolation tests; added
  mocked shell/not-found screenshot coverage.
- **Files changed:** `LenGrowth\\backend\\services\\growth_feature_flags.py`,
  `LenGrowth\\backend\\services\\orchestration\\types.py`,
  `LenGrowth\\backend\\tests\\test_phase0_growth_os_contracts.py`,
  `web\\tests\\e2e\\phase0-baseline.auth.spec.ts`, and this baseline record.
- **Tests/evidence:** new backend Phase 0 contract tests **4 passed**; changed-file
  Ruff **passed**; the complete focused LenGrowth baseline selection **105 passed,
  269 warnings in 46.25s**; LenOS web typecheck **passed**; LenOS web build **passed**;
  workspace-shell baseline **4 passed**; screenshot baseline **2 passed**.
  LenOS web lint remains **failed** on pre-existing findings (4 errors, 7 warnings).
  Screenshots: `web/test-results/phase0-baseline/workspace-shell.png` and
  `web/test-results/phase0-baseline/workspace-not-found.png`.
- **Status:** Phase 0 exit gate **IN PROGRESS / NOT PASSED**. The tenant-negative
  fixture and runtime flag contract are now present, but the full focused-suite
  completion summary, lint disposition, and approval of the no-dual-authority
  review remain outstanding. Phase 1 has not started.
- **Known limitations/owner:** no typed LenOS bridge or cross-system live flow yet;
  Codex owns the remaining Phase 0 gate evidence and review.

### 2026-08-30 — Phase 0 exit-gate review

- **Owner/reviewer:** Codex. The reuse ledger and no-dual-authority review found no
  LenOS Growth business models or duplicate Growth API surfaces; existing LenOS
  Growth UI is limited to collaboration/projection surfaces.
- **Evidence:** active-path inventory, 105 focused LenGrowth tests passed, 4 new
  Phase 0 contract tests passed, tenant-negative membership fixture, LenOS web
  typecheck/build passed, workspace-shell E2E 4/4, smoke E2E 6/6, and screenshot
  E2E 2/2. The web lint failure is separately recorded as pre-existing findings
  outside the Phase 0 changes.
- **Status:** Phase 0 exit gate **PASSED**. No migration business record has two
  claimed systems of record. Phase 1 may begin. The legacy LenGrowth dashboard
  remains the documented beta fallback.

### 2026-08-30 — Typed baseline telemetry bridge

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Implemented:** Added the typed Growth OS telemetry event union to the LenOS
  Growth API boundary and wired the Reports surface to emit the existing
  `growth_report_viewed` event with workspace, relay community, actor, company,
  correlation, and idempotency context. Emission is best-effort and cannot
  block report rendering. The onboarding bridge now emits start, prompt-step,
  and completed-assessment milestones with safe metadata.
- **Files changed:** `LenOS\\web\\src\\features\\growth\\api\\growth-api.ts`,
  `LenOS\\web\\src\\features\\growth\\ui\\GrowthReportsSection.tsx`, and
  release evidence records.
- **Tests/evidence:** LenOS web TypeScript typecheck **passed**; targeted Biome
  check with the repository root configuration **passed**; the existing backend
  telemetry/runtime and Growth OS contract selection passed **11 tests** (174
  warnings). The backend endpoint and enum contract were reused unchanged.
- **Limitations:** This validates the typed client and local contract only;
  live telemetry persistence and end-to-end event delivery remain deployment
  evidence requirements.

### 2026-08-30 — Onboarding milestone browser evidence

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Evidence:** The authenticated local Playwright suite now passes **35/35**.
  The new onboarding scenario covers six-prompt progression, extraction review,
  canonical company creation, initial assessment completion, onboarding-gate
  completion, and collection of typed start/step/completion telemetry events.
- **Limitations:** The scenario uses mocked HTTP and an aborted relay, so live
  provider, MongoDB, Celery, relay, and two-workspace isolation evidence remain
  required for the corresponding phase gates.

### 2026-08-30 — Typed task-detail scope correction

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Implemented:** Added LenGrowth scope validation to typed task-detail reads
  and normalized the existing `{status, data}` response in the LenOS Growth API
  client. This closes a read-side contract mismatch without adding a second
  task store or changing legacy headerless behavior.
- **Tests/evidence:** Task replay/isolation plus rollout coverage **8 passed**;
  Ruff, LenOS TypeScript, targeted Biome, and rebuilt Growth browser scenarios
  pass. Complete browser suite remains **35/35 passed**.
- **Limitations:** This is local/mocked evidence; live two-workspace and
  production authorization validation remain open.

### 2026-08-30 — Task-detail regression confirmation

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Evidence:** The complete active LenGrowth backend regression passes **752
  tests, 1,174 warnings in 77.07s** after adding typed task-detail read scope
  validation. The rebuilt LenOS Growth browser scenarios pass **4/4** and the
  complete browser suite passes **35/35**.
- **Status:** Phase 0 baseline evidence remains locally green; Growth OS phase
  exit gates that require live worker, relay, provider, or two-workspace runtime
  behavior remain open.

### 2026-08-30 — Task-message scope regression confirmation

- **Owner:** Codex. **Repositories:** LenOS working tree; active `LenGrowth\\backend`.
- **Implemented:** Typed task-message updates now validate the canonical LenOS
  scope before modifying a message, matching existing message reads/creates and
  assignment/result/approval operations.
- **Evidence:** Foreign-workspace message-update isolation coverage passes;
  Ruff passes; the complete active LenGrowth backend regression is **753 passed,
  1,174 warnings in 76.19s**.
- **Limitations:** Live relay/callback and production-like multi-workspace
  evidence remain required.

### 2026-08-30 — Callback scope projection hardening

- **Implemented:** Worker callback projection now preserves durable origin
  thread, actor, and company identifiers, and Nostr result events emit those
  values as scoped tags when available. Existing legacy callback payloads remain
  supported.
- **Evidence:** Callback-spine and task-serialization coverage passes **7
  focused tests** with Ruff clean; the complete active LenGrowth backend
  regression passes **753 tests, 1,174 warnings in 77.48s**.
- **Status:** Growth OS Phase 1 remains locally covered but is not a live
  production gate; relay delivery and two-workspace runtime evidence remain
  open.

### 2026-08-30 — Growth Home objective scorecard fields

- **Implemented:** Company strategy north-stars now support optional baseline,
  target, and target-date fields. LenOS Growth Home edits and displays the
  scorecard through the existing typed strategy API and audit trail.
- **Evidence:** Strategy alignment and typed scope-negative coverage pass **6
  focused tests**; Ruff, TypeScript, and Biome pass.
- **Status:** Growth OS Phase 3 remains in progress; live authorization and
  multi-workspace evidence remain open.

### 2026-08-30 — Growth Home decision guidance

- **Implemented:** Added accessible beginner/expert disclosures and
  recommendation “why this?” plus missing-evidence guidance to Growth Home.
- **Evidence:** Authenticated Growth browser scenarios pass **4/4**; LenOS
  TypeScript and Biome pass.
- **Updated evidence:** The focused Growth browser file now passes **5/5** and
  the complete local Playwright suite passes **37/37** after adding no-data,
  stale-source, and objective-scorecard coverage.

### 2026-08-30 — Phase 3 objective scorecard browser evidence

- **Implemented:** Added authenticated browser coverage for active objective
  scorecard rendering, typed objective editing, and history visibility.
- **Evidence:** The focused Growth browser file passes **6/6**; the complete
  local Playwright suite passes **37/37**.
- **Status:** Growth OS Phase 3 remains in progress pending broader exit-gate
  evidence.

### 2026-08-30 — Growth Home active-objective selection

- **Implemented:** Active strategy selection excludes closed historical
  objectives, preserving multiple objective records without hiding the current
  one.
- **Evidence:** Strategy/scorecard/scope coverage passes **7 focused tests**;
  Ruff, TypeScript, and Biome pass.

### 2026-08-30 — Growth Home recommendation-shape normalization

- **Implemented:** Structured recommendation responses now render their title
  or label in Growth Home instead of falling back to generic copy.
- **Evidence:** Authenticated Growth browser scenarios pass **4/4**; LenOS
  TypeScript and Biome pass.

### 2026-08-30 — Phase 3 role-denial evidence

- **Implemented:** Added explicit contributor-denial coverage for Macro
  Objective updates through the existing strategy authorization path.
- **Evidence:** Strategy/scorecard/scope coverage passes **8 focused tests**;
  Ruff, TypeScript, and Biome pass.
