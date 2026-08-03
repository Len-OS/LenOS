# LenOS Deployment Guide

This guide covers three things:
1. Local development setup
2. Deploying the LenOS relay to AWS (Terraform)
3. Deploying lenos-acp (LenGrowth agent) to Scalingo

---

## Prerequisites

- Rust 1.88+ — https://rustup.rs
- Node.js 20+ and pnpm — `npm i -g pnpm`
- Tauri CLI — `cargo install tauri-cli`
- Terraform 1.7+ — https://developer.hashicorp.com/terraform/install
- AWS CLI — https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
- Docker — https://docs.docker.com/get-docker/
- Scalingo CLI — `curl -O https://cli-dl.scalingo.com/install && bash install`

---

## 1. Clone and run locally

```bash
git clone https://github.com/BuildGrowthNow/LenOS.git
cd LenOS
```

### Build the relay

```bash
cargo build --release -p lenos-relay
```

### Run the relay locally

```bash
DATABASE_URL=postgres://user:pass@localhost/lenos \
REDIS_URL=redis://localhost:6379 \
LENOS_RELAY_URL=ws://localhost:3000 \
./target/release/lenos-relay
```

Verify it responds:
```bash
curl -s -H "Accept: application/nostr+json" http://localhost:3000/info | python -m json.tool
curl -s http://localhost:3000/health
```

### Run the desktop app

```bash
cd desktop
pnpm install
pnpm tauri dev
```

---

## 2. Deploy the relay to AWS

### Step 1: Build and push the Docker image

Create an ECR repo first:
```bash
aws ecr create-repository --repository-name lenos-relay --region us-east-1
```

Build and push:
```bash
export ECR_URL=$(aws ecr describe-repositories \
  --repository-names lenos-relay \
  --query 'repositories[0].repositoryUri' \
  --output text)

docker build -t lenos-relay .
docker tag lenos-relay:latest $ECR_URL:latest

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $ECR_URL

docker push $ECR_URL:latest
```

Update `infra/terraform/main.tf` line ~162 with your actual ECR URL:
```hcl
image = "123456789.dkr.ecr.us-east-1.amazonaws.com/lenos-relay:latest"
```

### Step 2: Create an ACM certificate

AWS Console → Certificate Manager → Request certificate for your domain (e.g. `relay.yourdomain.com`). Validate via DNS. Copy the ARN.

### Step 3: Create terraform.tfvars

```bash
cd infra/terraform
```

Create `terraform.tfvars` (gitignored — never commit):
```hcl
aws_region               = "us-east-1"
domain_name              = "relay.yourdomain.com"
certificate_arn          = "arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID"
relay_private_key_hex    = "GENERATE: python -c 'import secrets; print(secrets.token_hex(32))'"
postgres_password        = "STRONG_RANDOM_PASSWORD"
lengrowth_adapter_pubkey = "HEX_PUBKEY_FROM_LENGROWTH_TEAM"
```

### Step 4: Deploy

```bash
terraform init
terraform plan -out=plan.out
terraform apply plan.out
```

Note the outputs:
```
relay_wss_url = "wss://relay.yourdomain.com"
alb_dns_name  = "lenos-alb-xxx.us-east-1.elb.amazonaws.com"
```

### Step 5: Verify

```bash
curl -s -H "Accept: application/nostr+json" https://relay.yourdomain.com/info | python -m json.tool
curl -s https://relay.yourdomain.com/health
```

Expected: NIP-11 JSON and HTTP 200.

---

## 3. Deploy lenos-acp (LenGrowth agent) to Scalingo

### Step 1: Create a Scalingo app

```bash
scalingo create lenos-acp-lengrowth
```

### Step 2: Set environment variables

```bash
scalingo --app lenos-acp-lengrowth env-set \
  LENOS_RELAY_URL=wss://relay.yourdomain.com \
  LENOS_PRIVATE_KEY=<64-char hex — generate: python -c 'import secrets; print(secrets.token_hex(32))'> \
  LENOS_ACP_MCP_URL=https://api.lengrowth.com/mcp \
  LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml
```

