# LenOS Growth OS Release Manifest

**Status:** Local candidate — not approved for private beta or production.
**Updated:** 2026-08-31
**Owner:** Codex (implementation); service and support ownership still requires
acceptance.

## Scope and authority

- LenGrowth remains authoritative for growth companies, strategies,
  recommendations, tasks, approvals, experiments, integrations, assets, and
  specialist pipeline records during beta.
- LenOS remains authoritative for workspace collaboration, navigation, relay
  identity, and workspace membership context.
- The LenOS web client uses the typed Growth API boundary. MCP remains the agent
  tool surface.
- The legacy LenGrowth dashboard remains available while migration flags are
  evaluated.

## Feature flags

| Flag | Purpose | Default in production-like mode |
| --- | --- | --- |
| `GROWTH_OS_ENABLED` | Enable LenOS Growth Home/Work surfaces | Off |
| `GROWTH_ONBOARDING_ENABLED` | Enable the LenOS Growth intake bridge | Off |
| `GROWTH_EXPERIMENTS_ENABLED` | Enable experiment lifecycle surfaces | Off |
| `GROWTH_PORTFOLIO_ENABLED` | Enable portfolio/specialist attention surfaces | Off |
| `GROWTH_OS_WORKSPACE_ALLOWLIST` | Restrict enabled Growth flags to comma-separated workspace slugs | Empty (no extra restriction) |
| `LEGACY_LENGROWTH_DASHBOARD_ENABLED` | Preserve legacy dashboard fallback | On |

## Implemented API surfaces

- Workspace-scoped readiness, companies, onboarding extraction, assessment,
  strategy, reporting, manual metrics, tasks, approvals, assignment history,
  task messages, task completion, and asset promotion.
- Company-scoped experiments with idempotent create, backlog/active/concluded
  lifecycle, explicit insufficient-evidence conclusion, and company decision
  memory provenance.
- Company-scoped membership listing, invites, role updates, specialist request
  handoff, specialist pipeline, and integration status/disconnect.
- Requests carry `correlationId`, `idempotencyKey`, workspace slug, relay
  community, actor pubkey, and company identity where applicable.

## Data and migration notes

- No LenOS duplicate business-record store was introduced.
- Experiment persistence uses the LenGrowth `experiments` collection and indexes;
  no destructive migration is required.
- Existing task completion can promote results to the existing LenGrowth asset
  service and memory-ingestion service.
- OAuth tokens remain inside the LenGrowth integration service and are never
  placed in relay messages or frontend state.

## Evidence recorded

- Frontend targeted Biome and TypeScript checks pass.
- Frontend production build passes with pre-existing chunk-size and `import.meta`
  warnings.
- Browser evidence: the focused authenticated Growth recovery file passes 9/9,
  including the profile-onboarding gate, Growth navigation, Team pending-owner
  and specialist availability states, portfolio metrics failure injection with
  isolated retry and client switching, OAuth callback reopening and
  failure/expired-token reconnect recovery, onboarding assessment recovery, and
  task/report/asset flows. Existing responsive/authenticated coverage passes
  9/9 at 320/768/1280px with keyboard focus and dialog semantics.
  This is local mocked browser evidence and does not establish live
  cross-system readiness.
- Backend Ruff and targeted compile checks pass.
- Full active LenGrowth backend regression after task and message scope
  hardening: **753 passed, 1,174 warnings in 77.23s**.
- Existing task, approval, assignment, membership, specialist, integration,
  onboarding, reporting, and isolation suites pass in focused runs.
- Experiment lifecycle and typed company-isolation tests pass (8); integration
  status/OAuth/redaction tests pass (10), including browser-query envelope
  propagation and callback persistence.
- The Integrations settings surface now labels connected sources as healthy,
  awaiting first sync, stale, or needing attention from the authoritative sync
  timestamp/status/error fields; no token or provider payload is exposed.
- The Portfolio surface aggregates linked, active, and pending client counts
  across all agency workspaces returned by the scoped LenGrowth API while
  retaining per-workspace selection and export. Failed workspace metric reads
  are explicitly marked as partial and can be retried without hiding the
  failure; automatic retries are disabled for this external read so the
  explicit retry is bounded.
- The Growth API client now exposes the migration telemetry taxonomy as a
  typed contract and records `growth_report_viewed` through the existing
  envelope-aware telemetry endpoint as a best-effort UI event. Telemetry
  metadata is limited to safe workspace/community/company context; failures do
  not block report rendering.
- The onboarding bridge now records start, per-prompt progression, and
  completed-assessment milestones through the same typed endpoint, using safe
  prompt identifiers/counts and the full scope envelope.
- Growth suggestion cards now record first-recommendation visibility and
  successful typed task creation with stable per-event idempotency keys and
  originating suggestion/channel context.
- Work lifecycle evidence covers a queued recommendation opening in typed task
  detail, starting, submitting an observed result, reaching completed state,
  accepting the result, and recording an approval decision.
- Task-detail reads now normalize LenGrowth's `{status, data}` response in the
  typed client, while the backend enforces the LenOS scope envelope on detail
  reads; foreign-workspace reads are rejected before task access checks.
