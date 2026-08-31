# LenOS Production and Cloud Readiness Plan

**Status:** Approved implementation plan  
**Prerequisite:** `LENOS_GROWTH_OS_GAPS_AND_IMPLEMENTATION.md` Phase 10 complete.  
**Target:** Private-beta ready across LenOS web/relay and LenGrowth frontend/backend.  
**Scope:** Cloudflare, AWS, Scalingo, MongoDB Atlas, Supabase, cross-system contracts,
CI/CD, security, observability, recovery, and beta operations.

## 1. Definition of private-beta ready

Private-beta ready means a small allowlisted cohort can use the complete Growth OS
with production data while the team can detect, contain, recover from, and explain
failures. It does not mean general availability or enterprise compliance.

The release is ready only when:

- production configuration is secure and reproducible;
- workspace routing, identity, authorization, and tenant isolation are live-verified;
- the primary growth loop passes against real deployed services;
- no production dependency has a known single unmonitored failure path that causes
  silent data loss;
- backups and at least one restore are tested;
- deployments are immutable, reversible, and migration-safe;
- alerts reach named humans with usable runbooks;
- privacy, retention, workspace deletion, and support policies are explicit;
- the beta can be disabled per workspace without taking the legacy product down.

## 2. Current topology and responsibility

```text
Browser
  -> LenGrowth frontend (account, login, provisioning, legacy fallback)
  -> <slug>.lengrowth.com (LenOS web on Cloudflare)
       -> LenOS relay/API on AWS ALB/ECS
            -> RDS Postgres
            -> ElastiCache Redis
            -> S3 media
       -> LenGrowth API on Scalingo
            -> MongoDB Atlas
            -> Celery worker/beat
            -> nostradapter
            -> Supabase auth
            -> external integrations
```

Named owners and backups must be assigned for: LenOS web, relay, AWS data stores,
LenGrowth frontend, API, worker/beat, nostradapter, MongoDB, Supabase/auth,
Cloudflare/DNS, security/privacy, and beta support.

## 3. Verified starting risks from repository evidence

These are starting hypotheses until rechecked against live infrastructure:

| Area | Repository evidence | Required disposition |
|---|---|---|
| LenGrowth environment | Ops docs say production uses `ENVIRONMENT=development` and lacks a dedicated `SESSION_SECRET` | Correct and live-verify before traffic |
| Workspace routing | Docs record wildcard DNS/TLS work and a Cloudflare 522 on one workspace | Resolve and synthetically monitor |
| Security headers | `_headers` exists but docs say it was not deployed | Deploy and verify exact headers |
| Live E2E | Signed starter writes and agent callback have incomplete live evidence | Run full production-like E2E |
| Terraform state | No remote backend is configured in the repository | Bootstrap remote encrypted state and locking |
| Secrets | ECS task definitions use Secrets Manager references; rotation is not evidenced | Verify managed secrets and rotate through owners |
| Relay availability | Terraform now defaults to two private-subnet tasks, immutable images, and rollback | Apply and prove multi-AZ behavior live |
| RDS | Terraform now declares encryption, backups, Multi-AZ, deletion protection, and final snapshots | Review plan and prove restore |
| Redis | Terraform now declares a two-node encrypted, multi-AZ replication group | Approve migration and prove failover/loss recovery |
| S3 | Terraform now declares private, owned, encrypted, versioned, lifecycle-managed buckets with TLS denies | Apply and prove object access/recovery |
| Observability | Terraform now declares multiple alarms and requires an SNS topic input | Configure subscriptions and prove paging |
| Operations | Repository placeholders were replaced with secure-roster references; people are not assigned here | Assign humans and test incident process |
| Privacy | Workspace/GDPR deletion and retention remain incomplete | Implement or explicitly constrain beta |
| Credentials in docs | Non-secret examples and historical guidance still require owner review; no secret values are claimed | Scan history, remove exposed values, and use secure-store references |

Do not assume a documented “done” status is current. Live checks must record date,
environment, command/query, non-secret result, and responsible operator.

## 4. Environment model

Use distinct environments with distinct credentials and data:

| Environment | Purpose | Data | Access |
|---|---|---|---|
| Local | Developer iteration | synthetic | developer |
| CI | automated isolated tests | ephemeral synthetic | CI identity |
| Staging | production-shaped integration/load/security tests | synthetic or approved scrubbed fixtures | team |
| Production beta | allowlisted customers | production | least privilege |

No production key, token, database snapshot, OAuth secret, or customer data may be
used in local or CI. Workspace slugs and relay communities must be unique per
environment. External OAuth apps need separate callbacks and credentials.

## 5. Target reliability and security objectives

Initial private-beta objectives:

- Web shell availability: 99.9% monthly.
- Relay/API successful request availability: 99.9% excluding valid 4xx.
- p95 ordinary API latency: under 750 ms; report heavy endpoints separately.
- p95 accepted message fan-out: under 2 seconds.
- Growth action acknowledgement: under 5 seconds.
- Agent jobs: visible queued/running state within 10 seconds; completion SLO is
  operation-specific and must be displayed to the user.
- Cross-system callback delivery: 99.5% within 60 seconds, recoverable by replay.
- Recovery point objective: 24 hours maximum for private beta, target 1 hour for
  relational/event data; document each store separately.
- Recovery time objective: 4 hours for the complete service, 1 hour for rollback of
  a bad application release.
- Zero tolerated cross-tenant disclosure or unauthorized execution.

Alert thresholds must reflect error-budget consumption, not only host health.

## 6. Required security boundaries

- LenGrowth JWT/session proves account authentication.
- Nostr signature proves workspace actor identity.
- Active link plus company membership proves authorization.
- Workspace slug/host and relay community establish tenant scope.
- Every database/API query applies tenant scope before lookup or mutation.
- Agent tools receive minimum necessary credentials and company scope.
- OAuth tokens and provider secrets never enter messages, logs, analytics, or relay
  projection events.
- Public, paid, destructive, or externally communicated actions are approval-gated.
- Operator APIs use separate keys, network/rate controls, and audit events.

## 7. Phased production implementation

Execute phases sequentially. Emergency security fixes may happen earlier, but they
must be recorded in the appropriate phase evidence.

### Phase 0 — Handoff audit, freeze, and ownership

**Goal:** establish one truthful release inventory after the product plan.

**Work:**

- Review the Growth OS completion manifest: APIs, events, migrations, flags,
  dependencies, known limitations, and data owners.
- Assign service owner, backup, escalation contact, and support owner.
- Replace placeholders in `docs/ON-CALL.md` without publishing private phone numbers
  in a public repository; link to the secure roster.
- Inventory Cloudflare, AWS, Scalingo, Atlas, Supabase, GitHub, DNS, and OAuth access.
- Remove plaintext test credentials from docs/history where feasible, rotate exposed
  accounts, and reference a password manager/CI secret name.
- Freeze new features. Only readiness, defect, security, accessibility, and
  operational work enters the beta branch.
- Create a risk register with severity, owner, due date, mitigation, and evidence.

**Exit gate:** owners accept the service map; credentials are rotated; release
inventory and risks are complete; no P0 has no owner.

### Phase 1 — Production application configuration and edge routing

**Goal:** make the deployed frontend/backend boundary correct and secure.

**LenGrowth work:**

- Set and verify `ENVIRONMENT=production` and a unique `SESSION_SECRET`.
- Ensure secure, HTTP-only, SameSite-appropriate cookies and strict trusted hosts.
- Disable or authenticate API documentation and debug/error detail.
- Review CORS: only expected LenGrowth and workspace origins; test hostile suffixes.
- Validate Supabase JWT issuer, audience, expiry, clock skew, and key rotation.
- Verify managed-Nostr master key format, rotation procedure, and failure behavior.

**Cloudflare/LenOS web work:**

- Make wildcard workspace DNS/TLS deterministic and document the exact origin path.
- Separate web hostnames from relay hostnames; verify WebSocket upgrade behavior.
- Deploy CSP, HSTS after domain validation, `X-Content-Type-Options`, frame policy,
  referrer policy, permissions policy, and cache rules.
- Ensure SPA fallbacks do not turn missing API/assets into misleading HTML 200s.
- Add an edge request ID and preserve the cross-system correlation ID.
- Configure preview deployments so they cannot access production APIs/secrets by default.

**Tests:** DNS/TLS scan; headers; cache behavior; CORS; CSRF/session; hostile host;
workspace slug collision; WebSocket reconnect; browser matrix.

**Exit gate:** two production-like workspace hosts route reliably; security headers
and production environment behavior are live-verified; no 522/redirect loop.

### Phase 2 — Reproducible infrastructure, remote state, secrets, and artifacts

**Goal:** eliminate configuration drift and secret exposure.

**Terraform:**

- Create encrypted versioned remote state and state locking in a dedicated bootstrap
  stack. Restrict state access and enable audit logging.
- Import/reconcile all existing AWS resources before the next apply; save a reviewed
  plan and never recreate data resources accidentally.
- Pin Terraform and provider versions; run fmt/validate/plan in CI.
- Require reviewed production apply with protected environment approval.

**Secrets:**

- Move relay private key, database credentials, operator credentials, and integration
  secrets to AWS Secrets Manager/SSM, Scalingo secrets, Cloudflare secrets, GitHub
  environment secrets, or the appropriate managed store.
- Inject ECS secrets through the `secrets` field, not plaintext task-definition
  environment values.
