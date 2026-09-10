# LenOS Deployment Guide

**Last updated:** 2026-08-31
**Status legend:** ✅ Done · 🔲 Pending · ⚠️ Partial

---

## Production environment (secure inventory)

| Resource | Value |
|---|---|
| Relay WSS / HTTPS | Secure roster: production relay host |
| Backend API / MCP | Secure roster: LenGrowth production endpoints |
| Frontend | Secure roster: production dashboard host |
| AWS account / region | Secure roster: AWS deployment account and region |
| ECS cluster / service / task | Secure roster: production deployment identifiers |
| S3 media bucket / ACM certificate | Secure roster: resource names and certificate reference |
| DNS provider | Secure roster: DNS zone and proxy policy |
| Scalingo apps | Secure roster: backend, frontend, and RBAC app identifiers |
| Adapter identity / channel identifiers | Secure roster or protected change record |

Secrets live only in the approved secret manager and protected deployment
inputs. Never commit or paste them into this guide, tickets, or CI logs. See
`docs/PRODUCTION_ACCESS_INVENTORY.md` for the non-secret handoff process.

---

## Part 1 — LenOS relay on AWS ⚠️ PARTIAL

### What was deployed

- VPC, 2 public subnets, 2 private subnets (us-east-1)
- RDS Postgres 17 (db.t3.micro) in private subnets
- ElastiCache Redis (cache.t3.micro) in private subnets
- S3 bucket for Blossom media
- ECS Fargate service running an immutable release tag or image digest
- ALB with HTTPS listener (ACM cert above), HTTP→HTTPS redirect
- IAM task role with S3 read/write
- CloudWatch log group `/ecs/lenos` (14-day retention)

### How it is deployed

Terraform is the source of truth. Use the protected CI/CD environment and the
reviewed procedure in `infra/terraform/REMOTE_STATE.md`; do not register ad-hoc
task definitions or force deployments from a workstation.

### Terraform state

⚠️ **READINESS BLOCKER:** The repository does not configure a remote backend.
Local state and variable artifacts must remain outside Git and must not be
treated as a team or production source of truth. Before any shared or
production Terraform operation, follow `infra/terraform/REMOTE_STATE.md` to
bootstrap an encrypted, versioned, locked backend, migrate the state, and
review a refresh-only plan under the protected platform role. Do not print or
commit state contents.

### Controlled database migration

Production migrations run as a separate ECS task. Do not enable startup
migration on serving tasks.

1. Record the current serving task-definition revision and release artifact;
   keep both available as the application rollback point.
2. Take and verify the approved database snapshot/restore point. Confirm the
   migration is expand/ migrate/ contract compatible with the currently
   serving revision.
3. Resolve the migration task-definition family/revision, private subnet IDs,
   security-group ID, cluster name, and region from the protected deployment
   environment. Do not place those values or the database URL in this document.
4. Run the task with public IP assignment disabled:

   ```bash
   aws ecs run-task \
     --cluster <cluster-name> \
     --task-definition <migration-task-definition:revision> \
     --launch-type FARGATE \
     --network-configuration 'awsvpcConfiguration={subnets=[<private-subnet-a>,<private-subnet-b>],securityGroups=[<relay-security-group>],assignPublicIp=DISABLED}' \
     --region <aws-region>
   ```

5. Wait for the task to stop and inspect its non-secret exit code and logs. A
   non-zero exit code aborts the release; do not start serving the new
   application revision.
6. Deploy the immutable serving task only after the migration succeeds, then
   verify readiness and callback health. If the application rollout fails,
   use the recorded prior serving task-definition revision and ECS deployment
   circuit-breaker rollback; never rerun a destructive migration as rollback.
7. Record the task ARN, migration result, snapshot identifier, release
   artifact, rollback revision, operator, and timestamps in the protected
   change record. Never record secret values or customer payloads.

### Key env vars for the ECS task

```
RELAY_URL                 = <production relay URL from secure inventory>
LENOS_RELAY_URL           = <production relay URL from secure inventory>
LENGROWTH_ADAPTER_PUBKEY  = <approved public adapter identity>
LENOS_S3_BUCKET           = <production media bucket from secure inventory>
LENOS_S3_REGION            = <approved AWS region>
LENOS_S3_ENDPOINT          = <approved S3 endpoint>
LENOS_S3_ACCESS_KEY       = (empty — uses ECS task IAM role)
LENOS_S3_SECRET_KEY       = (empty — uses ECS task IAM role)
LENOS_S3_ADDRESSING_STYLE = virtual
LENOS_MEDIA_BASE_URL      = <production media URL from secure inventory>
LENOS_AUTO_MIGRATE        = false (production; use the controlled migration task)
HUDDLE_RECORDING_DIR      = /tmp/huddle-recordings   ← enables per-huddle LENOSOPU recording + S3 upload
```

