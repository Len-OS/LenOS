# LenOS Deployment Guide

**Last updated:** 2026-08-04  
**Status legend:** ✅ Done · 🔲 Pending · ⚠️ Partial

---

## Real infrastructure (production)

| Resource | Value |
|---|---|
| Relay WSS | `wss://relay.lengrowth.com` |
| Relay HTTPS | `https://relay.lengrowth.com` |
| Backend API | `https://growth-api.lenquant.com` |
| Frontend (dashboard) | `https://app.lengrowth.com` |
| AWS account | `288947333598` |
| AWS region | `us-east-1` |
| ECS cluster | `lenos` |
| ECS service | `lenos-relay` |
| Active task def | `lenos-relay:4` |
| S3 media bucket | `lenos-media-288947333598` |
| ACM certificate ARN | `arn:aws:acm:us-east-1:288947333598:certificate/98e00c4e-39d1-4eea-be01-81e883a07724` |
| DNS provider | Cloudflare (proxy OFF on relay.lengrowth.com) |
| Scalingo apps | `lengrowth-main` (backend) · `lengrowth-web` (frontend) · `lengrowth-cerbos` (RBAC) |
| HQ channel UUID | `34fb566f-4883-4941-b18a-3ac7b9020552` |
| nostr_adapter pubkey | `ce928671e149874e5eb96078fe6c3dd0c485c90c26ba05cad98cc948550f9b78` |
| LENGROWTH_ADAPTER_PUBKEY | `6f994679b94588e0e427b31752377055a4ba02c1a6cd7d89fbb421bd46861c6f` |
| MCP HTTP endpoint | `https://growth-api.lenquant.com/mcp` |

Secrets (`relay_private_key_hex`, `postgres_password`) live only in `infra/terraform/terraform.tfvars` — gitignored, never commit.

---

## Part 1 — LenOS relay on AWS ✅ DONE

### What was deployed

- VPC, 2 public subnets, 2 private subnets (us-east-1)
- RDS Postgres 17 (db.t3.micro) in private subnets
- ElastiCache Redis (cache.t3.micro) in private subnets
- S3 bucket for Blossom media
- ECS Fargate service running `ghcr.io/len-os/lenos:main`
- ALB with HTTPS listener (ACM cert above), HTTP→HTTPS redirect
- IAM task role with S3 read/write
- CloudWatch log group `/ecs/lenos` (14-day retention)

### How it was deployed

Terraform is in `infra/terraform/`. `terraform` binary was not on PATH, so the initial deploy used AWS CLI directly:

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://task-def.json

# Force new deployment
aws ecs update-service \
  --cluster lenos \
  --service lenos-relay \
  --task-definition lenos-relay:4 \
  --force-new-deployment
```

Future updates: edit `infra/terraform/main.tf` and re-register via AWS CLI, or install Terraform and run `terraform apply`.

### Terraform state

State is local only (`infra/terraform/terraform.tfstate`). Not in S3 remote backend yet. **Do not delete the local state file.**

### Key env vars set on ECS task (task def rev 4)

```
RELAY_URL                 = wss://relay.lengrowth.com
LENOS_RELAY_URL           = wss://relay.lengrowth.com
LENGROWTH_ADAPTER_PUBKEY  = 6f994679b94588e0e427b31752377055a4ba02c1a6cd7d89fbb421bd46861c6f
LENOS_S3_BUCKET           = lenos-media-288947333598
LENOS_S3_REGION           = us-east-1
LENOS_S3_ENDPOINT         = https://s3.us-east-1.amazonaws.com
LENOS_S3_ACCESS_KEY       = (empty — uses ECS task IAM role)
LENOS_S3_SECRET_KEY       = (empty — uses ECS task IAM role)
LENOS_S3_ADDRESSING_STYLE = virtual
LENOS_MEDIA_BASE_URL      = https://relay.lengrowth.com/media
LENOS_AUTO_MIGRATE        = true
```

### Verify relay health

```bash
curl -s https://relay.lengrowth.com/health
# → ok

curl -s -H "Accept: application/nostr+json" https://relay.lengrowth.com/info | python -m json.tool
# → NIP-11 JSON with relay metadata
```

### Cloudflare DNS

`relay.lengrowth.com` is a CNAME to the ALB DNS name. **Proxy must be OFF** (DNS-only / grey cloud) — Cloudflare proxying breaks WebSocket upgrades.

---

## Part 2 — LenGrowth backend integration ✅ DONE

All changes in `Lengrowth/backend` repo, auto-deployed to `lengrowth-main` on Scalingo on push to `master`.

### What was deployed

1. **`nostradapter` process** (underscore rejected by Scalingo — use `nostradapter` in Procfile)
   - Connects to `wss://relay.lengrowth.com` with NIP-42 auth
   - Subscribes to HQ channel `34fb566f` after connect
   - Dispatches `@lengrowth get tasks` and `@lengrowth get metrics` commands
   - Replies with kind:9 messages in the same channel

2. **MCP HTTP endpoint** at `https://growth-api.lenquant.com/mcp`
   - `lengrowth_mcp` FastMCP server mounted in `main.py` via `app.mount("/mcp", _mcp_server.streamable_http_app())`
   - Available for future `lenos-acp` or external integrations