- Use separate ECS execution and application task roles with least privilege.
- Rotate all migrated credentials and document emergency rotation.
- Add secret scanning and log-redaction tests.

**Artifacts:**

- Deploy relay by immutable digest or release tag, never mutable `:main`.
- Record web build commit and relay image digest in release metadata.
- Generate an SBOM, run dependency/container scanning, and define severity policy.

**Exit gate:** clean Terraform plan matches production; state is remote/locked;
production secrets are not in state/task plaintext where avoidable; deployed artifacts
are traceable and immutable.

### Phase 3 — Data durability, high availability, and capacity

**Goal:** tolerate common infrastructure failures without silent loss.

**RDS:**

- Enable explicit encryption, backup retention, deletion protection, final snapshots,
  maintenance windows, performance insights/monitoring as appropriate, and alarms.
- Choose Multi-AZ for beta or document an approved single-AZ exception with RTO.
- Review instance/storage sizing and connection limits using load-test evidence.
- Use application and migration DB roles separately.
- Run and time a point-in-time or snapshot restore into an isolated environment.

**Redis:**

- Use TLS/auth and encryption at rest where supported.
- Decide whether Redis is disposable cache/pubsub or contains recovery-critical state.
- Configure replication/failover or document degraded behavior and reconnection.
- Test relay behavior during Redis loss and recovery.

**S3:**

- Enable block-public-access, default encryption, versioning where useful, lifecycle,
  access logging/audit, and least-privilege bucket policy.
- Define media deletion, orphan cleanup, retention, malware/content handling, and restore.

**ECS/ALB:**

- Run at least two relay tasks across availability zones if architecture tests pass.
- Use private subnets without public task IPs when NAT/VPC endpoints are available.
- Enable deployment circuit breaker/rollback, graceful drain, health/readiness checks,
  autoscaling/capacity alarms, and ALB access logs.
- Validate multi-node WebSocket, Redis fan-out, reconnect, and no sticky-session dependency.

**MongoDB Atlas:**

- Reconfirm continuous backup/PITR, network access, least-privilege users, alerts, and
  a tested restore. Record results without customer data.

**Exit gate:** documented failure tests pass; both primary databases have successful
restore evidence; relay survives one task/AZ loss or the approved exception is explicit.

### Phase 4 — Safe migrations, deployments, and rollback

**Goal:** deploy frontend, backend, relay, and workers without incompatible windows.

**Work:**

- Replace unconditional application-start auto-migration in production with a
  controlled migration job or prove safe single-run locking.
- Require expand/migrate/contract schema changes across mixed versions.
- Define compatibility windows for LenOS events, LenGrowth APIs, callbacks, and workers.
- Add canary or blue/green relay deployment, Scalingo rollback procedure, and
  Cloudflare web rollback to a known build.
- Drain/retry Celery jobs safely; deployment must not lose callback metadata.
- Back up before destructive migrations and practice rollback/forward-fix.
- Add release checklist with ordering, health gates, abort criteria, and owners.

**Tests:** old client/new server; new client/old server; rolling relay; worker restart;
migration interruption; callback during deploy; rollback after partial rollout.

**Exit gate:** a staging release and rollback are completed within RTO with no lost or
duplicated task, message, approval, experiment, or callback.

### Phase 5 — Observability, SLOs, alerting, and incident response

**Goal:** make failures visible before users have to explain them.

**Telemetry:**

- Structured logs with environment, service, version, request/correlation ID,
  workspace/community hash or safe identifier, operation, latency, result, and error
  class. Never log content, secrets, tokens, private keys, or unnecessary PII.
- Metrics for web availability, relay connections/messages/errors, API latency/errors,
  DB pool/capacity, Redis, S3, workspace provisioning, identity linking, Celery queues,
  agent duration/failure, callbacks, OAuth syncs, and report jobs.
- Distributed or correlation-based traces across Cloudflare -> relay/LenGrowth ->
  Celery -> nostradapter -> relay callback.

**Operations:**

- Dashboards for platform health and the complete growth journey.
- Paging for fast-burn availability/error budgets, data-store risk, stuck queues,
  callback backlog, and cross-tenant/security signals.
- Ticket/non-page alerts for capacity trends and integration degradation.
- Synthetic tests for login, workspace lookup, relay connect, read/write, Growth Home,
  task dispatch, callback, and report retrieval.
- Runbooks with diagnosis, mitigation, rollback, recovery, and escalation.
- Conduct one tabletop and one real staging game day.

**Exit gate:** test incidents page the right person; dashboards identify the failing
boundary and correlation ID; on-call completes a staging incident exercise.

### Phase 6 — Security, privacy, abuse, and tenant conformance

**Goal:** prove that the beta can safely hold customer context and execute actions.

**Work:**

- Threat-model identity provisioning, Nostr linking/signing, operator API, workspace
  routing, relay events, agent tools, OAuth, uploads, webhooks, and callbacks.
- Run automated dependency/SAST/container/secret scans and remediate release-blocking
  findings.
- Perform authorization tests for every growth object/action and two-workspace
  conformance across API, relay, search, cache, agent memory, assets, reports, and logs.
- Add rate limits and quotas for signup, workspace creation, signing, messages, search,
  uploads, webhooks, agent runs, and external spend actions.
- Validate webhook signatures, replay protection, OAuth state, redirect allowlists,
  SSRF protections, upload type/size scanning, and safe URL rendering.
- Define data inventory, subprocessor list, retention schedule, export, workspace
  deletion, user deletion, legal hold, and backup deletion behavior.
- Implement workspace deletion/recovery or explicitly prohibit deletion during beta
  with a manual verified process and customer-facing policy.
- Confirm audit records for privileged, approval, credential, integration, export,
  deletion, and agent execution actions.
- Arrange an independent security review for the identity/link/operator boundary.

**Exit gate:** no open critical/high exploitable finding; tenant conformance passes;
privacy/retention/deletion policy is approved and operational.

### Phase 7 — Full-system verification and beta release candidate

**Goal:** prove the complete deployed product using realistic users and failures.

**Required live scenarios:**

1. New account -> managed identity -> workspace -> onboarding -> Growth Brief.
2. Existing account -> legacy dashboard remains accessible -> LenOS workspace works.
3. Objective -> recommendation -> task -> agent -> callback -> approval -> completion.
4. Experiment -> linked work -> metric result -> decision -> learning -> later recommendation.
5. Integration connect -> sync -> scorecard/report -> token expiry -> reconnect.
6. Teammate invite -> role restriction -> assignment -> approval.
7. Agency switch between two clients with no cache/event/memory leakage.
8. Relay reconnect and callback replay during a worker/relay deployment.
9. Data-store failover/degraded behavior and restore evidence.
10. Export and approved deletion/offboarding procedure.

**Quality and capacity:**

- Browser/responsive/accessibility/manual screen-reader review.
- Load test expected beta concurrency plus at least 3x headroom; include WebSockets,
  reports, search, uploads, and agent dispatch.
- Soak test long-lived WebSockets and scheduled jobs.
- Verify cost alarms and estimate cost per active workspace/agent run.
- Confirm support/help content matches actual behavior and known limitations.

**Exit gate:** one immutable release candidate passes every required scenario; all P0
and P1 defects are closed; P2 exceptions have owner and customer-safe workaround.

### Phase 8 — Controlled private-beta launch and soak

**Goal:** admit users gradually and retain a safe exit.

**Work:**

- Enable `growth_os` only for internal workspaces, then design partners in small waves.
- Keep the legacy dashboard and per-workspace kill switch available.
- Use daily launch review: availability, error budgets, onboarding completion, time to
  first recommendation, task/agent success, callback latency, data freshness, support,
  security, and cost.
- Freeze rollout automatically on P0, error-budget fast burn, tenant anomaly, data-loss
  suspicion, or unrecoverable callback backlog.
- Publish status/support path and beta limitations.
- Run backup checks and review access/audit logs during the soak.
- After at least seven stable days and completion of the go/no-go checklist, record the
  private-beta readiness decision.

**Exit gate:** named approvers sign off product, engineering, security/privacy,
operations, and support; beta cohort is active; rollback and kill switch remain tested.

## 8. CI/CD gates

Required protected-branch/release checks:

- LenOS formatting, lint, unit, integration, desktop/web/mobile checks applicable to
  changed paths, and relay conformance tests.
- LenGrowth backend tests, frontend type/lint/unit tests, contract tests, and targeted
  Celery/adapter tests.
- Cross-repository API/event contract compatibility.
- Terraform fmt/validate/plan and policy checks.
- Dependency, container, SAST, secret, and license scans.
- Web E2E and full-stack staging smoke.
- Migration dry run for schema/data changes.
- Immutable artifact provenance and deployment manifest.

Path filters may reduce irrelevant work but must never skip a consumer contract test
when a shared API/event changes.

## 9. Go/no-go checklist

### Product

- [ ] Growth OS product plan Phase 10 completed.
- [ ] Beginner, founder, team, experiment, failure, isolation, and agency scenarios pass.
- [ ] Legacy fallback and per-workspace kill switch pass.

### Security and privacy

- [ ] Production mode, sessions, CORS, CSP/TLS, identity, and operator boundary verified.
- [ ] No critical/high exploitable finding.
- [ ] Tenant conformance passes.
- [ ] Export, deletion/offboarding, retention, and incident policies approved.
- [ ] Test credentials removed/rotated.

### Reliability and data

