# LenOS + LenGrowth Integration Runbook

**Last updated:** 2026-08-06
**Status legend:** ✅ Done · 🔲 Pending · ⚠️ Partial

---

## Real values (fill in once, reference below)

| Key | Value |
|---|---|
| Relay WSS | `wss://relay.lengrowth.com` |
| HQ channel UUID | `34fb566f-4883-4941-b18a-3ac7b9020552` |
| nostr_adapter pubkey | `ce928671e149874e5eb96078fe6c3dd0c485c90c26ba05cad98cc948550f9b78` |
| LENGROWTH_ADAPTER_PUBKEY (relay config) | `6f994679b94588e0e427b31752377055a4ba02c1a6cd7d89fbb421bd46861c6f` |
| MCP HTTP endpoint | `https://growth-api.lenquant.com/mcp` |
| LenGrowth backend Scalingo app | `lengrowth-main` |
| LenGrowth frontend Scalingo app | `lengrowth-web` |
| LenOS relay ECS task def | `lenos-relay:4` |

---

## Step 1 — Point nostr_adapter at deployed relay ✅ DONE

### Workspace provisioning contract (current)

LenGrowth workspace creation uses the relay's authenticated operator HTTP API,
not a synthetic Nostr event. `POST /api/workspace` calls
`POST /operator/communities` with `host=<slug>.lengrowth.com`, `create_only=true`,
and the configured operator pubkey as `initial_owner_pubkey`, signed with NIP-98.
If the relay returns `409`, the backend lists communities for that operator and
accepts only an exact host match. It never chooses the first returned community.
The workspace document is inserted after relay provisioning and MongoDB unique
indexes converge concurrent retries. Starter channels and remote LenGrowth
agents are a separate authenticated browser bootstrap capability. With a durable
NIP-07 identity, the browser publishes deterministic `kind:9007` events for
`general`, `welcome-everyone`, `lengrowth`, and `tasks`, plus owner-authored
`kind:30177` role definitions for Growth Guide, Market Analyst, and Execution
Partner. Relay acknowledgements are required; duplicate channel responses are
treated as idempotent success and other failures remain visible to the user.

nostr_adapter runs as `nostradapter` process on Scalingo `lengrowth-main`.  
(Underscore in Procfile process names rejected by Scalingo — must be alphanumeric.)

### Current Procfile entry

```
nostradapter: python -m nostr_adapter.main
```

### Env vars set on lengrowth-main

```
NOSTR_PRIVATE_KEY   = <64-char hex — adapter identity>
LENOS_RELAY_URL     = wss://relay.lengrowth.com
LENOS_HQ_CHANNEL_ID = 34fb566f-4883-4941-b18a-3ac7b9020552
```

`LENOS_HQ_CHANNEL_ID` has code default of `34fb566f...` but set explicitly anyway.

### Checkpoint

- [x] Procfile has `nostradapter` process
- [x] `LENOS_RELAY_URL` and `NOSTR_PRIVATE_KEY` set on Scalingo
- [ ] Verify connection: `scalingo --app lengrowth-main logs --filter nostradapter -n 50`
  - Expected: `Connected to LenOS relay wss://relay.lengrowth.com`

---

## Step 2 — Confirm nostr_adapter connects ✅ DONE (code), 🔲 verify live

### Check logs

```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 100
```

### Expected

```
Connected to LenOS relay wss://relay.lengrowth.com
Subscribed to HQ channel 34fb566f-4883-4941-b18a-3ac7b9020552
```

### If not connecting

1. Confirm `NOSTR_PRIVATE_KEY` is 64-char hex (not mnemonic, not base58)
2. Confirm Cloudflare proxy is OFF on `relay.lengrowth.com` (DNS-only grey cloud)
3. Check relay health: `curl -s https://relay.lengrowth.com/health`
4. Restart process: Scalingo dashboard → `lengrowth-main` → Processes → Restart `nostradapter`

---

## Step 3 — Create HQ channel on relay ✅ DONE

Created 2026-08-04. Rust CLI not available without local toolchain — used Python pynostr script with NIP-42 auth.

**Result:**
```
Name:  LenGrowth HQ
UUID:  34fb566f-4883-4941-b18a-3ac7b9020552
Kind:  9007
Type:  stream / open
```

Config updated in `crates/lenos-acp/agents/lengrowth.toml`:
```toml
filter = 'channel_id == "34fb566f-4883-4941-b18a-3ac7b9020552"'
```

### If you need to recreate the channel (e.g., new relay)

