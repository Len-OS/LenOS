# Production access inventory

This is a non-secret handoff record. Never store passwords, tokens, private
keys, recovery codes, customer data, state contents, or connection strings in
this file. Resolve the role references through the secure operations roster and
record secret names or ticket IDs only in the approved password manager or
change system.

## Handoff status

| Field | Value |
| --- | --- |
| Environment | `staging` / `production` — select one in the secure copy |
| Inventory owner | Secure roster: platform owner |
| Reviewer | Secure roster: security reviewer |
| Last reviewed | `YYYY-MM-DD` |
| Change/ticket reference | `secure change reference` |
| Approval status | `not started` / `in review` / `accepted` |

## Required access inventory

For each row, verify the least-privilege role, named owner, backup, MFA/SSO
control, rotation record, and last successful access review. Put the actual
identifiers and evidence links in the secure copy, not in Git.

| System | Required access boundary | Owner | Backup | Rotation / review evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Cloudflare / DNS / Pages | Zone, DNS, Pages deploy, Worker logs; no broad account admin by default | Secure roster | Secure roster | Secure system | Not verified |
| AWS / ECS / ALB / CloudWatch | Deployment and observability roles separated from state and break-glass roles | Secure roster | Secure roster | Secure system | Not verified |
| AWS / RDS / ElastiCache / S3 | Data operations only through approved platform roles; private media and backups protected | Secure roster | Secure roster | Secure system | Not verified |
| Terraform remote state | State prefix and lock access plus explicitly approved infrastructure actions only | Secure roster | Secure roster | Secure system | Not verified |
| Scalingo / LenGrowth | App deploy, logs, worker/beat controls, and rollback access | Secure roster | Secure roster | Secure system | Not verified |
| MongoDB Atlas | Project/database access, PITR, restore, and audit access | Secure roster | Secure roster | Secure system | Not verified |
| Supabase / authentication | Project and auth administration separated from application runtime access | Secure roster | Secure roster | Secure system | Not verified |
| GitHub | Repository, branch protection, Actions environments, and secret administration | Secure roster | Secure roster | Secure system | Not verified |
| OAuth providers | Redirect URI administration and app-secret rotation for approved providers | Secure roster | Secure roster | Secure system | Not verified |
| Support / incident tooling | Paging, incident channel, status communication, and secure roster access | Secure roster | Secure roster | Secure system | Not verified |

## Acceptance checklist

- [ ] Every system has a named owner, backup, and escalation path in the secure
      roster.
- [ ] MFA/SSO and least-privilege roles are verified for every operator.
- [ ] Production and staging access are separated.
- [ ] Application secrets and OAuth credentials are inventoried by secret name,
      rotated where required, and verified without exposing values.
- [ ] Terraform state is remote, encrypted, versioned, and locked; the
      migration evidence is recorded in the secure change system.
- [ ] Break-glass access is tested, time-limited, logged, and separately owned.
- [ ] Security, privacy, operations, and support reviewers accept this
      inventory and the service map before beta traffic.

## Evidence rule

This template is not evidence that access exists, has been rotated, or has been
tested. Phase 0 can close only after the secure copy is completed and accepted,
with non-secret evidence references recorded in the readiness completion record.
