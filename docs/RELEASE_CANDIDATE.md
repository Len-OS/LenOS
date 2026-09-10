# Growth OS release-candidate checklist

This checklist is the gate for a single immutable LenOS/Growth OS release
candidate. It separates repository evidence from staging/live evidence and must
be signed by the service, engineering, security/privacy, operations, and support
owners before beta.

## Scenario matrix

| # | Scenario | Local evidence | Staging/live evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | New account → identity → workspace → onboarding → Growth Brief | Authenticated onboarding and Growth browser coverage | Real identity/workspace provisioning | Open |
| 2 | Existing account → legacy dashboard → LenOS workspace | Legacy fallback remains enabled; shell tests | Deployed legacy route and migration flag | Open |
| 3 | Objective → recommendation → task → agent → callback → approval → completion | Task, callback, approval, agent, and browser tests | Relay/worker callback under deployment | Open |
| 4 | Experiment → metric → decision → learning → later recommendation | Experiment lifecycle and company-isolation tests | Persistent cross-release learning verification | Open |
| 5 | Integration connect → sync → report → expiry → reconnect | Integration status, OAuth, expiry/reconnect browser tests | Real provider callback and token expiry | Open |
| 6 | Invite → role restriction → assignment → approval | Team, membership, specialist, and role tests | Two real users with negative authorization | Open |
| 7 | Agency client switch with no leakage | Scoped API and portfolio isolation tests | Two deployed client workspaces and cache/event audit | Open |
| 8 | Relay reconnect and callback replay during deployment | Retry/idempotency contracts and callback tests | Rolling relay/worker deployment exercise | Open |
| 9 | Data-store degradation and restore | Terraform durability guardrails and recovery contracts | RDS/MongoDB restore plus Redis degradation | Open |
| 10 | Export and approved deletion/offboarding | Data lifecycle procedure and scoped contracts | Isolated export/deletion with backup-expiry evidence | Open |

## Release artifact requirements

- Pin frontend, relay, backend, and worker artifacts to an immutable commit,
  digest, or release identifier. Record the exact identifiers in the release
  record; never use `:main` for a candidate.
- Generate a dependency and security scan report for the candidate. Critical or
  high exploitable findings block release unless the security owner records an
  approved exception and customer-safe workaround.
- Record schema version, migration task result, API/event compatibility window,
  feature-flag values, rollback artifact, and operator approval.
- Verify source maps and logs do not contain credentials, tokens, private keys,
  customer content, or cross-tenant identifiers.

## Capacity and soak evidence

Before approval, run the beta concurrency profile with at least 3× expected
headroom across authenticated reads/writes, WebSocket connections, reports,
search, uploads, agent dispatch, and callbacks. Record throughput, p50/p95/p99
latency, error rate, queue age, CPU/memory, DB connections, Redis connections,
and cost estimate per active workspace/agent run.

Soak long-lived WebSocket sessions and scheduled jobs for the agreed interval;
reconnect clients, restart workers, and verify no duplicate or lost callbacks.
Attach only aggregate metrics and safe correlation IDs to the release record.

## Exit decision

The candidate remains **not ready** until every scenario has staging/live
evidence, P0/P1 defects are closed, P2 exceptions have an owner and workaround,
and all five named owner groups sign off. Local mocked browser and unit evidence
is necessary but cannot substitute for deployed isolation, restore, capacity,
rollback, and human approval.
