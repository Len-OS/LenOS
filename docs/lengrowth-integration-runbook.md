# LenOS + LenGrowth E2E Integration Runbook

**Last Updated:** 2026-08-03  
**Purpose:** Complete operator checklist for connecting LenGrowth to deployed LenOS relay

---

## Prerequisites

Before starting, ensure the following are available from the LenGrowth team:

- [ ] **NOSTR_ADAPTER_PUBKEY** — Public key of the LenGrowth nostr_adapter service
- [ ] **Production MCP URL** — Confirmed URL of LenGrowth's MCP endpoint (e.g., `https://api.lengrowth.com/mcp`)
- [ ] **LENOS_RELAY_URL** — Deployed LenOS relay WebSocket URL (from terraform output, e.g., `wss://your-lenos-domain`)
- [ ] LenGrowth Tasks 1–8 completed and deployed to AWS
- [ ] LenOS Task 3 (relay deployment) completed

---

## Step 1: Point LenGrowth nostr_adapter at deployed relay

Configure the LenGrowth ECS task definition to connect to the LenOS relay.

### Set environment variable

In the LenGrowth ECS task definition, add or update:

```
LENOS_RELAY_URL=wss://<relay_wss_url from terraform output>
```

### Redeploy LenGrowth service

```bash
aws ecs update-service --cluster lengrowth --service lengrowth --force-new-deployment
```

Wait for the service to stabilize (check AWS ECS console or describe-service).

### Checkpoint

- [ ] ECS service redeployed successfully
- [ ] No rollback observed in last 2 minutes

---

## Step 2: Confirm nostr_adapter connects

Verify that the LenGrowth adapter successfully connects to the LenOS relay.

### Check logs

```bash
aws logs tail /ecs/lengrowth --filter-pattern "Connected to LenOS relay" --follow
```

### Expected output

```
Connected to LenOS relay wss://<your-domain>
```

Allow 30–60 seconds after redeploy before checking logs.

### Checkpoint

- [ ] Log message confirms connection to relay
- [ ] No connection errors in recent logs

---

## Step 3: Create HQ channel on deployed relay

Create the LenGrowth HQ channel on the LenOS relay and note the UUID.

### Run channel creation command

```bash
LENOS_RELAY_URL=wss://<your-lenos-domain> lenos channel create \
  --name "LenGrowth HQ" \
  --topic "lengrowth-hq" \
  --description "Your growth operating system"
```

### Capture the channel UUID

The command will return:

```
Channel created: <UUID>
```

**Important:** Copy the returned UUID. You will substitute it in the next step.

### Update lengrowth.toml with channel_id

Open `crates/lenos-acp/agents/lengrowth.toml` and find the line containing:

```toml
channel_id = "00000000-0000-0000-0000-000000000000"
```

Replace the UUID placeholder with the one returned above:

```toml
channel_id = "<UUID from channel create>"
```

### Checkpoint

- [ ] Channel "LenGrowth HQ" exists on relay
- [ ] UUID captured and updated in `lengrowth.toml`

---

## Step 4: Launch lenos-acp for LenGrowth

Deploy the lenos-acp agent service. Choose Option A or B based on your deployment model.

### Gather required values

```bash
LENOS_RELAY_URL=wss://<your-lenos-domain>
LENOS_PRIVATE_KEY=<agent-keypair-hex>
LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml
LENOS_ACP_MCP_URL=https://api.lengrowth.com/mcp  # from LenGrowth team
```

### Option A: Native HTTP MCP transport (preferred)

If lenos-acp supports `LENOS_ACP_MCP_URL` natively:

```bash
LENOS_RELAY_URL=wss://<your-lenos-domain> \
LENOS_PRIVATE_KEY=<agent-keypair-hex> \
LENOS_ACP_MCP_URL=https://api.lengrowth.com/mcp \
LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml \
lenos-acp
```

### Option B: MCP proxy (fallback)

If native HTTP is not supported:

```bash
LENOS_RELAY_URL=wss://<your-lenos-domain> \
LENOS_PRIVATE_KEY=<agent-keypair-hex> \
LENOS_ACP_AGENT_COMMAND=uvx \
LENOS_ACP_AGENT_ARGS="mcp proxy --server-url https://api.lengrowth.com/mcp" \
LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml \
lenos-acp
```

### Deploy to ECS (if using AWS)

As a second service on the LenOS cluster, or as a sidecar container. Ensure the service has:
- Network access to `wss://<your-lenos-domain>`
- Network access to `https://api.lengrowth.com/mcp` (LenGrowth MCP endpoint)
- IAM permissions to read task definition and environment variables

### Checkpoint

- [ ] lenos-acp service launched (Option A or B)
- [ ] No startup errors in logs
- [ ] Service is running and healthy

---

## Step 5: End-to-end checklist

Run the following verification steps **in order**. Each should complete before moving to the next.

### 5.1: Open LenOS client

