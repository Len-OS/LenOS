# Growth OS private-beta launch and soak runbook

This runbook governs a gradual, reversible beta. It is a procedure and does not
constitute approval to admit users.

## Rollout sequence

1. Confirm the immutable release candidate and all Phase 7 evidence.
2. Verify the secure roster, support path, incident channel, rollback artifact,
   backups, alarm delivery, and feature-flag owner.
3. Enable `GROWTH_OS_ENABLED` and related flags for internal workspace slugs
   only; keep `LEGACY_LENGROWTH_DASHBOARD_ENABLED=on`.
4. Admit one design partner at a time in small waves, recording the workspace
   slug, start time, flag state, and approver in the private launch record.
5. Review launch metrics daily for at least seven stable days before expanding.

## Daily review

Review aggregate values only: availability/error-budget burn, onboarding
completion, time to first recommendation, task/agent success, callback latency
and backlog, integration freshness, support tickets, security signals, tenant
anomalies, and cost per active workspace/agent run. Follow each anomaly through
its correlation ID without copying customer content into the review record.

## Automatic freeze triggers

Immediately stop expansion and retain the current cohort on any P0, suspected
data loss, cross-tenant signal, fast error-budget burn, unrecoverable callback
backlog, credential exposure, repeated restore failure, or security incident.
Disable the affected Growth flag or workspace allowlist entry, preserve the
legacy fallback, and open the incident procedure in `docs/OBSERVABILITY.md`.

## Rollback

1. Freeze new admissions and capture the release/flag state.
2. Disable the affected workspace flag or revert the allowlist.
3. Keep LenGrowth’s legacy dashboard available for business continuity.
4. Drain/retry only through idempotent task and callback paths; do not manually
   replay unknown writes.
5. Verify login, workspace routing, reads/writes, callbacks, and tenant
   isolation with synthetic checks.
6. Record impact, data-integrity result, recovery correlation IDs, and the
   approver for re-entry.

## Exit or expansion decision

Expansion requires seven stable days, no unresolved P0/P1 defects, healthy
backup/access-log review, successful incident/rollback evidence, and approval
from product, engineering, security/privacy, operations, and support owners.
If any condition is absent, retain the current cohort or roll back. The launch
record must contain no secrets or customer content.
