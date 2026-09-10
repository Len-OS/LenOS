# LenOS Growth OS security threat model

This is a release-readiness threat model for the LenOS collaboration layer and
LenGrowth authoritative business records. It is intentionally free of secrets,
customer data, and private contact information.

## Trust boundaries

1. Browser/desktop client to Cloudflare-hosted web assets.
2. Browser and LenGrowth API to authenticated workspace/session endpoints.
3. LenOS relay, Nostr identity/signing, and workspace event authorization.
4. LenOS-to-LenGrowth API, callbacks, Celery jobs, search, cache, and agent
   execution boundaries.
5. OAuth providers, webhooks, uploads, S3/media, and external agent tools.
6. Operators, deployment systems, secrets stores, databases, backups, and logs.

LenGrowth remains authoritative for growth business records. LenOS remains
authoritative for workspace collaboration. Cross-boundary writes must carry
workspace scope plus correlation and idempotency keys; no implicit dual-write
authority is allowed.

## Threats and required controls

| Threat | Impact | Required control | Local evidence | Remaining evidence |
| --- | --- | --- | --- | --- |
| Cross-workspace read/write or cache leakage | Confidentiality/integrity | Resolve workspace from authenticated identity; authorize every object/action; scope events, search, memory, assets, reports, and callbacks | Growth boundary tests and scoped API contracts | Deployed two-workspace conformance |
| Forged/replayed callback or webhook | Duplicate actions/data corruption | Signature/state validation, bounded replay window, idempotency key, durable audit record | Existing callback tests and contracts | Staging replay/failure exercise |
| OAuth code/redirect abuse | Account takeover or token leakage | State validation, exact origin allowlist, HTTPS, no credentials in redirects | Redirect-boundary tests | Provider callback verification |
| SSRF or unsafe URL rendering | Internal network/data exposure | Validate schemes/hosts, fetch through controlled egress, sanitize rendered links | URL model/security tests | Runtime egress and penetration review |
| Malicious upload or media access | Malware/data exposure | Type/size validation, private bucket, signed access, scanning/quarantine, tenant authorization | S3 private defaults and asset permissions | Scanner and restore exercise |
| Unauthorized signing/operator action | Identity compromise | Explicit role/policy gate, least-privilege keys, audit trail, rate limits, approval for sensitive actions | Existing auth/RBAC/policy tests | Independent identity/operator review |
| Token, secret, or PII leakage in telemetry | Confidentiality/compliance | Redaction, safe identifiers, bounded correlation IDs, managed secret injection | Observability contract and secret references | Deployed log inspection |
| Dependency/image compromise | Code execution/supply chain | Lockfiles, immutable image digest/tag, dependency/SAST/secret scanning, review gates | Immutable Terraform image validation and CI | Hosted scan results and remediation review |
| Availability loss or queue duplication | User-visible outage/data corruption | Two relay tasks, health checks, rollback, retries, idempotency, restore procedures | Terraform HA guardrails and backend tests | Cloud failure/restore/game-day evidence |

## Abuse and authorization checklist

- Signup, workspace creation, signing, messages, search, uploads, webhooks,
  agent runs, and external-spend actions have explicit rate-limit/entitlement
  boundaries or a documented exception before beta.
- Privileged, approval, credential, integration, export, deletion, and agent
  execution actions emit safe audit records.
- Error responses do not disclose cross-tenant existence, tokens, or secrets.
- Feature flags and the legacy LenGrowth dashboard remain available for a
  workspace-scoped rollback during private beta.

## Review disposition

This document records design coverage, not a security approval. Critical/high
findings, independent identity/operator review, hosted dependency/container/
secret scans, live tenant conformance, and privacy-owner acceptance remain
release gates.