Rust CLI option (requires local build):
```bash
LENOS_RELAY_URL=wss://relay.lengrowth.com \
LENOS_PRIVATE_KEY=<relay-operator-private-key-hex> \
lenos channel create --name "LenGrowth HQ" --topic "lengrowth-hq" \
  --description "Your growth operating system"
```

Python option (pynostr + websocket-client):
```python
# See C:\Users\smikl\.claude\jobs\fc6dd037\tmp\create_hq_channel.py
# (or recreate: kind:9007 event with tags h/name/visibility/channel_type/about,
#  handle NIP-42 AUTH challenge first)
```

After creating, update `lengrowth.toml` with new UUID.

---

## Step 4 — Command dispatch via nostr_adapter ✅ DONE (replaces lenos-acp)

**Architecture decision:** lenos-acp binary is not in the relay Docker image and requires a local Rust build to deploy separately. Instead, command dispatch is implemented directly in `nostr_adapter/relay_connection.py`.

### What's implemented

File: `LenGrowth/backend/nostr_adapter/relay_connection.py`

- Loads workspace relay hosts and community IDs from `lenos_workspaces`
- Subscribes to kind:9 chat events in each workspace tenant; the WebSocket host
  is the tenant boundary
- Dispatches `@lengrowth get tasks` → calls `get_tasks()` from `lengrowth_mcp.tools`
- Dispatches `@lengrowth get metrics [type]` → calls `get_metrics()` from `lengrowth_mcp.tools`
- Falls back to help text for unknown commands
- Ignores own pubkey to prevent loops
- Replies as kind:9 with `["e", ..., "reply"]`, `["p", sender]`, workspace,
  community, channel, adapter, and correlation tags
- Creates valid LenGrowth tasks with `companyId`, `taskType`, `stepId`, and
  `agentInputData`, then invokes `/api/tasks/{task_id}/complete-with-agent`
  for agent requests

### MCP HTTP endpoint (future lenos-acp or external use)

`https://growth-api.lenquant.com/mcp` — mounted in `main.py` via FastMCP `streamable_http_app()`.

### If you later want lenos-acp (optional)

```bash
LENOS_RELAY_URL=wss://relay.lengrowth.com \
LENOS_PRIVATE_KEY=<agent-keypair-hex> \
LENOS_ACP_MCP_URL=https://growth-api.lenquant.com/mcp \
LENOS_ACP_CONFIG=crates/lenos-acp/agents/lengrowth.toml \
lenos-acp
```

Requires building `lenos-acp` from `crates/lenos-acp/` with Rust toolchain.

---

## Step 5 — E2E testing 🔲 PENDING (blocked on web app deploy)

**Current state:** LenOS web is deployed and the shell, relay health, and public workspace lookup have been verified. The remaining blocker is an authenticated durable identity for testing signed writes, LenGrowth linking, task dispatch, and callbacks.

Once web app is live at `company.lengrowth.com`:

### 5.1 Relay health

```bash
curl -s https://relay.lengrowth.com/health
# → ok
```

### 5.2 Web app loads

- [x] Visit `e2etest26.lengrowth.com` (test workspace)
- [x] Page loads and serves the LenOS shell
- [x] Relay health and public workspace lookup return 200

### 5.3 Post-login workspace entry

- [ ] Login at `app.lengrowth.com`
- [ ] See both options: "LenGrowth Dashboard" and "Enter workspace"
- [ ] "Enter workspace" opens `company.lengrowth.com`

### 5.4 LenGrowth OAuth link (LenOS → LenGrowth)

- [ ] In LenOS workspace: Settings → LenGrowth → Connect
- [ ] OAuth redirects to `app.lengrowth.com/auth/nostr-link`
- [ ] Login with LenGrowth credentials
- [ ] Callback: `lenos://lengrowth-auth?linked=true`
- [ ] Settings shows "LenGrowth connected"

### 5.5 HQ channel commands

- [ ] Open the workspace `#lengrowth` channel
- [ ] Send `@lengrowth get tasks` → task list reply within 5s
- [ ] Send `@lengrowth get metrics north_star` → metrics reply within 5s
- [ ] Send `@lengrowth create task: SEO brief` → (if implemented) task ID in reply

Additional workspace-agent checks:

- [ ] `@lengrowth create task: SEO brief` returns a task ID.
- [ ] `@lengrowth run agent seo: audit organic search` returns a queued task.
- [ ] Completion callback returns to the originating channel/thread.

### 5.6 Disconnect / reconnect

- [ ] Settings → Disconnect LenGrowth
- [ ] `@lengrowth get tasks` returns "not connected" error
- [ ] Reconnect → only one active record in MongoDB `nostr_links` per user