- [ ] Immutable rollback-capable deploys.
- [ ] Remote locked Terraform state.
- [ ] Secrets in managed stores with rotation procedure.
- [ ] RDS and MongoDB restore tested.
- [ ] Redis/S3 loss and recovery behavior documented/tested.
- [ ] Capacity/load/soak tests meet beta targets.

### Operations

- [ ] Owners and backups named.
- [ ] SLOs, dashboards, synthetics, and paging active.
- [ ] Runbooks and support escalation tested.
- [ ] Cost budgets/alarms configured.
- [ ] Seven-day controlled soak completed or explicitly approved for first cohort.

## 10. Evidence format

Every completed phase records:

- date, environment, owner, and reviewer
- commits, PRs, infrastructure plan/apply, and deployed artifact IDs
- migrations and rollback point
- tests and exact non-secret results
- dashboard/alert/runbook links
- screenshots for user-facing flows
- backup/restore or incident exercise evidence where required
- residual risks, expiry date, and accountable owner

Never store passwords, private keys, tokens, connection strings, customer payloads, or
private incident details in this document.

## Completion records

### 2026-08-31 — Phase 0 handoff audit started

- **Owner/reviewer:** Codex for repository audit; human service, security,
  operations, and support owners are not assigned in this environment.
- **Reviewed:** The Growth OS release manifest and completion record now show
  Growth OS Phase 10 passed locally, with the local browser/backend evidence,
  reused LenGrowth authorities, flags, and explicit live limitations recorded.
  The repository inventory confirms that production/cloud readiness has not
  previously been completed and that `docs/ON-CALL.md` still contains role
  placeholders.
- **Evidence:** Local LenOS focused Growth browser coverage passes **9/9**;
  Phase 10 backend boundaries pass **26/26**; LenOS TypeScript, Biome, Ruff,
  and production build pass. Docker and expected local service listeners are
  unavailable, so no live infrastructure, credential-rotation, owner
  acceptance, or two-workspace runtime evidence is claimed.
- **Status:** Production/Cloud Readiness Phase 0 **IN PROGRESS**. The exit gate
  is blocked on named human owners/backups/escalation/support contacts,
  secure inventory of external access, credential rotation evidence, and a
  completed risk register. No production deployment or feature enablement was
  performed.
- **Next:** Complete the secure ownership/access handoff and risk register;
  then proceed to Phase 1 configuration and edge-routing verification.

### 2026-08-31 — Phase 0 on-call placeholder cleanup

- **Implemented:** Replaced literal owner, backup, escalation, and support
  placeholders in `docs/ON-CALL.md` with explicit secure-roster role references.
  The document now directs operators to resolve those roles to named people
  before beta without publishing private contact details.
- **Evidence:** Repository search finds no remaining literal on-call
  placeholders in the runbook; diff checks pass.
- **Status:** Phase 0 remains **IN PROGRESS**. The secure roster has not been
  provided or accepted in this environment, so human ownership is not claimed.

### 2026-08-31 — Phase 0 repository credential/state hygiene audit

- **Evidence:** A non-printing `git grep` scan found no credential-shaped
  assignments in tracked documentation/configuration files. Terraform state,
  variable files, plan outputs, provider cache, and downloaded artifacts are
  covered by the repository ignore rules and are not tracked. No secrets or
  state contents were written to this record.
- **Status:** Phase 0 remains **IN PROGRESS**. This local hygiene evidence does
  not replace credential rotation, history scanning, secure access inventory,
  or human owner acceptance.

### 2026-08-31 — Phase 1 web security-header hardening

- **Owner/reviewer:** Codex. **Environment:** repository and local production
  build; deployment and DNS were not modified.
- **Implemented:** Extended `web/public/_headers` with a restrictive CSP,
  `frame-ancestors`, `base-uri`, `object-src`, and `form-action` directives.
  The policy allows only same-origin scripts/styles, required browser assets,
  the authoritative Growth API, workspace/relay origins, and GitHub release
  metadata. Existing frame, content-type, referrer, permissions, and
  cross-origin headers remain in place.
- **Evidence:** LenOS production build passes. `git diff --check` passes. The
  CSP is repository evidence only; deployed header, TLS/HSTS, DNS, cache,
  WebSocket, CORS, hostile-host, and two-workspace checks require staging or
  production-like infrastructure.
- **Status:** Production Phase 1 **IN PROGRESS**. No HSTS header was added before
  domain validation, and no deployment was performed.
- **Next:** Validate the CSP against the deployed asset/connectivity matrix,
  establish production environment/session/CORS/trusted-host settings, and run
  the two-workspace edge-routing checks after the Phase 0 ownership handoff.

### 2026-08-31 — Phase 1 CORS boundary verification

- **Owner/reviewer:** Codex. **Environment:** local backend test suite and
  repository web artifact.
- **Implemented:** Tightened the default dynamic workspace CORS expression to
  an anchored, single-label `https://<workspace>.lengrowth.com` pattern. This
  preserves workspace subdomain support while rejecting hostile suffixes,
  nested lookalike hosts, and non-HTTPS origins. Added regression coverage for
  the origin pattern and required static security-header directives.
- **Files changed:** `backend/config.py`,
  `backend/tests/test_phase1_cors_and_headers.py`, and
  `web/public/_headers`.
- **Evidence:** Focused security/config tests pass **41/41** and Ruff passes.
  LenOS production build passes and packages `_headers`. Live CORS preflight,
  trusted-host, TLS, DNS, and hostile-host verification remain open.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**; Phase 0
  ownership and access handoff remains the earliest incomplete gate.

### 2026-08-31 — Phase 1 strict CORS validation guardrail

- **Implemented:** Production/strict runtime validation now rejects wildcard
  explicit CORS origins, non-HTTPS production origins, invalid custom CORS
  regular expressions, and patterns matching hostile suffixes outside the
  trusted workspace domain. The default anchored workspace pattern remains
  compatible with single-label `*.lengrowth.com` hosts.
- **Files changed:** `backend/runtime_validation.py`,
  `backend/config.py`, and `backend/tests/test_phase1_cors_and_headers.py`.
- **Evidence:** Focused CORS, runtime-validation, launch-readiness, and security
  tests pass **47/47**; Ruff passes. This is local validation only and does not
  prove deployed CORS, DNS, TLS, or edge behavior.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 1 CORS method/header minimization

- **Implemented:** Restricted API CORS methods to the supported HTTP verbs and
  replaced wildcard request headers with the explicit authentication,
  correlation/idempotency, LenOS scope, origin-context, and content headers
  used by the clients. Only required trace and rate-limit response headers are
  exposed.
- **Files changed:** `backend/main.py`.
- **Evidence:** Focused CORS, security, launch-readiness, and callback tests pass
  **52/52**; Ruff passes. Live preflight and hostile-origin verification remain
  deployment requirements.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 1 edge request tracing

- **Implemented:** The Cloudflare web worker now generates a bounded
  `X-Request-ID` when absent or malformed, preserves a bounded incoming
  `X-Correlation-ID`, forwards both through asset requests and WebSocket
  upgrades, and returns them on asset responses. Missing hashed assets continue
  to return a cache-bypassing 404 rather than SPA HTML.
- **Files changed:** `web/src/index.ts`.
- **Evidence:** LenOS TypeScript, Biome, production build, and `_headers`
  packaging checks pass. The build retains existing `import.meta` and chunk-size
  warnings. Deployed edge propagation, cache behavior, TLS, and WebSocket
  verification remain open.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 1 trusted-host enforcement

- **Implemented:** Added configurable `TRUSTED_HOSTS` handling and Starlette
  `TrustedHostMiddleware`. Strict/production runtime validation rejects the
  wildcard host default, URL-bearing values, and malformed entries, requiring
  explicit deployment hostnames before production startup validation can pass.
- **Files changed:** `backend/config.py`, `backend/main.py`,
  `backend/runtime_validation.py`, and the Phase 1 security tests.
- **Evidence:** Focused CORS, trusted-host, runtime-validation, launch-readiness,
  and security tests pass **49/49**; Ruff passes. Live host-header, proxy,
  TLS, and workspace-domain verification remain open.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 2 Terraform durability guardrails

- **Owner/reviewer:** Codex. **Environment:** local Terraform configuration;
  no apply, state migration, or cloud mutation performed.
- **Implemented:** RDS now defaults to private networking, encryption at rest,
  seven-day backups, Multi-AZ, deletion protection, copied snapshot tags, and
  mandatory final snapshots. Redis transit encryption is enabled on the
  existing cluster resource. S3 now has public-access blocking, default AES256
  encryption, versioning, incomplete-upload cleanup, and noncurrent-version
  retention. ECS now requires a non-empty immutable relay image input and
  rejects the mutable `:main` reference.
- **Files changed:** `infra/terraform/main.tf` and
  `infra/terraform/variables.tf`.
- **Evidence:** `terraform fmt -check` and `terraform validate` pass with the
  locked AWS provider. Remote state, secret-manager injection, IAM separation,
  immutable image resolution, Redis at-rest encryption migration, and reviewed
  production plan remain open.
- **Status:** Phase 2 **LOCAL GUARDRAILS RECORDED / NOT PASSED**. Phase 0
  ownership/access handoff remains the earliest incomplete production gate.

### 2026-08-31 — Phase 2 ECS secret-reference hardening

- **Implemented:** The relay task definition no longer embeds database, Redis,
  or relay private-key values in plaintext environment entries. Those values are
  sourced from required Secrets Manager ARNs through ECS `secrets`; a separate
  execution role has only `secretsmanager:GetSecretValue` for those ARNs, while
  the application task role retains the existing scoped S3 policy. RDS defaults
  to AWS-managed master-password storage.
