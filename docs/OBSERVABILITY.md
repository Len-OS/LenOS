# LenOS production observability contract

This runbook defines the minimum evidence and operator response for the LenOS
Growth OS private-beta path. It contains no credentials, customer content, or
private contact details.

## Correlation contract

Every request, WebSocket upgrade, cross-system write, callback, worker task, and
operator action should preserve a bounded `X-Request-ID` and
`X-Correlation-ID`. The edge worker creates a request ID when one is absent and
forwards both values. Backend and worker logs may include only safe identifiers:
environment, service, immutable version, operation, latency, result, error class,
workspace hash, and correlation IDs. Never log tokens, private keys, request
content, OAuth codes, or connection strings.

When investigating an incident, start with the correlation ID, then follow the
edge request, API/relay operation, queue or callback, and final user-visible
result. A missing correlation ID is itself an observability defect.

## Initial beta SLOs

These are release-candidate targets, not evidence that a deployment currently
meets them:

| Boundary | Target | Alert signal |
| --- | --- | --- |
| Public web/API availability | 99.5% monthly | Synthetic failure or 5xx burn |
| API latency | p95 under 1 s for reads | Sustained latency threshold |
| Relay readiness | 99.5% of checks healthy | ALB unhealthy-host alarm |
| Callback completion | 99% within 5 minutes | Backlog age and retry ratio |
| Integration freshness | 95% within configured cadence | Sync-health degradation |

SLO windows, burn-rate thresholds, and named paging routes must be approved by
the operations owner during the Phase 0 handoff.

## Infrastructure alarms

Terraform provisions the following alarm boundaries and requires an SNS topic
input: unhealthy ALB hosts, sustained relay CPU, low PostgreSQL free storage,
and high Redis client connections. The topic must have protected subscriptions
for the secure on-call roster; an SNS ARN alone is not proof that paging works.
Review alarm state, dimensions,
and notification delivery after every staging deployment.

## Incident procedure

1. Record the alert time, environment, release version, and correlation ID.
2. Determine whether the failure is web/edge, relay, API, worker/callback,
   database, Redis, storage, or an external integration.
3. Apply the smallest reversible mitigation: pause rollout, disable the affected
   workspace feature flag, drain a bad task, or switch to the documented legacy
   path. Do not rotate or print credentials in the incident channel.
4. Verify tenant isolation and callback idempotency before replaying work.
5. Confirm recovery through the synthetic check and the original correlation ID.
6. Capture impact, timeline, mitigation, data-integrity result, and follow-up
   owner in the incident record.

## Required exercises before beta

- Trigger each configured alarm in staging and verify the intended notification
  route and correlation lookup.
- Stop one relay task and verify the remaining task serves readiness and
  WebSocket reconnect traffic without sticky sessions.
- Interrupt a worker/callback path and verify retry, deduplication, and replay
  safety.
- Exercise a Redis degraded state and a database restore in isolated systems.
- Run one tabletop with the secure on-call roster and one real staging game day.

The exercises above require cloud/staging state and named operators; this
repository records the contract but does not claim those gates are complete.
