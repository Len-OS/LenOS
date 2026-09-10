# LenOS Production Readiness Risk Register

**Status:** Working register — not a beta approval.
**Updated:** 2026-08-31

Owners and due dates use the secure operations roster; no private contacts are
stored in the repository. A risk cannot be closed from local code evidence alone
when its control depends on deployed infrastructure or human acceptance.

| ID | Severity | Risk | Owner | Due | Mitigation / evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PR-001 | P0 | No named service owners, backups, escalation contact, or support owner | Secure operations roster | Before beta | Assign and obtain acceptance for the service map and on-call runbook | Open |
| PR-002 | P0 | Production credentials and external access rotation are not evidenced | Security / platform | Before beta | Inventory access; rotate through managed stores; record non-secret verification | Partially mitigated: GitHub OIDC provider/role, repository role ARN, and durable AWS E2E secret are configured; rotation and final acceptance remain open |
| PR-003 | P0 | Live two-workspace isolation and provider/runtime behavior are unverified | Engineering | Before beta | Relay behavior and invite authorization are now live-verified; run the remaining staging full-stack matrix with synthetic tenants and negative authorization cases | Partially mitigated: production relay suites passed; two-workspace/full-stack acceptance remains open |
| PR-004 | P1 | Production environment, session, CORS, trusted-host, and JWT settings lack live verification | Backend owner | Before traffic | Deploy production-shaped configuration and run the Phase 1 security test matrix | Open |
| PR-005 | P1 | Edge routing, WebSocket upgrade, and security headers lack deployed verification | Web / edge owner | Before traffic | Deploy `_headers`; verify two workspace hosts, TLS, cache behavior, and no redirect/522 errors | Partially mitigated: e2etest26 route/live HTTP repaired; second-host/WebSocket/header evidence open |
| PR-006 | P1 | Infrastructure state, secrets, artifacts, backups, and restore procedures lack production evidence | Platform / data owner | Before beta | Complete Phases 2–3 with reviewed plans, immutable artifacts, and restore exercises | Open: state bucket and E2E secret bootstrapped; OIDC role verified; private-RDS invite tests passed through temporary VPC Fargate; remote-state migration, migration/apply/restore remain blocked |
| PR-007 | P1 | Privacy deletion/retention, incident response, and support acceptance are incomplete | Security / support | Before beta | Approve policy, run an exercise, and document customer-safe limitations | Open |
| PR-008 | P2 | Local production build retains existing `import.meta` and large-chunk warnings | Web owner | Before scale-up | Track as a performance follow-up; measure staging Core Web Vitals before cohort expansion | Accepted locally |
| PR-009 | P1 | Helm can render chart-managed/generated secrets when `secrets.existingSecret` is omitted, despite production requiring an external Secret | Platform / security | Before beta | Enforce external Secret for all non-quickstart profiles and keep `quickstart=true` eval-only | Mitigated locally; live/staging evidence open |
| PR-010 | P1 | Refresh-disabled Terraform plan against the current local state proposes an RDS replacement while `prevent_destroy` is enabled; the existing instance is unencrypted/single-AZ while configuration requires encryption/multi-AZ hardening | Platform / data owner | Before infrastructure apply | Export and review the remote state, choose an approved snapshot/import or staged migration path, and run a reviewed plan before any apply; separately review the legacy ElastiCache cluster to replication-group migration | Open |

## Local evidence recorded

- Growth OS Phase 10 local exit gate: passed.
- Authenticated Growth browser recovery file: 9/9 passed.
- Phase 10 focused backend boundaries: 26/26 passed.
- LenOS TypeScript, Biome, Ruff, production build, and diff checks: passed.
- Docker and expected local service listeners were unavailable; no live or
  production-like infrastructure claim is made.

## Change control

Only readiness, defect, security, accessibility, and operational changes should
be added to the beta branch while this register is open. Each closure requires a
dated non-secret evidence link or command result and an accountable owner.