---

## Step 6 — Web app deploy and branding 🔲 PENDING

See `DEPLOYMENT.md` Parts 4–6 for full detail. Summary:

1. Brand `LenOS/web/src/` — replace LenOS logo/colors with LenGrowth design system
2. Set default relay to `wss://relay.lengrowth.com` in web app config
3. Deploy to Cloudflare Pages (recommended) or second ECS service
4. Add wildcard `*.lengrowth.com` DNS in Cloudflare
5. Add "Enter workspace" option to LenGrowth post-login flow (`lengrowth-web`)
6. Add `GET /api/workspace` endpoint to `lengrowth-main`

---

## Current deployment status

- Browser Worker: deployed as `lenos`; shell and empty-workspace onboarding are
  live on `e2etest26.lengrowth.com`; latest verified Worker version is
  `0c126b2e-32a2-40c4-ab9b-78fae969d5b4`.
- LenOS main: `b9c9df141` is pushed to GitHub; browser Agents now identify
  remote LenGrowth agents and the desktop Virtua integration typechecks.
- LenGrowth backend: `e499a62` is pushed to `master` and deployed successfully
  to Scalingo; the server-side relay gateway is configured.

## Production verification update — 2026-08-07

- Authenticated verification using the supplied disposable account succeeded
  against Supabase and `growth-api.lenquant.com`.
- The original account resolves to LenOS workspace `e2etest26` with relay
  community `aea95e4d-a1a6-40bb-8d75-912ebf8cb4fb`; the aligned multi-seat
  fixture uses workspace `lenos-e2e32` and community
  `328be86d-0ce7-4a75-a6e2-919bbeb1782b`.
- A disposable LenGrowth company was provisioned with ID
  `6a75d48b6b67f5b8084bda8f`; its membership list contains one active `owner`
  record for the test account.
- Live checks passed for relay health, public workspace lookup, authenticated
  workspace lookup, company membership lookup, backend-supported membership
  roles, and `https://e2etest26.lengrowth.com/home` returning HTTP 200.
- Authorization checks passed for unknown public workspace (`404`), foreign
  company member listing (`403`), unauthenticated member listing (`403`), and
  duplicate invitation of the existing owner (`409`).
- Additional disposable identities `fern2gue+32@gmail.com` and
  `fern2gue+33@gmail.com` now authenticate successfully. The original
  `e2etest26` company remains a separate owner-only fixture.
- Multi-seat fixture company `6a75d8700418e3844768d91e` is now provisioned:
  `+32` is active owner, `+33` is active contributor after invite acceptance,
  and `+20` is denied access with `403`. Backend commit `c669e4f` is deployed;
  authenticated live Nostr-link, repeat-link, and revoke checks all returned
  `200` for `+32` using ephemeral keys that were not persisted.
- A disposable LenOS workspace was provisioned for `+32` as
  `lenos-e2e32`, with relay community `328be86d-0ce7-4a75-a6e2-919bbeb1782b`.
- Backend commit `c669e4f` was tested (6 tests passed) and pushed to GitHub.
  Scalingo is configured for `BuildGrowthNow/backend`, but its integration
  currently rejects both `master` and `main` with `422 git_branch does not
  exist`; no live deployment of `c669e4f` has been verified. The integration
  must be re-linked or have its repository/branch metadata refreshed before
  the deployed Nostr-link endpoint can be retested.

- The authenticated test workspace loads at `https://e2etest26.lengrowth.com/home`
  with no channels or agents, and correctly presents a read-only state when no
  NIP-07 signer is available.
- Identity settings now explain that browser provisioning and membership writes
  require a durable browser signer or the LenOS desktop flow; raw secret keys
  are not accepted in browser storage.
- The workspace welcome screen refreshes identity state on focus and exposes the
  canonical LenGrowth Team Hub at `/settings/company?tab=team`.
- Starter provisioning, agent creation, and messages remain intentionally
  blocked until the supplied test session has a supported durable signer.
- The relay accepts the workspace connection but requires NIP-42 before
  subscriptions. Relay-community membership is therefore still unverified;
  the fixture needs a durable signer/member pubkey before signed membership,
  channel, and message E2E checks can be claimed.

## Final runtime verification — 2026-08-06

- Scalingo deployment `3adf86be-c21a-446f-904a-5f872ad782a6` succeeded for
  backend commit `e499a62`; web, worker, beat, and nostradapter are running.