- **Files changed:** `infra/terraform/main.tf` and
  `infra/terraform/variables.tf`.
- **Evidence:** `terraform validate` and `terraform fmt -check` pass. Static
  inspection confirms the sensitive runtime values are absent from the task
  `environment` list. No Terraform apply or remote-state operation was run.
- **Status:** Phase 2 **LOCAL GUARDRAILS RECORDED / NOT PASSED**. Secret creation,
  IAM review, existing-resource import/reconciliation, Redis at-rest encryption
  migration, and deployment verification remain open.

### 2026-08-31 — Phase 1 OAuth redirect boundary hardening

- **Implemented:** Replaced prefix-based OAuth return URL checks in the
  integrations, Google Search Console, and paid-media routes with exact
  configured-origin matching. Relative URLs, credentials in URLs, hostile
  suffixes, and lookalike subdomains now fall back to the configured frontend
  integration page.
- **Files changed:** `backend/runtime_validation.py`,
  `backend/routes/integrations.py`, `backend/routes/google_search_console.py`,
  `backend/routes/paid_media.py`, and the Phase 1 security tests.
- **Evidence:** The focused CORS/security/integration/callback suite passes
  **61/61**; Ruff passes. Live OAuth provider callbacks and deployed edge
  behavior remain unverified.
- **Status:** Phase 1 **LOCAL HARDENING RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 2 destruction guardrails

- **Implemented:** Added `prevent_destroy` to the RDS instance and media S3
  bucket so reviewed Terraform plans fail closed on accidental destructive
  operations.
- **Evidence:** `terraform validate` and `terraform fmt -check` pass. No apply
  or remote-state operation was run.
- **Status:** Phase 2 **LOCAL GUARDRAIL RECORDED / NOT PASSED**. State migration,
  reviewed plan approval, and cloud verification remain open.

### 2026-08-31 — Phase 2 Terraform CI gate

- **Implemented:** Added a path-scoped `Terraform Readiness` GitHub Actions
  workflow covering Terraform formatting, backend-disabled initialization,
  validation, and static checks that reject mutable `:main` relay images and
  sensitive ECS values in plaintext environment entries. The workflow uses
  read-only repository permissions and does not receive cloud credentials.
- **Files changed:** `.github/workflows/terraform-readiness.yml`.
- **Evidence:** Local Terraform format/validation, static guard checks, and
  workflow YAML parsing pass. Remote state, cloud credentials, and hosted CI
  execution remain unverified in this environment.
- **Status:** Phase 2 **LOCAL CI GATE RECORDED / NOT PASSED**. Phase 0 remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 2 remote-state migration runbook

- **Implemented:** Added `infra/terraform/REMOTE_STATE.md` with a non-secret
  bootstrap and migration procedure covering encrypted/versioned state,
  lockfiles or DynamoDB locking, least-privilege access, checksums, migration,
  drift review, and recovery evidence. It explicitly keeps remote state out of
  application secret handling.
- **Evidence:** The runbook contains no credentials or state payloads; local
  Terraform validation remains green. No remote backend was configured and no
  migration or cloud operation was run.
- **Status:** Phase 2 **DOCUMENTED / NOT PASSED**. Bootstrap, migration, lock
  testing, and human platform-owner review remain open.

### 2026-08-31 — LenGrowth full regression verification and compatibility fixes

- **Owner/reviewer:** Codex. **Environment:** local LenGrowth backend test
  environment; no cloud or production mutation performed.
- **Implemented:** Restored missing Pydantic `ConfigDict` imports and backward-
  compatible response-model aliases in legacy specialist modules so package
  exports and retrieval routes resolve consistently. Normalized naive and
  timezone-aware UTC timestamps at the onboarding staleness boundary.
- **Files changed:** `LenGrowth/backend/services/agents/backlink/models.py`,
  `blog/models.py`, `content_seo/models.py`, `crunchbase/models.py`,
  `market/models.py`, `pitchbook/models.py`, `product/models.py`,
  `seo/models.py`, `similarweb/models.py`, `technology_analyzer/models.py`,
  `word_of_mouth/models.py`, `youtube/models.py`, and
  `services/company_onboarding_service.py`.
- **Evidence:** Focused compatibility/regression tests pass **27/27** and the
  Phase 7 regression file passes **17/17**. The complete LenGrowth backend suite
  passes **771/771** with 888 non-failing warnings. Ruff passes for the changed
  modules. No secrets, customer data, migrations, deployments, or cloud state
  were touched.
- **Status:** This closes the local regression evidence for the current Phase 1/
  Phase 2 hardening work; Production/Cloud Readiness Phase 0 remains
  **IN PROGRESS**, and Phases 1–8 remain not passed until live handoff,
  infrastructure, restore, deployment, incident, security, and beta evidence
  is supplied.
- **Known limitations:** The warning set is non-failing and was not treated as
  production approval. Docker/listener, cloud, DNS/TLS, remote-state, restore,
  staging rollback, load/soak, live two-workspace, and human sign-off evidence
  remain unavailable in this environment.

### 2026-08-31 — Phase 3 relay availability guardrails

- **Owner/reviewer:** Codex. **Environment:** local Terraform configuration;
  no apply, state migration, or cloud mutation performed.
- **Implemented:** ECS now defaults to two relay tasks, spreads placement across
  availability zones, requires a 100% healthy deployment floor, enables health
  check grace, and rolls back failed deployments through the ECS deployment
  circuit breaker. CPU target-tracking autoscaling is configured with a bounded
  two-to-four-task default range. Terraform CI statically checks these controls.
- **Files changed:** `infra/terraform/main.tf`,
  `infra/terraform/variables.tf`, and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** `terraform fmt` and `terraform validate` pass; the Terraform
  readiness static assertions pass locally. Existing RDS encryption/Multi-AZ,
  S3 protection/versioning/lifecycle, Redis TLS, immutable image, secret
  references, and destruction guardrails remain validated locally.
- **Status:** Phase 3 **LOCAL GUARDRAILS RECORDED / NOT PASSED**. Cloud restore,
  Redis-loss/recovery, MongoDB Atlas PITR/restore, ALB access logging, private
  subnet/NAT or VPC endpoint deployment, multi-node WebSocket fan-out, and
  capacity evidence remain open. Phase 0 handoff remains the earliest incomplete
  production gate.

### 2026-08-31 — Phase 4 controlled migration task

- **Owner/reviewer:** Codex. **Environment:** local Terraform configuration;
  no deployment or database mutation performed.
- **Implemented:** The serving relay task now sets `LENOS_AUTO_MIGRATE=false`.
  A separate immutable-image ECS Fargate task definition runs
  `/usr/local/bin/lenos-admin migrate` with `DATABASE_URL` injected through
  Secrets Manager. The task definition family is exposed as a Terraform output
  for an operator-controlled migration step before a release rollout.
- **Files changed:** `infra/terraform/main.tf`, `infra/terraform/outputs.tf`,
  and `.github/workflows/terraform-readiness.yml`.
- **Evidence:** `terraform fmt`, `terraform validate`, and local static
  readiness assertions pass. CI now rejects reintroducing startup migration and
  requires the explicit migration task command.
- **Status:** Phase 4 **LOCAL MIGRATION GUARDRAIL RECORDED / NOT PASSED**.
  Staging expand/migrate/contract rehearsal, mixed-version compatibility,
  rolling relay/worker restart, callback-during-deploy, rollback timing, and
  operator release approval remain open. Phase 0 handoff remains the earliest
  incomplete production gate.

### 2026-08-31 — Phase 5 observability contract and infrastructure alarms

- **Owner/reviewer:** Codex. **Environment:** local repository and Terraform;
  no cloud notification routes or production dashboards were modified.
- **Implemented:** Added `docs/OBSERVABILITY.md` covering the bounded request /
  correlation-ID contract, safe structured-log fields, initial beta SLO targets,
  incident response, and required staging exercises. Terraform now provisions
  relay CPU, PostgreSQL free-storage, and Redis connection alarms alongside the
  existing unhealthy-host alarm, with a required SNS topic input for paging.
- **Files changed:** `docs/OBSERVABILITY.md`,
  `infra/terraform/main.tf`, and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** `terraform fmt`, `terraform validate`, and local alarm/static
  assertions pass. Existing LenOS edge tracing and LenGrowth callback
  correlation fields are documented as the cross-system join key.
- **Status:** Phase 5 **LOCAL OBSERVABILITY GUARDRAIL RECORDED / NOT PASSED**.
  Deployed dashboards, notification delivery, synthetic checks, paging tests,
  tabletop, and staging game day remain open. Phase 0 handoff remains the
  earliest incomplete production gate.

### 2026-08-31 — Phase 6 threat model and data lifecycle baseline

- **Owner/reviewer:** Codex. **Environment:** local repository review; no
  credentials, customer data, production systems, or external security review
  were accessed.
- **Implemented:** Added a threat model covering workspace isolation, callbacks,
  OAuth, SSRF, uploads, operator/signing boundaries, telemetry, supply chain,
  and availability. Added a data inventory/lifecycle baseline covering
  authority, retention, export, deletion, legal hold, backup expiry, and the
  manually verified beta deletion procedure.
- **Files changed:** `docs/SECURITY_THREAT_MODEL.md` and
  `docs/DATA_LIFECYCLE.md`.