- [ ] Open LenOS desktop application or navigate to `https://<your-lenos-domain>`
- [ ] Page loads without errors

### 5.2: Initiate LenGrowth connection

- [ ] Navigate to Settings → LenGrowth
- [ ] Click "Connect LenGrowth" button
- [ ] OAuth flow redirects to LenGrowth login page

### 5.3: Complete OAuth and verify linked state

- [ ] Log in with LenGrowth credentials
- [ ] After successful login, callback redirects with `lenos://lengrowth-auth?linked=true`
- [ ] LenOS Settings now displays "LenGrowth connected"

### 5.4: Verify HQ channel access

- [ ] Return to main LenOS interface
- [ ] Locate and open the "LenGrowth HQ" channel (created in Step 3)
- [ ] Channel loads without errors

### 5.5: Test task list retrieval

- [ ] In the HQ channel message input, type: `@lengrowth get tasks`
- [ ] Send the message
- [ ] **Expected response:** Task list appears as a reply message within 5 seconds

### 5.6: Test task creation

- [ ] Send: `@lengrowth create task: SEO brief`
- [ ] **Expected response:** Acknowledgment with `task_id` (e.g., `task_id: task-12345`)

### 5.7: Wait for async job completion

- [ ] After task creation, wait for Celery job to complete (typically 10–30 seconds)
- [ ] **Expected result:** Result event arrives in the channel as a new message

### 5.8: Test metrics retrieval

- [ ] Send: `@lengrowth get metrics north_star`
- [ ] **Expected response:** North star metrics data returned in reply

### 5.9: Disconnect and verify not-connected state

- [ ] Navigate to Settings → LenGrowth
- [ ] Click "Disconnect LenGrowth"
- [ ] Return to HQ channel
- [ ] Send: `@lengrowth get tasks`
- [ ] **Expected response:** Error message like "LenGrowth not connected. Please reconnect in Settings."

### 5.10: Reconnect and verify no duplicates

- [ ] Return to Settings → LenGrowth
- [ ] Click "Connect LenGrowth" and complete OAuth again
- [ ] Check the MongoDB `nostr_links` collection (or LenOS internal links table)
- [ ] **Expected state:** Only one active connection record for this user+LenGrowth pair (no duplicates)

### Checkpoint

- [ ] All 10 substeps completed successfully
- [ ] No errors or unexpected messages observed

---

## Step 6: Post-launch updates

After successful E2E verification, update infrastructure-as-code with final values.

### Update terraform.tfvars

In your Terraform configuration, add or update:

```hcl
lengrowth_relay_url         = "wss://<your-lenos-domain>"
lengrowth_adapter_public_key = "<NOSTR_ADAPTER_PUBKEY>"
lengrowth_hq_channel_id     = "<UUID from Step 3>"
lengrowth_mcp_url           = "https://api.lengrowth.com/mcp"
```

### Commit any fixes or documentation updates

```bash
git add -p
git commit -m "fix(lenos-lengrowth): e2e integration fixes"
```

### Checkpoint

- [ ] terraform.tfvars updated with real values
- [ ] Changes committed to version control

---

## Troubleshooting

### nostr_adapter fails to connect

**Symptom:** No "Connected to LenOS relay" log message after 2 minutes.

**Actions:**
1. Verify `LENOS_RELAY_URL` is correct and accessible from LenGrowth network
2. Check network ACLs and security groups allow WebSocket (port 443)
3. Confirm relay service is running: `curl -I https://<your-lenos-domain>`
4. Check LenGrowth ECS task logs for DNS or connection errors

### lenos-acp fails to start

**Symptom:** Continuous restarts or crash logs in ECS.

**Actions:**
1. Verify `LENOS_ACP_CONFIG` file exists and is readable
2. Verify `LENOS_PRIVATE_KEY` is valid hex format
3. Verify `LENOS_ACP_MCP_URL` (or proxy args) are correct
4. Check IAM role has necessary permissions for ECS and CloudWatch Logs
5. If using Option B proxy, verify `mcp` and `uvx` are installed

### @lengrowth commands return "not connected"

**Symptom:** Commands fail even though LenGrowth is shown as "connected" in Settings.

**Actions:**
1. Verify the `channel_id` in `lengrowth.toml` matches the HQ channel UUID
2. Check lenos-acp logs for errors connecting to MCP endpoint
3. Verify HTTPS certificate chain for LenGrowth MCP URL is valid
4. Restart lenos-acp service and retry

### Duplicate connections after reconnect

**Symptom:** Multiple entries for same user in `nostr_links` collection.

**Actions:**
1. Check LenGrowth OAuth callback handling for idempotency
2. Verify LenOS link deregistration on disconnect
3. Review logs for missed cleanup operations

---

## Support

For issues not covered above, contact:
- **LenOS Team:** [ops contact]
- **LenGrowth Team:** [integration contact]

Include logs from both services and the exact steps that failed.
