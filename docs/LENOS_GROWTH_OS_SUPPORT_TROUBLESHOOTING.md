# LenOS Growth OS Support Troubleshooting

**Status:** Draft for service, security, and support review  
**Updated:** 2026-08-30  
**Owner:** Codex (implementation); support ownership requires acceptance

This guide is for private-beta support. Do not place access tokens, private
keys, connection strings, customer data, or full identity values in tickets or
logs. Record only the workspace slug, route, timestamp, request ID, and the
stable error code when available.

## First response checklist

1. Confirm the affected workspace slug and the approximate UTC timestamp.
2. Capture the visible error text, HTTP status, stable error code, and request
   ID. Redact tokens and provider authorization codes.
3. Check whether the legacy LenGrowth dashboard is available; it remains the
   fallback during migration.
4. Determine whether the issue affects one workspace or multiple workspaces.
5. Do not change production flags or replay a write until the correlation ID
   and idempotency key have been recorded safely.

## Common symptoms

| Symptom | Likely cause | Safe action |
| --- | --- | --- |
| “Growth OS is not enabled” | `GROWTH_OS_ENABLED` is off or the workspace is not in the allowlist | Confirm the intended rollout flag and allowlist entry; use legacy LenGrowth meanwhile. |
| “Growth onboarding is not enabled” | `GROWTH_ONBOARDING_ENABLED` is off | Confirm the onboarding flag for the workspace; do not delete the local draft. |
| “Identity is not linked” or repeated 401/403 | Revoked, missing, or mismatched Nostr link | Re-open LenOS from the authorized LenGrowth flow and relink identity; do not ask for a private key. |
| “Workspace not found” or community mismatch | Wrong workspace slug or relay community context | Verify the workspace URL and community binding; do not substitute another company ID. |
| “Some growth details could not be loaded” | LenGrowth/API dependency failure or a partial route failure | Use Growth Home’s “Retry details”; inspect health and request IDs before retrying writes. |
| Stale report or integration status | Source has not synced or returned a bounded error | Show the last sync time and error; reconnect only after confirming the provider state. |
| OAuth returns to settings with failure | State mismatch, provider denial, expired code, or callback outage | Retry from the integration card; preserve the provider error category but never log authorization codes or tokens. |
| Agent result is missing from the originating thread | Callback delay, relay reconnect, or worker failure | Refetch the task by ID, then inspect correlation ID and callback status; do not create a duplicate task. |
| A retry appears to create duplicate work | Changed or missing idempotency key | Stop further retries, capture the request ID, and verify the authoritative LenGrowth record before acting. |

## Scope and privacy checks

- A typed request must carry workspace, relay community, actor pubkey, and the
  selected company where the operation requires a company.
- A client-supplied company ID is a selector, never proof of access.
- Never resolve an access problem by copying a company ID, integration token,
  asset URL, or agent memory from another workspace.
- For suspected isolation issues, stop the operation and escalate to security
  with redacted request metadata and both workspace slugs only.

## Escalation evidence

Include:

- environment and route;
- UTC timestamp and request ID;
- stable error code and HTTP status;
- redacted correlation ID and idempotency key;
- whether the legacy dashboard worked;
- whether the issue reproduced in a second authorized workspace fixture.

Do not include bearer tokens, OAuth codes, provider secrets, private keys,
full actor pubkeys, or customer business records.

## Current limitations

This draft does not establish live MongoDB, relay, OAuth-provider, scheduler,
or production-host behavior. Live failure-injection, two-workspace, and
provider callback runbooks require service and security owner review before
private-beta approval.