- **Evidence:** Existing authorization, callback, URL, asset, integration, and
  secret-reference tests remain available; a tracked credential-pattern scan
  found only four known code/test/config pattern matches and no secret values
  were printed or added. Helm and `cargo deny` could not run because those
  executables are unavailable in this environment.
- **Status:** Phase 6 **LOCAL SECURITY/PRIVACY BASELINE RECORDED / NOT PASSED**.
  Independent identity/operator review, hosted dependency/SAST/container/secret
  scans, privacy/subprocessor approval, live deletion/export, tenant
  conformance, and staging abuse/failure evidence remain open. Phase 0 handoff
  remains the earliest incomplete production gate.

### 2026-08-31 — Phase 7 release-candidate scenario matrix

- **Owner/reviewer:** Codex. **Environment:** local repository evidence only;
  no release artifact was promoted and no staging/production data was used.
- **Implemented:** Added `docs/RELEASE_CANDIDATE.md` with the ten required
  end-to-end scenarios, immutable-artifact requirements, security/dependency
  scan gate, capacity/3x-headroom and soak evidence requirements, and explicit
  five-owner-group approval criteria. Existing local Growth browser/backend
  evidence is mapped without upgrading mocked evidence to live status.
- **Files changed:** `docs/RELEASE_CANDIDATE.md` and this completion record.
- **Evidence:** Existing authenticated Growth browser coverage is 9/9 and the
  full LenGrowth backend suite is 771/771. The release checklist is complete
  as a review artifact; no live scenario has been marked passed.
- **Status:** Phase 7 **LOCAL RELEASE-CANDIDATE CHECKLIST RECORDED / NOT
  PASSED**. Immutable deployed candidate, staging rollback, capacity/soak,
  data-store restore, live tenant isolation, accessibility review, and owner
  sign-off remain open. Phase 0 handoff remains the earliest incomplete
  production gate.

### 2026-08-31 — Phase 8 controlled launch and soak runbook

- **Owner/reviewer:** Codex. **Environment:** local documentation only; no
  feature flags, cohorts, or production traffic were changed.
- **Implemented:** Added `docs/BETA_LAUNCH_RUNBOOK.md` defining internal-first
  rollout, design-partner waves, daily aggregate review, automatic freeze
  triggers, workspace-scoped rollback with legacy fallback, and seven-day
  expansion/exit approval criteria.
- **Evidence:** The runbook references the existing feature flags,
  observability contract, correlation IDs, and legacy LenGrowth fallback. No
  cohort or launch decision was fabricated.
- **Status:** Phase 8 **LOCAL LAUNCH RUNBOOK RECORDED / NOT PASSED**. Named
  approvers, active cohort, deployed kill switch, alarm/access-log review,
  seven-day soak, and rollback exercise remain open. Phase 0 handoff remains
  the earliest incomplete production gate.

### 2026-08-31 — Phase 4 Helm controlled migration Job

- **Owner/reviewer:** Codex. **Environment:** local chart source review; no
  Helm release, database, or cluster was changed.
- **Implemented:** Activated the previously reserved
  `migrate.preUpgradeJob.enabled` path. When enabled, a bounded pre-install /
  pre-upgrade Job runs `/usr/local/bin/lenos-admin migrate` from the selected
  immutable image with `DATABASE_URL` sourced from the chart Secret, while the
  serving Deployment automatically disables startup migration. The chart README
  now documents the production procedure.
- **Files changed:** `deploy/charts/lenos/templates/migration-job.yaml`,
  `deploy/charts/lenos/templates/deployment.yaml`,
  `deploy/charts/lenos/values.yaml`, and `deploy/charts/lenos/README.md`.
- **Evidence:** Static assertions pass for the Deployment guard, hook Job,
  Secret reference, README procedure, and existing values schema. Helm lint and
  rendered upgrade tests remain unavailable because the `helm` executable is
  not installed in this environment.
- **Status:** Phase 4 **LOCAL HELM MIGRATION GUARDRAIL RECORDED / NOT PASSED**.
  Rendered chart review, staging mixed-version migration/rollback, and operator
  release evidence remain open. Phase 0 handoff remains the earliest incomplete
  production gate.

### 2026-08-31 — Local release verification audit

- **Evidence:** `pnpm --filter lenos-web typecheck` passes, and targeted Biome
  validation for the Growth UI, integration settings, and edge worker passes
  (**10 files**). The full recursive `pnpm check` remains red on 12 existing
  diagnostics in unrelated web files, primarily formatter output and explicit
  `any` usage in legacy tests/components; no broad reformat was applied.
- **Status:** This is a verification finding, not a release approval. The
  release-candidate gate remains open until the full workspace check is green
  or those unrelated findings receive a deliberate owner-approved disposition.

### 2026-08-31 — Web lint cleanup and file-size ratchet finding

- **Implemented:** Applied mechanical Biome formatting and safe type/lint
  corrections across the affected web tests/components, including typed window
  test overrides, explicit provider labels, and accurate React effect
  dependencies. No behavior was intentionally changed.
- **Evidence:** Full web Biome check passes and web TypeScript check passes.
  The recursive workspace check now reaches the file-size ratchet and reports
  only three Growth modules above the 1,000-line limit:
  `growth-api.ts` (1,102), `GrowthHomeSection.tsx` (1,054), and
  `GrowthWorkSection.tsx` (1,259).
- **Status:** Release verification remains **OPEN**. The size gate was not
  weakened; those modules must be split or receive an explicit reviewed
  exception before the full workspace check can pass.

### 2026-08-31 — Growth module size remediation in progress

- **Implemented:** Extracted public Growth API contracts into
  `web/src/features/growth/api/growth-types.ts` and extracted the Home insights
  disclosure/data-gap rendering into `GrowthHomeInsights.tsx`. Existing API
  exports are preserved through type re-exports; behavior and visible copy are
  unchanged.
- **Evidence:** `growth-api.ts` is now **981 lines** and
  `GrowthHomeSection.tsx` is **976 lines**, both below the 1,000-line ratchet.
  Targeted Biome and web TypeScript checks pass.
- **Status:** Release verification remains **OPEN** only for the remaining
  `GrowthWorkSection.tsx` size violation (1,259 lines). No size-limit exception
  was introduced.

### 2026-08-31 — Growth module size remediation complete

- **Implemented:** Split the Growth API contracts, Home insights, Work task
  list, Work toolbar/status, Work utilities, task header, and editable task
  description into focused modules. Preserved the existing typed API exports,
  task lifecycle handlers, filters, board/list views, pagination, and UX copy.
- **Evidence:** Full repository `pnpm check` passes across admin-web, web, and
  desktop. Web Biome, file-size, pubkey, pixel-text, and TypeScript checks pass;
  the authenticated Growth browser recovery suite passes **9/9**. The three
  previously oversized modules are now within the 1,000-line ratchet.
- **Status:** Local release verification is **GREEN** for this workspace gate.
  Production Phase 7 remains **NOT PASSED** pending immutable deployed-candidate
  scenarios, staging rollback, capacity/soak, live isolation, restore, and
  owner approvals.

### 2026-08-31 — Operational retention runbook reconciliation

- **Implemented:** Reconciled `docs/ON-CALL.md` with the beta data-lifecycle and
  Terraform baselines. The runbook now describes private/versioned media,
  infrastructure-managed lifecycle controls, backup-expiry handling, and the
  manually verified private-beta deletion procedure without claiming live
  deployment evidence.
- **Evidence:** Repository search confirms the stale roadmap wording was removed;
  `git diff --check` passes for the updated runbook and readiness record.
- **Status:** Phase 0 and Phase 6 remain **NOT PASSED** pending secure roster
  acceptance, deployed retention/backup verification, synthetic export/deletion,
  and two-workspace isolation evidence.
- **Next:** Complete the secure ownership/access handoff, then run the staging
  privacy and restore exercises against the deployed candidate.

### 2026-08-31 — Deployment guide drift reconciliation

- **Implemented:** Updated `docs/DEPLOYMENT.md` to point operators to the
  remote-state bootstrap/migration runbook and to document production
  `LENOS_AUTO_MIGRATE=false` with the controlled migration task. Removed stale
  wording that presented local Terraform state or startup migration as a
  production procedure.
- **Evidence:** Repository search confirms the old local-state warning and
  `LENOS_AUTO_MIGRATE=true` example are absent; `git diff --check` passes for
  the deployment and readiness documents.
- **Status:** Phase 2 and Phase 4 remain **LOCAL GUARDRAILS RECORDED / NOT
  PASSED** pending remote-state bootstrap, reviewed plan, staged migration,
  rollback, and operator evidence.

### 2026-08-31 — Secure access inventory handoff template

- **Implemented:** Added `docs/PRODUCTION_ACCESS_INVENTORY.md`, a non-secret
  inventory and acceptance checklist for Cloudflare/DNS, AWS services,
  Terraform state, Scalingo, MongoDB Atlas, Supabase/auth, GitHub, OAuth
  providers, and support tooling. It requires named owner/backup roles,
  least-privilege and MFA/SSO review, rotation evidence, environment
  separation, and break-glass validation without permitting secrets in Git.
- **Evidence:** The template covers every external system named by the Phase 0
  handoff requirements and explicitly distinguishes a completed secure copy
  from repository documentation. No credentials or customer data were added.
- **Status:** Phase 0 remains **IN PROGRESS** pending completion and acceptance
  of the secure inventory, credential rotation, and service ownership map.