3. **OAuth link page** at `https://app.lengrowth.com/auth/nostr-link`
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
LENOS_RELAY_URL     = wss://relay.lengrowth.com
LENOS_HQ_CHANNEL_ID = 34fb566f-4883-4941-b18a-3ac7b9020552  (has code default, but set explicitly)
```

### Check adapter logs

```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 100
# Expect: "Connected to LenOS relay wss://relay.lengrowth.com"
# Expect: "Subscribed to HQ channel 34fb566f..."
```

---

## Part 3 — LenGrowth HQ channel ✅ DONE

Created 2026-08-04 via Python script (Rust CLI not available without local build):

```
Name:     LenGrowth HQ
UUID:     34fb566f-4883-4941-b18a-3ac7b9020552
Kind:     9007 (NIP-29 channel create)
Type:     stream / open
Relay:    relay.lengrowth.com
```

Config committed in `crates/lenos-acp/agents/lengrowth.toml`:
```toml
filter = 'channel_id == "34fb566f-4883-4941-b18a-3ac7b9020552"'
```

---

## Part 4 — LenOS web app (cloud workspace) 🔲 PENDING

The cloud workspace UI lives at `LenOS/web/` (Vite + React). **Not deployed yet.**

### What it needs to become

`company.lengrowth.com` — Slack-like workspace per company. Users sign up, invite teammates, chat with agents. Each workspace maps to a community on the relay.

### Branding work required before deploy

In `LenOS/web/src/`:
- Replace LenOS logo and product name with LenGrowth branding
- Update color tokens / theme to match LenGrowth design system
- Set default relay URL to `wss://relay.lengrowth.com`
- Set OAuth callback base to `https://app.lengrowth.com/auth/nostr-link`

### Deployment plan — Cloudflare Pages (recommended)

1. Connect `Len-OS/LenOS` to Cloudflare Pages
2. Build command: `pnpm build` (root of `/web`)
3. Output dir: `web/dist`
4. Add wildcard DNS in Cloudflare: `*.lengrowth.com` CNAME to Pages hostname (proxy ON)
5. Keep relay traffic separate from the Pages wildcard. The relay resolves tenants from the WebSocket `Host`, so browser relay URLs need a dedicated host family such as `<slug>.relay.lengrowth.com`, with DNS-only wildcard routing to the AWS ALB and an ACM certificate covering `*.relay.lengrowth.com`.
6. Set `LENOS_RELAY_HOST_SUFFIX=.relay.lengrowth.com` in `lengrowth-main` and `VITE_RELAY_HOST_SUFFIX=.relay.lengrowth.com` in the Pages build.
7. Configure provisioning and the adapter to use that relay host family, then migrate existing community host rows before enabling it in production.
8. Web app reads subdomain at runtime → looks up community on relay → connects WebSocket

### Alternative — Second ECS service

Add a second Fargate service to the existing `lenos` cluster serving `web/dist/`, add ALB host-header routing for the workspace web wildcard, and keep the relay host family on the relay target group.

---

## Part 5 — "Enter LenOS" post-login flow 🔲 PENDING

After login/signup at `app.lengrowth.com`, users need two options:

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
   LENOS_RELAY_URL=wss://relay.lengrowth.com \
   LENOS_PRIVATE_KEY=<operator-key> \
   lenos community create --name "Acme Corp" --slug "acme"
   ```
4. **User registration per workspace**: users visiting `company.lengrowth.com` can register/login scoped to that workspace via invite link or open join policy

---

## Part 7 — E2E testing checklist 🔲 PENDING

Blocked on Part 4 (web app deployed). Once unblocked:

| Test | Expected |
|---|---|
| Visit `company.lengrowth.com` | Workspace loads, WebSocket connects to relay |
| Login to LenGrowth at `app.lengrowth.com` | See "Enter workspace" option |
| Click "Enter workspace" | Redirects to `company.lengrowth.com` |
| Settings → LenGrowth → Connect | OAuth to `app.lengrowth.com/auth/nostr-link` |
| Complete OAuth | Redirects `lenos://lengrowth-auth?linked=true`, Settings shows "Connected" |
| Open LenGrowth HQ channel | Channel `34fb566f` loads |
| Send `@lengrowth get tasks` | Reply within 5s from nostr_adapter |
| Send `@lengrowth get metrics north_star` | Metrics data in reply |
| Disconnect + reconnect | No duplicate `nostr_links` records in MongoDB |

---

## Troubleshooting

**Relay health check fails**
```bash
curl -sv https://relay.lengrowth.com/health
# Check ECS service events in AWS console
# Check CloudWatch logs: /ecs/lenos
```

**nostr_adapter not connecting**
```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 200
# Verify NOSTR_PRIVATE_KEY is 64-char hex
# Verify LENOS_RELAY_URL=wss://relay.lengrowth.com (not http, not ws)
```

**Cloudflare blocking WebSocket**
- Confirm `relay.lengrowth.com` has orange cloud OFF (DNS-only / grey cloud) in Cloudflare dashboard

**Terraform apply fails — binary not on PATH**
- Windows: `choco install terraform` or download from hashicorp.com
- State file at `infra/terraform/terraform.tfstate` — required for apply, do not delete

**Task def not updated after terraform change**
```bash
aws ecs register-task-definition --cli-input-json file://task-def.json
aws ecs update-service --cluster lenos --service lenos-relay \
  --task-definition lenos-relay:<new-rev> --force-new-deployment
```

**Supabase auth not loading (LenGrowth frontend)**
- Check if Supabase project is paused at supabase.com — resume if so