- Typed task-message updates now enforce the same scope boundary before any
  message mutation.
- Worker callback projection now preserves durable origin thread, actor, and
  company scope alongside workspace/community and operation identifiers; Nostr
  result events expose those values as scoped tags when present.

## Known gaps and approval conditions

- No live MongoDB, relay, OAuth-provider, production-host, or two-workspace
  browser evidence has been captured in this environment.
- Full router discovery is environment-sensitive because agent routers load
  optional integrations; declared `croniter` and `pytrends` dependencies were
  installed for the current validation run.
- Complete manual accessibility sign-off, visual regression, live portfolio
  aggregation, and all private-beta acceptance scenarios remain open.
- Live full-stack browser evidence, including two-workspace isolation and
  external dependency failure injection, remains required for Phase 10.
- Draft support guidance is available at
  `docs/LENOS_GROWTH_OS_SUPPORT_TROUBLESHOOTING.md`; service, security, and
  support-owner acceptance remains required.
- This draft must be reviewed by service, security, and support owners before
  any beta or production readiness claim.

### 2026-08-30 — Callback scope projection hardening

- **Implemented:** Celery success/failure callbacks now inherit
  `originThreadId`, `actorPubkey`, and `companyId` from the durable task
  envelope. The Nostr publisher carries them into result-event tags while
  retaining legacy callbacks when those fields are absent.
- **Evidence:** Callback-spine and task-serialization coverage passes **7
  focused tests**; Ruff is clean. The complete active LenGrowth backend
  regression passes **753 tests, 1,174 warnings in 77.48s**.
- **Limitations:** Live relay delivery, callback retry, and production-like
  two-workspace evidence remain open.

### 2026-08-30 — Phase 3 objective scorecard browser evidence

- **Implemented:** Added authenticated browser coverage for rendering an active
  objective scorecard, editing its objective through the typed API, and showing
  objective history.
- **Evidence:** The focused Growth browser file passes **6/6**; the complete
  local Playwright suite passes **37/37** after a fresh production build.
- **Limitations:** This remains mocked browser evidence; live provider,
  authorization, and multi-workspace runtime evidence remain open.

### 2026-08-30 — Growth Home objective scorecard fields

- **Implemented:** The existing company strategy/north-star system now stores
  optional numeric baseline, numeric target, and target date values. Growth Home
  exposes those fields in the objective editor and renders the resulting
  scorecard while retaining existing audit history and legacy records.
- **Evidence:** Strategy alignment and typed scope-negative coverage pass **6
  focused tests**; Ruff, LenOS TypeScript, and Biome checks pass.
- **Limitations:** Live multi-workspace authorization and production-like
  scorecard evidence remain open.

### 2026-08-30 — Growth Home decision guidance

- **Implemented:** Growth Home now exposes accessible Quick read and Expert
  detail disclosures, plus recommendation rationale and explicit missing-
  evidence guidance. This makes the objective, bottleneck, next action, and
  confidence caveats usable without opening chat.
- **Evidence:** The authenticated Growth browser scenarios pass **4/4**;
  LenOS TypeScript and Biome checks pass.
- **Limitations:** Live multi-workspace authorization and production-like
  evidence remain open.

### 2026-08-30 — Phase 3 no-data and stale-source browser evidence

- **Implemented:** Added an authenticated Growth Home scenario covering no
  objective data, structured next-action guidance, stale connected-source
  labeling, and reporting warnings.
- **Evidence:** The focused Growth browser file passes **5/5** and the complete
  local Playwright suite passes **36/36**; the fresh LenOS production build,
  TypeScript, and Biome checks pass.
- **Limitations:** This remains mocked browser evidence; live provider,
  authorization, and multi-workspace runtime evidence remain open.

### 2026-08-30 — Growth Home active-objective selection

- **Implemented:** Strategy reads, updates, and closes now select the active
  objective explicitly, so closed historical objectives cannot hide a newer
  active objective.
- **Evidence:** Strategy, scorecard, and typed scope-negative coverage passes
  **7 focused tests**; Ruff, LenOS TypeScript, and Biome pass.
- **Limitations:** Live multi-workspace authorization and production-like
  evidence remain open.

### 2026-08-30 — Growth Home recommendation-shape normalization

- **Implemented:** Growth Home now normalizes structured recommendation payloads
  (`title`/`label`) before rendering the next action, while retaining explicit
  rationale and missing-evidence details.
- **Evidence:** Authenticated Growth browser scenarios pass **4/4**; LenOS
  TypeScript and Biome checks pass.
- **Limitations:** Live multi-workspace authorization and production-like
  evidence remain open.

### 2026-08-30 — Phase 3 role-denial evidence

- **Implemented:** Added explicit contributor-denial coverage for Macro
  Objective updates through the existing strategy authorization path.
- **Evidence:** Strategy/scorecard/scope coverage passes **8 focused tests**;
  Ruff is clean. The complete local Playwright suite remains **37/37**.
- **Limitations:** Live authorization and multi-workspace runtime evidence
  remain open.