### 2026-08-31 — Private relay networking guardrail

- **Implemented:** Added one NAT gateway and private route table per
  availability zone, associated both private subnets, and moved the ECS relay
  service off public subnets with `assign_public_ip = false`. The controlled
  migration task uses the same private-subnet execution procedure. Terraform
  readiness CI now rejects a deployment that loses these private-networking
  controls.
- **Files changed:** `infra/terraform/main.tf` and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** Terraform formatting and validation pass; local static checks
  confirm NAT gateways, private associations, private ECS subnets, and disabled
  public IP assignment. No cloud apply was performed.
- **Status:** Phase 3 **LOCAL NETWORKING GUARDRAIL RECORDED / NOT PASSED**.
  NAT routing, security-group reachability, service health, and failure/recovery
  behavior still require staging or production-shaped verification.

### 2026-08-31 — ALB access-log durability guardrail

- **Implemented:** Added a dedicated private, encrypted, versioned ALB log
  bucket with public-access blocking, owner controls, least-privilege AWS log
  delivery policy, and 30-day current/noncurrent retention. The ALB is now
  configured to emit access logs to that bucket, separate from tenant media.
- **Files changed:** `infra/terraform/main.tf` and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** Terraform formatting and validation pass; static checks require
  the dedicated bucket policy and ALB `access_logs` block. No cloud apply or
  deployed log-delivery test was performed.
- **Status:** Phase 3 **LOCAL OBSERVABILITY/DURABILITY GUARDRAIL RECORDED / NOT
  PASSED** pending reviewed plan/apply, delivered log verification, and restore
  or failure-injection evidence.

### 2026-08-31 — Redis multi-AZ durability guardrail

- **Implemented:** Replaced the single-node ElastiCache cluster definition with
  a two-node Redis replication group using automatic failover, multi-AZ
  placement, transit encryption, at-rest encryption, and an optional protected
  AUTH token input. Updated the endpoint output and CloudWatch alarm dimension
  to use the replication group.
- **Files changed:** `infra/terraform/main.tf`,
  `infra/terraform/variables.tf`, `infra/terraform/outputs.tf`, and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** Terraform formatting and validation pass; CI assertions require
  replication, failover, multi-AZ, and encryption controls. No cloud migration,
  failover test, or Redis URL rotation was performed.
- **Status:** Phase 3 **LOCAL REDIS DURABILITY GUARDRAIL RECORDED / NOT PASSED**.
  The existing single-node deployed resource, if present, requires an approved
  migration plan and staging failover/restore exercise before this configuration
  can be applied.

### 2026-08-31 — ALB log retention consistency fix

- **Implemented:** Enabled versioning on the dedicated ALB log bucket so its
  noncurrent-version retention rule is effective as configured.
- **Files changed:** `infra/terraform/main.tf` and
  `.github/workflows/terraform-readiness.yml`.
- **Evidence:** Terraform formatting/validation and the CI-equivalent static
  checks pass. No cloud state was changed.
- **Status:** Phase 3 remains **LOCAL GUARDRAILS RECORDED / NOT PASSED** pending
  deployed log delivery and retention verification.

### 2026-08-31 — VPC flow-log auditability guardrail

- **Implemented:** Added 30-day CloudWatch retention, a dedicated least-
  privilege delivery role, and an `ALL`-traffic VPC flow log with one-minute
  aggregation. This supplies an operator-visible network audit signal without
  sending application payloads to logs.
- **Files changed:** `infra/terraform/main.tf`,
  `.github/workflows/terraform-readiness.yml`, and this record.
- **Evidence:** Terraform formatting and validation pass; CI assertions require
  the flow-log resource and complete traffic capture. No cloud delivery,
  retention, or incident-query exercise was performed.
- **Status:** Phase 3/6 **LOCAL NETWORK AUDITABILITY GUARDRAIL RECORDED / NOT
  PASSED** pending reviewed apply, CloudWatch delivery verification, and a
  staging incident exercise.

### 2026-08-31 — ECS migration operator procedure

- **Implemented:** Added a non-secret production migration sequence to
  `docs/DEPLOYMENT.md`: record the serving rollback revision, verify a database
  restore point, require expand/migrate/contract compatibility, run the
  dedicated migration task in private subnets with public IPs disabled, gate on
  its exit code, and use the ECS circuit breaker for application rollback.
- **Evidence:** The procedure references the Terraform migration task and
  private-networking controls, includes no credentials or customer data, and
  explicitly forbids destructive migration rollback.
- **Status:** Phase 4 **LOCAL OPERATOR PROCEDURE RECORDED / NOT PASSED** pending
  staging execution, migration interruption/rollback rehearsal, and operator
  evidence.

### 2026-08-31 — Required alarm notification input

- **Implemented:** Made `alarm_sns_topic_arn` a required, non-empty Terraform
  input and updated the observability guidance so production plans cannot
  silently create alarms without a notification route. The topic still must be
  configured with protected on-call subscriptions and tested in staging.
- **Files changed:** `infra/terraform/variables.tf`, `docs/OBSERVABILITY.md`,
  and this record.
- **Evidence:** Terraform validation passes; variable validation rejects an
  empty alarm topic at plan time. No SNS topic, subscription, or paging test
  was created in this environment.
- **Status:** Phase 5 **LOCAL PAGING GUARDRAIL RECORDED / NOT PASSED** pending
  secure topic configuration, delivery test, and named-human acknowledgment.

### 2026-08-31 — RDS operational observability guardrail

- **Implemented:** Added deterministic RDS backup and maintenance windows,
  PostgreSQL/upgrade CloudWatch log exports, and seven-day Performance Insights
  retention to the Terraform baseline. CI now requires the backup window,
  maintenance window, and database log-export controls.
- **Files changed:** `infra/terraform/main.tf`,
  `.github/workflows/terraform-readiness.yml`, and this record.
- **Evidence:** Terraform formatting and validation pass; static checks confirm
  the operational RDS settings. Restore timing, log delivery, and capacity
  sizing remain staging/cloud evidence requirements.
- **Status:** Phase 2/3 **LOCAL RDS OPERABILITY GUARDRAIL RECORDED / NOT PASSED**.

### 2026-08-31 — Current LenGrowth backend evidence revalidation

- **Implemented:** Re-ran the complete backend suite from the current migrated
  `LenGrowth/backend` project, using its active `backend/pyproject.toml` and
  `backend/tests/` layout. No source or migration changes were made during the
  verification.
- **Evidence:** `pytest -q --disable-warnings --maxfail=1` completed with
  **771 passed, 888 warnings in 89.56s (0:01:29)**. The current LenOS root
  `pnpm check` also completed successfully across admin-web, web, and desktop.
- **Status:** Growth OS local backend evidence remains **REVALIDATED**.
  Production readiness is still **NOT PASSED** because live cross-system,
  infrastructure, restore, deployment, and human-approval gates are open.

### 2026-08-31 — Production risk baseline revalidated

- **Implemented:** Rebased the opening repository-risk table against the current
  Terraform and operational controls. It now distinguishes implemented local
  guardrails from the live evidence still required for state, secrets,
  networking, durability, observability, operations, privacy, and credentials.
- **Evidence:** The table references the current private networking, Redis HA,
  S3 ownership/TLS, ALB logging, VPC flow logs, required SNS input, and
  controlled migration definitions; no live completion is implied.
- **Status:** Phase 0 remains **IN PROGRESS** and Phases 1–8 remain **NOT
  PASSED** until external access, deployment, recovery, and human acceptance
  evidence is recorded.

### 2026-08-31 — Helm secret-source risk identified

- **Finding:** The Helm chart documents `secrets.existingSecret` as mandatory
  for production, but `templates/secret-chart.yaml` still permits generated
  chart-managed secrets whenever that value is omitted. Existing chart tests
  intentionally cover that path and do not all mark `quickstart=true`.
- **Action:** Added PR-009 to the production risk register. A fail-closed chart
  change requires a coordinated update of the render-test matrix and a Helm
  lint/render run; no chart behavior was changed in this audit.
- **Status:** Phase 6 **NOT PASSED**. Production chart use must provide an
  external Secret, and PR-009 remains open until the chart contract is enforced
  and verified.

### 2026-08-31 — Helm migration schema alignment

- **Implemented:** Corrected `migrate.activeDeadlineSeconds` in `values.yaml`
  to the `migrate.preUpgradeJob.activeDeadlineSeconds` path consumed by the
  migration Job template and declared by `values.schema.json`.
- **Evidence:** Helm 4.2.4 is installed locally; the prior lint failure for the
  unexpected `migrate.activeDeadlineSeconds` property is addressed. Remaining
  dependency availability and chart rendering are being verified separately.
- **Status:** Phase 4 **LOCAL HELM CONTRACT FIX RECORDED / NOT PASSED** pending
  complete lint/render and staging migration evidence.

### 2026-08-31 — Helm helper namespace and lint verification

- **Implemented:** Renamed the chart helper and validation definitions from the
  stale `buzz.*` namespace to `lenos.*`, matching the chart name and all
  template call sites. The previous schema-level migration timeout mismatch was
  also corrected so the controlled Job values are accepted by the chart schema.
- **Files changed:** `deploy/charts/lenos/templates/_helpers.tpl`,
  `deploy/charts/lenos/templates/_validate.tpl`, and
  `deploy/charts/lenos/values.yaml`.
