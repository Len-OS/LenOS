# LenOS Growth OS data lifecycle

This policy is the beta operating baseline. It contains no customer records,
credentials, or private contact details. Legal, privacy, and support owners must
approve it before customer onboarding.

## Data inventory and authority

| Data class | Authority | Examples | Handling |
| --- | --- | --- | --- |
| Identity/access | LenOS/auth provider | User identity, workspace membership, role, session metadata | Least privilege; audit privileged changes |
| Collaboration | LenOS relay/database | Channels, messages, tasks, approvals, workspace events | Workspace-scoped authorization and retention |
| Growth business records | LenGrowth | Company profile, integrations, metrics, recommendations, experiments, reports | Access only through typed scoped contracts |
| Agent execution | LenOS/MCP plus LenGrowth records | Tool invocation metadata, status, result references | No secret/content logging; approval for sensitive actions |
| Credentials | Managed provider/secret store | OAuth tokens, signing keys, database URLs | Never repository/log/fixture; rotate and revoke through owner |
| Media and exports | Private object storage | Uploads, generated assets, approved exports | Tenant authorization, lifecycle policy, deletion audit |
| Telemetry/audit | Operational systems | Safe IDs, latency, result, error class, audit event | Minimize PII; restrict operator access |

## Retention baseline

Retention periods must be confirmed by the privacy owner and contract. Until
approved, systems must not silently extend retention:

- Active workspace business and collaboration records: retain while the
  workspace is active and subject to the approved customer policy.
- Access/session and security audit records: retain only for the approved
  security and abuse-investigation period.
- Raw integration payloads, temporary uploads, failed jobs, and orphaned media:
  minimize and expire through a reviewed lifecycle job.
- Backups and snapshots: follow the approved backup retention; deletion requests
  must record when backup expiry will complete.
- Logs and traces: retain safe operational fields only; exclude content,
  credentials, tokens, and private keys.

## Export and deletion procedure

1. Verify requester identity and workspace authority.
2. Freeze or serialize in-flight writes and record a correlation ID.
3. Export only the authorized workspace scope in a documented, access-controlled
   format; do not include credentials or unrelated tenants.
4. Revoke integration credentials and active sessions as applicable.
5. Delete or quarantine collaboration, growth, media, search, cache, agent
   memory, and derived report records according to the approved policy.
6. Record object counts/checksums and the deletion result in an audit record
   without copying customer content into the audit log.
7. Confirm backup/snapshot expiry and legal-hold exceptions to the requester.
8. Verify that subsequent reads, callbacks, jobs, and caches cannot resurrect
   deleted workspace data.

During private beta, deletion is a manually verified operation owned by the
support/security roster until an automated, tested workflow is approved. Legal
hold overrides deletion only when documented by the authorized owner.

## Subprocessors and access

The release owner must maintain the current subprocessor list, data locations,
access inventory, and rotation record outside this repository. Repository
evidence cannot close those operational gates.

## Required verification

Before beta, run a synthetic export/deletion in an isolated workspace, verify
two-workspace negative reads across API/relay/search/cache/memory/assets/reports
and logs, inspect backup behavior, and obtain privacy/support approval. This
document records the procedure but does not claim those exercises are complete.