- `LENOS_RELAY_GATEWAY_URL=wss://relay.lengrowth.com` is configured for the
  server-side adapter. Logs confirm successful gateway connections and tenant
  subscriptions for `e2etest26` and `acmen-teste`.
- Browser WebSocket routing is verified: `wss://e2etest26.lengrowth.com`
  completes a WebSocket upgrade through the Worker, which forwards to the
  valid-TLS relay gateway while preserving the workspace Host header. Static
  asset routing uses `run_worker_first` so cached SPA fallback cannot consume
  WebSocket upgrade requests.
- Relay health: `https://relay.lengrowth.com/health` returns `ok`.
- Public lookup: `https://growth-api.lenquant.com/api/public/workspace/e2etest26`
  returns the workspace community and tenant WebSocket host.
- Still pending: authenticated starter writes, LenGrowth link/revoke, task
  dispatch, agent completion callback, and failure callback.

## Troubleshooting

## Production verification update — 2026-08-06

- Scalingo CLI account is authenticated and `lengrowth-main` is running web,
  worker, beat, and nostradapter processes.
- The latest successful Scalingo deployment is `3adf86be-c21a-446f-904a-5f872ad782a6`
  for backend commit `e499a62`.
- `/api/health` and `/api/public/workspace/e2etest26` return HTTP 200.
- `wss://relay.lengrowth.com` accepts WebSocket connections.
- `wss://e2etest26.lengrowth.com` completes a live WebSocket upgrade through the
  deployed Worker. Scalingo adapter logs confirm successful gateway connections
  and subscriptions for `e2etest26` and `acmen-teste`.
- The remaining authenticated signed-write and task lifecycle checks require a
  real test identity/session; infrastructure, routing, health, and deployment
  gates are green.

**nostr_adapter crashes on start**
```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 200
# NOSTR_PRIVATE_KEY must be 64-char lowercase hex
# LENOS_RELAY_URL must start with wss://, not ws:// or https://
```

**Commands time out with no reply**
- Confirm `nostradapter` process running: Scalingo dashboard → Processes
- Confirm `lenos_workspaces` contains the expected slug, relay host, and
  community ID; the adapter subscribes per workspace rather than relying on
  one HQ channel UUID.
- Confirm relay is up: `curl https://relay.lengrowth.com/health`
- Confirm Cloudflare proxy OFF on `relay.lengrowth.com`

**@lengrowth command returns wrong data**
- MCP tools in `lengrowth_mcp/tools.py` — check DB query logic
- Set `LOG_LEVEL=DEBUG` on Scalingo → `nostradapter` logs full dispatch trace

**Channel not found in client**
- Channel UUID `34fb566f...` must exist on the relay
- Verify with: connect to `wss://relay.lengrowth.com`, send `["REQ","v",{"kinds":[39000],"#d":["34fb566f-4883-4941-b18a-3ac7b9020552"]}]`
- If relay was wiped/reset, recreate channel (see Step 3 above)

**Duplicate nostr_links after reconnect**
- Check `POST /api/auth/nostr-link` in `lengrowth-main` for idempotency (upsert not insert)
- Review disconnect handler — must delete old link before new one created

## Production-readiness continuation — 2026-08-07

- LenOS web commits `fa690a217`, `c8a9079ef`, and `05df54daf` are local repository changes. They harden NIP-42 acknowledgement handling, make core relay writes await `OK` acknowledgements, and align smoke assertions with the current LenGrowth branding contract.
- LenOS web verification passed: TypeScript typecheck, full Biome/check suite, production build, and browser smoke E2E **6/6**.
- LenGrowth backend verification passed: Nostr-link route tests **6/6** and task contract tests **4/4**. The adapter source parses `create task` and `run/trigger/start agent` commands and retains correlation/callback metadata.
- Full LenGrowth frontend Vitest did not complete within 180 seconds when invoked directly; the normal pnpm wrapper is currently blocked by ignored native dependency build scripts. This is not recorded as a passing full-suite result.
- Still blocked: durable NIP-07 identities for the disposable `+32`/`+33` fixture. Until provisioned through the supported desktop/NIP-07 flow, do not claim live relay membership, authenticated channel/message permissions, or remote-agent success/failure callbacks.
- Normal-user identity work has started: `POST /api/auth/managed-nostr/provision` provisions or reuses an encrypted per-user signer under the authenticated Supabase identity, and `POST /api/auth/managed-nostr/sign` returns signed events without exposing private keys. The feature is fail-closed until Scalingo has a dedicated 32-byte `MANAGED_NOSTR_MASTER_KEY`; do not deploy with this variable absent or reuse an unrelated secret.