- **Evidence:** Helm 4.2.4 `helm lint deploy/charts/lenos` reports **0 chart
  failures**. It emits only the expected warning that optional `postgres` and
  `redis` dependency archives are not present locally. No cluster or release
  was changed.
- **Status:** Phase 4/6 **LOCAL HELM LINT GUARDRAIL RECORDED / NOT PASSED**.
  The helper and values defects are resolved; remaining status depends on the
  complete dependency/render/test matrix and staging evidence.

### 2026-08-31 — Helm production secret fail-closed guardrail

- **Implemented:** The chart now rejects every non-quickstart release without
  `secrets.existingSecret`. Evaluation installs retain generated chart-managed
  secrets only when explicitly marked `quickstart=true`. Added the contract to
  the chart README and values comments, plus a negative validation fixture.
- **Files changed:** `deploy/charts/lenos/templates/_validate.tpl`,
  `deploy/charts/lenos/values.yaml`, `deploy/charts/lenos/README.md`, and
  `deploy/charts/lenos/tests/validation_test.yaml`.
- **Evidence:** Helm 4.2.4 rejects the unsafe production-shaped render with
  the expected `non-quickstart profiles require secrets.existingSecret`
  error; the production-shaped render with an external Secret succeeds. Helm
  lint remains at **0 chart failures**. No cluster or release was changed.
- **Status:** Phase 6 **LOCAL GUARDRAIL PASSED / LIVE GATE OPEN**. PR-009 is
  mitigated for all non-quickstart profiles; live Secret ownership and
  staging install evidence remain required before beta.

### 2026-08-31 — Full non-quickstart Secret contract verification

- **Implemented:** Extended the fail-closed chart validation from the controlled
  migration path to every non-quickstart profile. Updated Helm fixtures so
  generated-secret coverage is explicitly `quickstart=true` and production
  coverage supplies `secrets.existingSecret`. Added the pull-request/push Helm
  readiness workflow to keep dependency build, lint, unit tests, production
  rendering, and unsafe-secret rejection enforced in CI. Added the missing
  immutable `chart-v*` GHCR publication workflow with tag/version matching and
  package-scoped credentials, closing the README/tagging workflow drift. Both
  workflows install Helm-unittest from a pinned Linux release and verify its
  SHA-256 before installation. The publication job also attests the packaged
  chart with the repository-standard build-provenance action.
- **Evidence:** Helm 4.2.4 lint passed; production-shaped render with an
  external Secret passed; omission of the Secret was rejected with the expected
  validation error; quickstart bundled services rendered with generated Secret
  data; Helm-unittest passed all **9 suites / 45 tests** with schema validation
  intentionally skipped for template-level assertions; normal Helm rendering
  rejected invalid S3 addressing through `values.schema.json`; `git diff
  --check` passed. The complete checked-in fixture matrix also rendered
  successfully: `quickstart-values.yaml`, `ha-values.yaml`, and
  `production-existing-secret-values.yaml` (3/3).
- **Status:** Phase 6 **LOCAL CONTRACT PASSED / LIVE GATE OPEN**. Live cluster
  installation, Secret ownership, and staging recovery evidence remain open.

### 2026-08-31 — S3 transport-security guardrail

- **Implemented:** Added explicit `aws:SecureTransport=false` deny policies to
  the private tenant-media bucket and dedicated ALB log bucket while preserving
  scoped Elastic Load Balancing log delivery. CI now requires both bucket
  policies and the TLS-only condition.
- **Files changed:** `infra/terraform/main.tf`,
  `.github/workflows/terraform-readiness.yml`, and this record.
- **Evidence:** Terraform formatting and validation pass; static checks require
  both deny policies. No cloud policy evaluation or deployed access test was
  performed.
- **Status:** Phase 2/6 **LOCAL STORAGE SECURITY GUARDRAIL RECORDED / NOT
  PASSED** pending reviewed apply and live negative non-TLS access verification.

### 2026-08-31 — Tenant-media ownership guardrail

- **Implemented:** Enforced bucket-owner ownership on tenant media objects so
  object ACLs cannot reintroduce cross-account ownership ambiguity. CI now
  requires the media ownership-control resource alongside public-access,
  encryption, versioning, lifecycle, and TLS-deny controls.
- **Files changed:** `infra/terraform/main.tf`,
  `.github/workflows/terraform-readiness.yml`, and this record.
- **Evidence:** Terraform formatting and validation pass; static ownership
  assertions pass. No cloud ACL or cross-account upload test was performed.
- **Status:** Phase 2/6 **LOCAL MEDIA OWNERSHIP GUARDRAIL RECORDED / NOT
  PASSED** pending reviewed apply and deployed object-access verification.

### 2026-08-31 — Protected web deployment gate

- **Implemented:** The Cloudflare Workers deployment workflow now targets the
  protected GitHub `production` environment and runs the full repository
  `pnpm check` before building or deploying. This keeps deployment credentials
  behind environment protection and prevents a production web rollout from
  bypassing workspace, TypeScript, lint, file-size, and public-key checks.
- **Files changed:** `.github/workflows/web-deploy.yml` and this readiness
  record.
- **Evidence:** Workflow source review confirms the production environment is
  declared before deployment and the readiness check precedes the build/deploy
  steps. GitHub environment reviewers, secret configuration, and a live
  deployment remain unverified.
- **Status:** Phase 7/8 **LOCAL DEPLOYMENT GATE RECORDED / NOT PASSED** pending
  protected-environment configuration, immutable candidate evidence, and a
  successful staging/production deployment exercise.

### 2026-08-31 — Terraform local validation revalidated

- **Evidence:** Terraform v1.15.8 `fmt -check -diff`, backendless
  `terraform init -input=false`, and `terraform validate` all passed in
  `infra/terraform`; AWS provider v5.100.0 was reused from the dependency lock.
- **Known limitation:** No remote backend was selected, no plan/apply was
  approved, and no cloud resources or state were changed.
- **Status:** Phase 2 **LOCAL CONFIGURATION VALIDATED / LIVE REMOTE-STATE AND
  APPLY GATE OPEN**.

### 2026-08-31 — Terraform state migration blocker identified

- **Finding:** A credential-free, refresh-disabled local plan using placeholder
  non-secret inputs reached the existing local state and proposed an RDS
  replacement while `lifecycle.prevent_destroy` is enabled. The replacement
  is materially caused by the hardened configuration changing storage
  encryption from disabled to enabled (alongside multi-AZ and backup
  hardening), so it cannot be silently normalized as an in-place update.
  Terraform stopped with `Instance cannot be destroyed`; state inspection also
  shows the legacy Redis resource address, so the Redis resource-type migration
  requires the same explicit review. No apply or cloud mutation occurred.
- **Action:** Added PR-010 to the production risk register. The required next
  step is an approved remote-state export/snapshot/import or staged migration
  procedure, followed by a reviewed plan. `prevent_destroy` must not be disabled
  merely to make the plan green; the detailed guardrail is now in
  `infra/terraform/REMOTE_STATE.md`.
- **Status:** Phase 2 **LOCAL VALIDATION COMPLETE / STATE MIGRATION BLOCKER
  OPEN**. Remote-state ownership and data-preserving migration evidence remain
  required before infrastructure apply.

### 2026-08-31 — Terraform data-safety CI assertions

- **Implemented:** Extended the Terraform readiness workflow’s static contract
  checks to require the hardened RDS resource, encrypted storage,
  `prevent_destroy`, and final-snapshot retention alongside the existing
  highly-available encrypted Redis assertions. These checks are intentionally
  configuration-only and cannot approve a state migration or apply.
- **Files changed:** `.github/workflows/terraform-readiness.yml` and this
  record.
- **Evidence:** Terraform `fmt -check`, `validate`, and `git diff --check`
  pass locally. The refresh-disabled plan still stops on the RDS replacement,
  proving the destructive drift remains fail-closed until reviewed.
- **Status:** Phase 2 **LOCAL DATA-SAFETY CI GUARDRAIL PASSED / REMOTE-STATE
  MIGRATION GATE OPEN**.

### 2026-08-31 — Deployment guide safety reconciliation

- **Implemented:** Removed live account, host, certificate, channel, and
  identity identifiers from the deployment guide; replaced them with secure
  inventory references. Reconciled the guide’s legacy mutable-image/manual-
  deployment and local-state instructions with immutable release artifacts,
  protected CI/CD, and the remote-state migration runbook.
- **Evidence:** Repository search finds no prior production host/account/channel
  identifiers in `docs/DEPLOYMENT.md`; `git diff --check` passes. No external
  systems or credentials were changed.
- **Status:** Phase 0/2 **DOCUMENTATION SAFETY IMPROVED / LIVE HANDOFF AND
  REMOTE-STATE GATES OPEN**.

### 2026-08-31 — Local documentation secret scan bounded

- **Evidence:** A repository-local heuristic scan of documentation found no
  private-key PEM markers. It is intentionally not treated as history-wide
  secret-scanning evidence and does not prove credential rotation or hosted
  scanner acceptance.
- **Status:** Security evidence **LOCAL HEURISTIC ONLY / HOSTED HISTORY SCAN
  AND CREDENTIAL-ROTATION GATE OPEN**.

### 2026-08-31 — Git history credential-pattern scan bounded

- **Evidence:** A bounded scan across reachable Git history matched targeted
  credential/private-key patterns in **14 revisions / 17 files**. Current-tree
  inspection shows the matches are placeholders, Terraform variable
  references, and synthetic backup/relay test fixtures; matched values were
  suppressed. No production credential was identified by this review.
