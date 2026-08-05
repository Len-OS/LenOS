# LenOS + LenGrowth Integration Runbook

**Last updated:** 2026-08-04  
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
agents are still a separate authenticated bootstrap capability; the browser
must not claim those steps succeeded until that capability exists.

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

- Subscribes to HQ channel (`#h` filter on kind:9)
- Dispatches `@lengrowth get tasks` → calls `get_tasks()` from `lengrowth_mcp.tools`
- Dispatches `@lengrowth get metrics [type]` → calls `get_metrics()` from `lengrowth_mcp.tools`
- Falls back to help text for unknown commands
- Ignores own pubkey to prevent loops
- Replies as kind:9 with `["e", ..., "reply"]` and `["p", sender]` tags

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

**Blocker:** LenOS web app (`LenOS/web/`) not deployed yet. See `DEPLOYMENT.md` Part 4.

Once web app is live at `company.lengrowth.com`:

### 5.1 Relay health

```bash
curl -s https://relay.lengrowth.com/health
# → ok
```

### 5.2 Web app loads

- [ ] Visit `company.lengrowth.com` (or test subdomain)
- [ ] Page loads, WebSocket connects to relay
- [ ] No console errors

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

- [ ] Open LenGrowth HQ channel in workspace
- [ ] Send `@lengrowth get tasks` → task list reply within 5s
- [ ] Send `@lengrowth get metrics north_star` → metrics reply within 5s
- [ ] Send `@lengrowth create task: SEO brief` → (if implemented) task ID in reply

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

## Troubleshooting

**nostr_adapter crashes on start**
```bash
scalingo --app lengrowth-main logs --filter nostradapter -n 200
# NOSTR_PRIVATE_KEY must be 64-char lowercase hex
# LENOS_RELAY_URL must start with wss://, not ws:// or https://
```

**Commands time out with no reply**
- Confirm `nostradapter` process running: Scalingo dashboard → Processes
- Confirm HQ channel UUID matches in `relay_connection.py` `HQ_CHANNEL_ID`
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
