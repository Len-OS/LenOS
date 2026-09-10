# Terraform remote-state bootstrap and migration

This runbook is intentionally non-secret. Replace the angle-bracket values from
the secure platform inventory during an approved change window; never commit
backend credentials, state files, or variable files.

## Bootstrap

Create a dedicated state bucket in the target AWS account and region with:

- Block Public Access enabled.
- Versioning enabled.
- Default server-side encryption enabled, preferably with a customer-managed KMS
  key whose use is limited to the Terraform operator role.
- Access logging and CloudTrail data-event auditing enabled where required by
  the account baseline.
- A bucket policy denying non-TLS requests and writes from principals outside
  the Terraform state role.

Terraform 1.10+ can use S3 lockfiles. Enable `use_lockfile = true` in the
approved backend configuration. If the organization still requires DynamoDB
locking, bootstrap the dedicated lock table with a string `LockID` partition key
and retain the same least-privilege policy for the state operator.

## Migration procedure

1. Export and checksum the current local state; keep the backup in the approved
   secure storage, never in Git or a ticket.
2. Confirm the target bucket, key prefix, region, KMS policy, and lock mechanism
   with the platform owner.
3. Add the approved backend configuration in the deployment environment only.
4. Run `terraform init -migrate-state -input=false` and review the migration
   prompt and resulting backend metadata.
5. Run `terraform state pull` and verify the object exists at the expected key;
   do not print state contents into CI logs.
6. Run `terraform plan -refresh-only -input=false` under the protected staging
   role and review for drift.
7. Record the state bucket/key, lock mechanism, operator, date, and plan result
   in the release evidence without recording secrets or resource credentials.

## Data-resource address migration guardrail

Before applying the hardened configuration, compare `terraform state list` with
the resource addresses in the current configuration. In particular, a state
that contains `aws_elasticache_cluster.lenos` must be reviewed before adopting
the new `aws_elasticache_replication_group.lenos` resource, and any RDS change
that would replace `aws_db_instance.lenos` requires an approved snapshot/import
or staged cutover. Run a refresh-disabled plan first, keep
`lifecycle.prevent_destroy` enabled, and stop if Terraform proposes destroying
either data resource. Do not resolve the plan by removing the guard or by
using an unreviewed `state rm`/`import` operation.

For an approved migration, record the source and target resource addresses,
snapshot/restore point, cutover and rollback owners, and the reviewed plan
artifact in the secure change record. Keep all identifiers and state contents
out of this repository.

## Required access boundary

The Terraform role needs only state-bucket read/write/list for the configured
prefix, lock-object/table access, and explicitly approved infrastructure actions.
Application, ECS task, and human break-glass roles must not share the state role.
Remote state must never be used as an application secret store.

## Current status

The production backend is configured in `main.tf` with the approved
`lenos-terraform-state-288947333598` S3 bucket, key `lenos/terraform.tfstate`,
AES256 encryption, and S3 lockfiles. The local state was migrated on 2026-09-01;
the remote object is present and a post-migration plan reports no changes.

The pre-migration state checksum and backup remain in the local ignored
Terraform working directory. The bucket's public-access block and versioning
are enabled. The bucket still uses the account-default AES256 key rather than
a customer-managed KMS key; enabling a CMK and access logging requires the
platform owner's approved key/policy inputs.