- **Known limitation:** Pattern matching cannot establish that history is
  clean, cannot replace hosted secret-scanning tooling, and does not prove
  credential rotation. Hosted history scanning and owner-confirmed rotation
  remain open.
- **Status:** Security evidence **PATTERN REVIEW COMPLETE / HOSTED SCAN AND
  CREDENTIAL-ROTATION GATE OPEN**.

### 2026-08-31 — Local scanner availability check

- **Evidence:** `gitleaks`, `trufflehog`, `semgrep`, `syft`, and `grype` are
  unavailable in the local environment. Repository CI currently has no
  hosted secret-scanning job; the existing local pattern review and workflow
  contract checks are supplemental controls only.
- **Status:** Security evidence **LOCAL CONTROLS ONLY / HOSTED SCANNER
  INSTALLATION AND ACCEPTANCE REQUIRED**.

### 2026-08-31 — Live route repair and rollout resume audit

- **Implemented:** Deployed the current LenOS web candidate to the established
  `e2etest26.lengrowth.com/*` Worker route after verifying that Cloudflare had
  only `lenos-e2e32.lengrowth.com/*` mapped to Worker `lenos`. Persisted the
  route in `web/wrangler.jsonc`.
- **Live evidence:** Cloudflare deployment version `4963cfd7-4b82-4de5-8515-2992f602d85e`
  succeeded on 2026-08-31. `https://e2etest26.lengrowth.com`, `/health`, and
  `/workspace` returned HTTP 200 afterward. `https://relay.lengrowth.com/health`
  returned HTTP 200; the relay ALB target was healthy and ECS had one running
  task against desired count one.
- **Local evidence:** LenOS `pnpm check`, LenOS web production build, LenGrowth
  backend `pytest -q --disable-warnings --maxfail=1` (**771 passed, 888
  warnings in 81.39s**), and LenGrowth frontend production build passed.
- **AWS evidence:** Account `288947333598`, region `us-east-1`, RDS was
  available but remained unencrypted, single-AZ, and at zero-day backup
  retention; Redis was available but remained a single-node legacy cluster.
  These are live failures against the hardened target, not completion evidence.
- **State/bootstrap:** Created encrypted/versioned/publicly blocked state bucket
  `lenos-terraform-state-288947333598` with a TLS-deny policy and retained a
  hashed local-state backup outside the repository. Migration was not run because
  the authoritative state key/namespace and approved state role are absent from
  the secure inventory; Terraform also lacks the required secret ARNs, immutable
  image, and alarm topic input.
- **CI evidence:** GitHub OIDC assumption failed in the latest `E2E daily` run
  before secret retrieval; the latest published `Web deploy`, Docker, and Sprig
  runs passed, while the published `CI` run failed on web formatting. The main
  branch is not protected and no required checks are configured.
- **Desktop evidence:** `desktop/pnpm test` passed all **3,928 tests**;
  `desktop/pnpm build` passed; and unsigned Tauri packaging completed with MSI
  and NSIS installers for version `0.5.3`. The generated installers are locally
  verified as `NotSigned`; signing, publication, update-feed verification, and
  authenticated desktop smoke remain open.
- **Repository security evidence:** GitHub repository-native secret scanning,
  push protection, and Dependabot security updates are enabled. GitHub reported
  zero secret-scanning alerts and zero Dependabot alerts at audit time. The
  repository API did not enable non-provider-pattern scanning or validity checks;
  hosted SAST/container scan evidence and clean required CI checks remain open.
- **CI/OIDC resume evidence:** Created the AWS GitHub OIDC provider and a
  repository-scoped `lenos-github-e2e` role using the repository's immutable
  owner/repository subject IDs, and configured the repository `AWS_ROLE_ARN`
  secret. A hosted rerun successfully completed `Configure AWS credentials
  (OIDC)`; the next step failed with `ResourceNotFound` because
  `lenos/test-owner-privkey` does not exist. A temporary Secrets Manager
  bootstrap policy was removed after AWS continued to deny `CreateSecret`.
- **Status:** Phase 0/1 **PARTIALLY REVALIDATED / NOT PASSED**. The documented
  staging web 522 is repaired, but authenticated two-workspace tests, OIDC/AWS
  test-secret access, remote-state migration, hardened infrastructure apply,
  restore evidence, and production release gates remain open.

### 2026-08-31 — Hosted production E2E authentication and media contract resume

- **Implemented:** Published NIP-98 HTTP authentication fixes for the event
  reminder, human/agent content, extended media, video, Nostr interop, persona,
  and relay E2E helpers. Published the workflow's production
  `RELAY_HTTP_URL=https://relay.lengrowth.com` setting and non-vacuous live-test
  selector.
- **Live evidence:** Local live suites passed event reminders **29/29**,
  human/agent content **19/19**, extended media **21/21**, video **7/7**, Nostr
  interop **25/25**, and personas **24/24**. Hosted runs independently passed
  those same suites and measured **211** selected tests rather than zero tests.
- **Remaining hosted evidence:** Relay REST-auth fixes are published, but the
  latest hosted run is not yet a full pass. Database-backed invite tests cannot
  reach the private RDS instance from the hosted runner; one relay behavior
  assertion is intermittent and requires another hosted result.
- **Status:** Authenticated relay/media E2E **SUBSTANTIALLY REPAIRED / HOSTED
  FULL PASS OPEN**. Terraform, migration/restore, hardened AWS resources,
  Cloudflare staging relay DNS, signed desktop release, and branch-protection
  gates remain open.

### 2026-08-31 — Relay E2E completion and private-RDS invite verification

- **Implemented:** Updated the subscription-limit E2E to retain the full
  1,024-subscription assertion while respecting the relay's 50-REQ/5s quota,
  and made invite fixtures seed the host derived from `RELAY_URL` instead of
  hard-coded `localhost:3000`. Published commits `e465d956` and `1ea16c47`.
- **Live evidence:** Local production relay validation passed the full
  subscription-limit test (**1,024 active subscriptions + overflow**,
  **135.07s**) and the unarchive notification test (**1/1, 2.29s**).
  Hosted run `33404694734` passed **40/43** relay tests, including those two;
  the only three failures were the DB seed preflight from the public runner.
- **Private-VPC evidence:** Temporary Fargate task `f9ebf054...`, using the
  existing ECS subnet/security-group path to private RDS, passed all four
  invite tests (**4/4, 1.61s**). The task and its three temporary task
  definition revisions were stopped/deregistered after verification.
- **Current status:** Relay behavior and invite implementation are verified
  live. GitHub-hosted full-suite acceptance still cannot be green for the
  DB-seeding tests without an in-VPC runner; the focused private-VPC evidence
  is the authoritative result for that network-dependent subset. Terraform,
  migration/restore, hardened AWS resources, Cloudflare staging relay DNS,
  signed desktop release, and branch-protection gates remain open.

### 2026-08-31 — Live database migration and hardened-plan review

- **Migration evidence:** An ECS task launched on the existing relay image and
  authoritative ECS/RDS network path initialized successfully; its startup log
  recorded `Postgres connected` followed by `Database migrations complete`,
  then Redis, FTS search, media storage, health, and relay listeners becoming
  ready. The temporary task was stopped after verification.
- **Terraform evidence:** A refresh-disabled plan using the published immutable
  image digest and production resource state evaluated successfully, then
  stopped on the expected `aws_db_instance.lenos` `prevent_destroy` guard. The
  proposed plan was **37 to add, 3 to change, 4 to destroy**, including an
  encrypted Multi-AZ RDS replacement and legacy single-node Redis replacement;
  no apply was performed without an approved data cutover/restore plan.
- **Current status:** Migration execution is live-verified. Hardened RDS/Redis
  replacement, Terraform remote-state migration, backup/restore exercise, and
  alarm notification ownership remain open.

### 2026-08-31 — Cloudflare routing and CI remediation resume

- **Cloudflare/Wrangler evidence:** Wrangler 4.127.1 authenticated to the
  authoritative Lengrowth account. The `lenos` Worker deployed as version
  `6d20309d-941f-4830-b03c-20440f246fb0`; `/`, `/health`, and `/workspace`
  returned HTTP 200 on both `e2etest26.lengrowth.com` and
  `lenos-e2e32.lengrowth.com`.
- **CI fixes:** Published scoped clippy/doc fixes and a narrow
  `RUSTSEC-2026-0192` exception for the unmaintained `ttf-parser` transitive
  dependency, with no safe upstream replacement. Local `cargo clippy` for the
  affected crates and `cargo-deny check advisories` pass; yanked crates remain
  warnings. GitHub Security passed on the final CI run, while the remaining
  platform jobs are still running at audit time.
- **Repository governance:** `main` is now protected with strict required
  status check `main CI`, administrator enforcement, and conversation
  resolution enabled; force-pushes and branch deletion are disabled.
- **Current status:** Cloudflare staging/workspace routing and security policy
  are live-verified. Final GitHub CI completion, Terraform apply/state
  migration, hardened RDS/Redis cutover, backup/restore, signed desktop
  release, and LenGrowth frontend lint/full-test remediation remain open.

## 11. Beyond private beta

General production readiness should add stronger availability targets, larger capacity
tests, formal penetration testing, SSO/SCIM, contractual data-processing requirements,
data residency decisions, longer operational soak, customer-facing status history,
formal business continuity exercises, and removal of the legacy fallback only after
adoption and recovery evidence justify it.