If lenos-acp doesn't support `LENOS_ACP_MCP_URL` natively, use the mcp proxy:
```bash
scalingo --app lenos-acp-lengrowth env-set \
  LENOS_RELAY_URL=wss://relay.yourdomain.com \
  LENOS_PRIVATE_KEY=<64-char hex> \
  LENOS_ACP_AGENT_COMMAND=uvx \
  LENOS_ACP_AGENT_ARGS="mcp proxy --server-url https://api.lengrowth.com/mcp" \
  LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml
```

### Step 3: Add Procfile entry

Add to `Procfile` in the repo root:
```
acp-lengrowth: ./target/release/lenos-acp
```

### Step 4: Link repo and deploy

In the Scalingo dashboard → your app → Deploy → Connect GitHub → `BuildGrowthNow/LenOS` → enable auto-deploy on `main`.

Or via CLI:
```bash
scalingo --app lenos-acp-lengrowth git-setup
git push scalingo main
```

### Step 5: Create the LenGrowth HQ channel

Once the relay is live:
```bash
LENOS_RELAY_URL=wss://relay.yourdomain.com \
lenos channel create \
  --name "LenGrowth HQ" \
  --topic "lengrowth-hq" \
  --description "Your growth operating system"
```

**Important:** Copy the UUID returned. Open `crates/lenos-acp/agents/lengrowth.toml` and replace:
```toml
filter = 'channel_id == "00000000-0000-0000-0000-000000000000"'
```
with:
```toml
filter = 'channel_id == "<UUID from above>"'
```

Commit and redeploy:
```bash
git add crates/lenos-acp/agents/lengrowth.toml
git commit -m "fix(lenos-acp): set real lengrowth-hq channel UUID"
git push origin main
```

---

## 4. Test the LenGrowth integration

### Connect from the desktop app

1. Open LenOS desktop
2. Settings → **LenGrowth**
3. Click **Connect LenGrowth**
4. Complete OAuth on LenGrowth page
5. Redirected back — Settings shows **"LenGrowth connected"**

### Test in the HQ channel

Open **LenGrowth HQ** channel and send:

| Message | Expected |
|---|---|
| `@lengrowth get tasks` | Task list |
| `@lengrowth create task: SEO brief` | Ack with task_id |
| *(wait for Celery job)* | Result event in channel |
| `@lengrowth get metrics north_star` | North star data |

### Test disconnect / reconnect

1. Settings → LenGrowth → **Disconnect LenGrowth**
2. Send `@lengrowth get tasks` — expect "not connected" response
3. Reconnect via OAuth — verify no duplicate in LenGrowth's nostr_links collection

---

## 5. Values needed from LenGrowth team

| Value | Where to use |
|---|---|
| `NOSTR_ADAPTER_PUBKEY` | `terraform.tfvars → lengrowth_adapter_pubkey` |
| Production MCP URL | Assumed `https://api.lengrowth.com/mcp` — confirm |
| Confirm they've set `LENOS_RELAY_URL` on their Scalingo app | Must match your `relay_wss_url` output |

Give LenGrowth team the `relay_wss_url` from `terraform output` so they can set it on their side.

---

## Troubleshooting

**lenos-acp exits immediately**
- Check `LENOS_RELAY_URL` is reachable: `wscat -c wss://relay.yourdomain.com`
- Check `LENOS_PRIVATE_KEY` is exactly 64 hex chars

**"Connect LenGrowth" button disabled**
- No active community selected — join or create one first in LenOS

**Channel routing not working after UUID substitution**
- Restart lenos-acp after the config change
- Confirm UUID: `lenos channel list | grep lengrowth-hq`

**Deep link doesn't fire after OAuth**
- Verify LenOS desktop app is running (handles the `lenos://` scheme)
- Windows: check the `lenos://` URL handler is registered (run `pnpm tauri dev` first)

**Terraform errors on `aws_lb_listener`**
- Run `terraform init -upgrade` to pull aws provider ~> 5.0