The ECS task role needs only the approved media-bucket permissions
(`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and scoped
`s3:ListBucket`). Recordings land under the approved huddle prefix; exact
resource identifiers belong in the secure inventory.

### Verify relay health

```bash
curl -s https://<production-relay-host>/health
# → ok

curl -s -H "Accept: application/nostr+json" https://<production-relay-host>/info | python -m json.tool
# → NIP-11 JSON with relay metadata
```

### Cloudflare DNS

The production relay host is a CNAME to the ALB DNS name. **Proxy must be
OFF** (DNS-only / grey cloud) — Cloudflare proxying breaks WebSocket upgrades.

---

## Part 2 — LenGrowth backend integration ✅ DONE

All changes in `Lengrowth/backend` repo, auto-deployed to `lengrowth-main` on Scalingo on push to `master`.

### What was deployed

1. **`nostradapter` process** (underscore rejected by Scalingo — use `nostradapter` in Procfile)
   - Connects to the production relay host from the secure inventory with NIP-42 auth
   - Subscribes to the approved HQ channel from the secure change record
   - Dispatches `@lengrowth get tasks` and `@lengrowth get metrics` commands
   - Replies with kind:9 messages in the same channel

2. **MCP HTTP endpoint** at the LenGrowth production endpoint in the secure inventory
   - `lengrowth_mcp` FastMCP server mounted in `main.py` via `app.mount("/mcp", _mcp_server.streamable_http_app())`
   - Available for future `lenos-acp` or external integrations

3. **OAuth link page** at the LenGrowth production dashboard host in the secure inventory
   - Receives `?pubkey=<hex>&relay=<url>&state=<token>` from LenOS
   - Requires LenGrowth login; calls `POST /api/auth/nostr-link`
   - On success redirects to `lenos://lengrowth-auth?linked=true`

### Procfile (backend)

```
web:          uvicorn main:app --host 0.0.0.0 --port $PORT
worker:       celery -A worker.celery_app worker --loglevel=info
beat:         celery -A worker.celery_app beat --loglevel=warning
nostradapter: python -m nostr_adapter.main
```

### nostr_adapter env vars required on lengrowth-main

```
NOSTR_PRIVATE_KEY   = <64-char hex — the adapter's Nostr identity keypair>
LENOS_RELAY_URL     = <production relay URL from secure inventory>
LENOS_HQ_CHANNEL_ID = <approved HQ channel identifier from secure change record>
```

### Check adapter logs

```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 100
# Expect: "Connected to LenOS relay <production relay URL>"
# Expect: "Subscribed to the approved HQ channel"
```

---

## Part 3 — LenGrowth HQ channel ✅ DONE

Created 2026-08-04 via Python script (Rust CLI not available without local build):

```
Name:     LenGrowth HQ
UUID:     <approved HQ channel identifier>
Kind:     9007 (NIP-29 channel create)
Type:     stream / open
Relay:    <production relay host>
```

Config committed in `crates/lenos-acp/agents/lengrowth.toml`:
```toml
filter = 'channel_id == "<approved HQ channel identifier>"'
```

---

## Part 4 — LenOS web app (cloud workspace) ✅ DONE

The cloud workspace UI is deployed to Cloudflare Pages. Live at `*.lengrowth.com` (e.g. `e2etest26.lengrowth.com`). Config: `web/wrangler.jsonc`.

Shell, relay health, and public workspace lookup verified 2026-08-06. Branding (LenGrowth colors/icon/title) shipped in commits `fa690a217`, `c8a9079ef`, `05df54daf`.

**Remaining:** authenticated E2E flows (NIP-07 signer required for signed writes, LenGrowth link/revoke, task dispatch, agent callbacks). See Part 7.

### Deployment (Cloudflare Pages — active)

1. Connect `Len-OS/LenOS` to Cloudflare Pages
2. Build command: `pnpm build` (root of `/web`)
3. Output dir: `web/dist`
4. Add wildcard DNS in Cloudflare: `*.lengrowth.com` CNAME to Pages hostname (proxy ON)
5. Keep relay traffic separate from the Pages wildcard. The relay resolves tenants from the WebSocket `Host`, so browser relay URLs need a dedicated host family such as `<slug>.<relay-host-suffix>`, with DNS-only wildcard routing to the AWS ALB and an ACM certificate covering the approved wildcard.
6. Set `LENOS_RELAY_HOST_SUFFIX=<approved relay host suffix>` in `lengrowth-main` and `VITE_RELAY_HOST_SUFFIX=<approved relay host suffix>` in the Pages build.
7. Configure provisioning and the adapter to use that relay host family, then migrate existing community host rows before enabling it in production.
8. Web app reads subdomain at runtime → looks up community on relay → connects WebSocket

### Alternative — Second ECS service

Add a second Fargate service to the existing `lenos` cluster serving `web/dist/`, add ALB host-header routing for the workspace web wildcard, and keep the relay host family on the relay target group.

---

## Part 5 — "Enter LenOS" post-login flow 🔲 PENDING

After login/signup at the LenGrowth production dashboard host, users need two options:

1. **LenGrowth Dashboard** — existing platform (current default)
2. **Enter workspace** — opens `company.lengrowth.com`

### Changes required

**LenGrowth frontend** (`Lengrowth/frontend` → `lengrowth-web` on Scalingo):
- Post-login page currently routes directly to `/dashboard`
- Add workspace selection step (page or modal): show both options
- "Enter workspace" button: `https://<company-slug>.lengrowth.com`
  - Company slug from `GET /api/workspace` on the backend
  - If no workspace exists: show onboarding to create one

**LenGrowth backend** (`lengrowth-main`):
- Add `GET /api/workspace` → `{ "slug": "acme", "relay_community_id": "..." }`
- Add workspace creation endpoint if user has none

---

## Part 6 — Subdomain workspace routing 🔲 PENDING

Each company gets `company.lengrowth.com`.

### Steps

1. **Cloudflare**: wildcard `*.lengrowth.com` CNAME → LenOS web app (Pages or ECS)
2. **LenOS web app**: read `window.location.hostname`, extract slug, call relay `GET /operator/communities?slug=<slug>`, connect WebSocket to that community UUID
3. **Relay**: community record must exist per company. Create via:
   ```bash
   # Via lenos-cli (requires local Rust build or relay HTTP API)
   LENOS_RELAY_URL=<production relay URL> \
   LENOS_PRIVATE_KEY=<operator-key> \
   lenos community create --name "Acme Corp" --slug "acme"
   ```
4. **User registration per workspace**: users visiting `company.lengrowth.com` can register/login scoped to that workspace via invite link or open join policy

---

## Part 7 — E2E testing checklist ⚠️ PARTIAL

Web app is deployed (Part 4 ✅). Remaining blocker: durable NIP-07 identity for authenticated signed writes. Infrastructure, routing, health, and deployment gates are green.

Shell + public workspace lookup: ✅ verified 2026-08-07.
Still pending: authenticated starter writes, LenGrowth link/revoke, task dispatch, agent completion callback.

| Test | Expected |
|---|---|
| Visit `company.lengrowth.com` | Workspace loads, WebSocket connects to relay |
| Login to LenGrowth at the production dashboard host | See "Enter workspace" option |
| Click "Enter workspace" | Redirects to `company.lengrowth.com` |
| Settings → LenGrowth → Connect | OAuth to the approved production OAuth link page |
| Complete OAuth | Redirects `lenos://lengrowth-auth?linked=true`, Settings shows "Connected" |
| Open LenGrowth HQ channel | Approved HQ channel loads |
| Send `@lengrowth get tasks` | Reply within 5s from nostr_adapter |
| Send `@lengrowth get metrics north_star` | Metrics data in reply |
| Disconnect + reconnect | No duplicate `nostr_links` records in MongoDB |

---

## Troubleshooting

**Relay health check fails**
```bash
curl -sv https://<production-relay-host>/health
# Check ECS service events in AWS console
# Check CloudWatch logs: /ecs/lenos
```

**nostr_adapter not connecting**
```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 200
# Verify NOSTR_PRIVATE_KEY is 64-char hex
# Verify LENOS_RELAY_URL uses the approved wss:// production relay URL
```

**Cloudflare blocking WebSocket**
- Confirm the approved production relay host has orange cloud OFF (DNS-only / grey cloud) in Cloudflare dashboard

**Terraform apply fails — binary not on PATH**
- Install the pinned Terraform version through the approved operator toolchain.
- A legacy local state file may exist outside the repository. Do not delete or
  apply it; preserve it for the approved remote-state migration described in
  `infra/terraform/REMOTE_STATE.md`.

**Task def not updated after terraform change**
```bash
aws ecs register-task-definition --cli-input-json file://task-def.json
aws ecs update-service --cluster lenos --service lenos-relay \
  --task-definition lenos-relay:<new-rev> --force-new-deployment
```

**Supabase auth not loading (LenGrowth frontend)**
- Check if Supabase project is paused at supabase.com — resume if so
