# LenOS + LenGrowth — Product Migration & Intelligence Plan

**Last updated:** 2026-08-10 (Phase 3 complete)  
**Status legend:** ✅ Done · ⚠️ Partial · 🔲 Pending

---

## 1. Vision

LenGrowth.com is the company. LenOS is the product becoming its core workspace experience.

Today there are two separate surfaces: the LenGrowth dashboard (Next.js, Supabase Auth, Growth Trees, Kanban) and the LenOS workspace (Nostr-based, chat-first, AI agents). Users who sign up see a choice between them — that signals two products, not one. It needs to end.

**The bet:** A passive dashboard you go to is replaceable by Claude or ChatGPT. An active workspace that comes to you — Len posts your standup, Scout runs research in a channel, Forge ships a brief, a specialist joins and picks up a task — is not replaceable, because it has persistent context about your company, your OKRs, your metrics, and your team.

---

## 2. Architecture: Two Planes

The migration does not kill the LenGrowth frontend. It narrows its scope deliberately — the same way Slack's `slack.com/admin` is not the workspace but is where billing, SSO, and the app directory live.

| Plane | Surface | What lives there |
|---|---|---|
| **Work plane** | LenOS workspace | Channels, agents (Len / Scout / Forge), tasks, standups, tool connections, specialist collaboration |
| **Management plane** | LenGrowth dashboard (`dashboard.lengrowth.com`) | Billing, plan upgrades, admin, specialist marketplace, future 3rd-party app directory, API keys |

**LenGrowth backend (FastAPI + MongoDB + Celery) never migrates — it is the data and API layer for both planes.**  
**LenGrowth frontend scope narrows — it becomes the management plane, not the workspace.**  
**LenOS is the workspace. It calls the LenGrowth backend for all data.**

---

## 3. What Already Exists (Do Not Rebuild)

### LenGrowth backend infrastructure

| Thing | Location | Status |
|---|---|---|
| Google Analytics OAuth + daily sync | `services/integrations/google_analytics_service.py` | ✅ |
| Google Search Console OAuth + daily sync | `services/integrations/google_search_console_service.py` | ✅ |
| Google Ads OAuth + daily sync | `services/integrations/paid_media_service.py` | ✅ |
| Meta Ads OAuth + daily sync | `services/integrations/paid_media_service.py` | ✅ |
| HubSpot OAuth + daily sync | `services/integrations/business_input_service.py` | ✅ |
| Shopify OAuth + daily sync | `services/integrations/business_input_service.py` | ✅ |
| Stripe OAuth + daily sync | `services/integrations/business_input_service.py` | ✅ |
| PostHog OAuth + daily sync | `services/integrations/operational_signal_service.py` | ✅ |
| Google Business Profile OAuth | `services/integrations/operational_signal_service.py` | ✅ |
| 16 Celery Beat scheduled jobs | `worker/beat_schedule.py` | ✅ |
| Per-company token storage | MongoDB (5 collections) | ✅ |
| Sync health tracking | `services/integrations/sync_health.py` | ✅ |
| Task management engine | `models/task.py`, `routes/tasks.py` | ✅ |
| Growth Trees + Macro Objectives | `models/`, `routes/` | ✅ |
| RBAC (Cerbos) | `cerbos/` | ✅ |
| Stripe billing + plans | `routes/billing.py`, `services/stripe_service.py` | ✅ |
| Specialist assignment system | `models/specialist.py`, `routes/` | ✅ |
| Supabase Auth | middleware + `routes/auth.py` | ✅ |
| Node MCP aggregator (`lengrowth-mcp`) | `backend/mcp/server.js` — deployed on Scalingo | ✅ |
| Python MCP server | `backend/lengrowth_mcp/main.py` — running on `lengrowth-main` | ✅ |

### Identity bridge — already fully built, no work needed

Two mechanisms link Supabase user IDs to Nostr pubkeys:

**`nostr_links` collection** (`routes/nostr_link.py`):
```
{
  nostr_pubkey:      <64-char hex>,
  supabase_user_id:  <Supabase UUID>,
  company_id:        <string>,
  relay_url:         <wss:// URL>,
  linked_at, last_used_at, revoked, revoked_at
}
```
Used by `lengrowth_mcp/auth.py` → `resolve_user(nostr_pubkey)` to authenticate inbound Nostr/MCP requests back to a Supabase session + JWT.

**`managed_nostr_identities` collection** (`services/managed_nostr_identity.py`):
```
{
  user_id:    <Supabase user ID>,
  pubkey:     <64-char hex Nostr pubkey>,
  nonce:      <base64 AES-GCM nonce>,
  ciphertext: <base64 AES-GCM encrypted private key>,
  key_version, created_at, revoked, revoked_at
}
```
For users without a Nostr wallet/extension — LenGrowth generates and stores their keypair server-side, signs events via `POST /managed-nostr/sign`. Users get a Nostr identity automatically at signup.

Every LenGrowth user can be provisioned a Nostr identity. Every Nostr event received by the backend can be resolved to a Supabase user and company. The plumbing for Phase 0 is done.

---

## 4. Phase 0 — Fix the Signup Confusion ✅ Done

**Problem:** User signs up → sees choice between "create a workspace" and "access the dashboard." Signals two products. Kills clarity immediately.

**Goal:** One flow. One product. LenOS IS the product.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend** | Signup webhook: provision Nostr identity, link, create workspace, return `workspace_invite_url` (pending) |
| **Desktop** | ✅ Agent renames (Len/Scout/Forge). ✅ "Advanced Dashboard" in profile popover — opens browser via `openUrl` |
| **Web** | ✅ "Advanced Dashboard" icon button in `ChannelsSidebar` — `<a target="_blank">` to `dashboard.lengrowth.com` |
| **Mobile** | ✅ "Advanced Dashboard" row in Settings → LenGrowth section — `url_launcher` `externalApplication` to `dashboard.lengrowth.com` |

### What was built

**Agent renames (desktop + Rust):**
- Fizz → Len (`builtin:fizz`, lead agent), Honey → Scout, Bumble → Forge
- Updated `desktop/src-tauri/src/managed_agents/personas.rs`, `welcomeGuide.ts`, `CommunityOnboardingFlow.tsx`, `WelcomeComposerBanner.tsx`
- Welcome intro message updated: "Hi, I'm Len. Welcome to LenGrowth."

**Advanced Dashboard link:**
- Desktop: "Advanced Dashboard" entry in profile popover (`ProfilePopover.tsx`) — calls `openUrl` via Tauri to open browser (`SidebarProfileCard.tsx`)
- Web: `ExternalLink` icon button next to Settings gear in `ChannelsSidebar.tsx` — plain `<a target="_blank">` to `dashboard.lengrowth.com`
- Both respect `VITE_DASHBOARD_URL` env var, fallback `https://dashboard.lengrowth.com`

**LenGrowth backend — signup webhook/flow (pending LenGrowth backend work):**
1. Create Supabase user (existing)
2. Auto-provision managed Nostr identity via `POST /managed-nostr/provision` (existing endpoint)
3. Link via `POST /nostr-link` with provisioned pubkey (existing endpoint)
4. Create workspace on LenOS relay
5. Create company profile in LenGrowth backend (existing)
6. Return `{ supabase_session, nostr_pubkey, workspace_invite_url }`

### What NOT to change
- LenGrowth dashboard still works as-is for existing sessions
- No database migrations — link tables already exist

---

## 5. Phase 1 — Expose Existing Data to Agents via MCP ✅ Done

**Goal:** Len answers "what are our top organic keywords this week?" using already-synced data. No new OAuth. No new syncs. New MCP tools reading existing MongoDB collections.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend** | ✅ 6 MCP tools added to `lengrowth_mcp/tools.py`, registered in `main.py` |
| **Desktop** | No UI change — Len uses tools automatically via chat |
| **Web** | No UI change — Len uses tools automatically via chat |
| **Mobile** | No UI change — Len uses tools automatically via chat |

### What was built

All tools in `LenGrowth/backend/lengrowth_mcp/tools.py`, registered in `main.py` as `@mcp.tool()`:

| MCP tool name | Collection | What Len can answer |
|---|---|---|
| `lengrowth_get_google_analytics` | `google_analytics_data` | Sessions, conversions, top pages, traffic sources |
| `lengrowth_get_search_console` | `google_search_console_data` | Top queries, impressions, clicks, avg position |
| `lengrowth_get_paid_media` | `paid_media_snapshots` | Spend, impressions, clicks, ROAS (Google Ads + Meta Ads) |
| `lengrowth_get_business_inputs` | `business_input_snapshots` | HubSpot pipeline, Shopify revenue/orders, Stripe MRR/churn |
| `lengrowth_get_operational_signals` | `operational_signal_snapshots` | PostHog WAU/activation, GBP review score |
| `lengrowth_get_manual_metrics` | `manual_business_metrics` | Manually entered north star, KPIs, custom targets |

All tools: `resolve_user(nostr_pubkey)` → query MongoDB by `company_id` → strip tokens from response → return structured data. `date_range` param supported on GA and GSC: `last_7_days | last_30_days | last_90_days`.

**Result:** Len immediately answers data questions — "What's our MRR?" "Which keyword dropped most this week?" "How's paid ROAS vs last month?" — all from already-synced data.

---

## 6. Phase 2 — Connect Your Tools in Workspace Settings ✅ Done

**Goal:** LenOS Settings → Integrations → user connects GitHub, Notion, Linear, Slack. Len gains access to that user's data in those tools.

GA/GSC/Ads/HubSpot/Stripe are company-level integrations (connected in LenGrowth dashboard). GitHub/Notion/Linear/Slack are workspace-level integrations — tools the team uses daily.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend** | ✅ `routes/workspace_integrations.py` + collection + router registered |
| **Desktop** | ✅ Workspace Integrations section added to `LenGrowthSettingsPanel.tsx` |
| **Web** | ✅ Integrations tab added to `SettingsModal.tsx` + new `IntegrationsSettingsPanel.tsx` |
| **Mobile** | ✅ Integrations section added to `settings_page.dart` (read-only, links to web) |
| **MCP** | ✅ 4 new tools in `lengrowth_mcp/tools.py` + registered in `main.py` |

### What was built

**Backend — `LenGrowth/backend/routes/workspace_integrations.py`:**
- `GET /api/workspace/integrations/status?company_id=` — list all 4 platforms with `{platform, connected, connected_at, scopes}`
- `GET /api/workspace/integrations/{platform}/connect?company_id=` — redirect to provider OAuth URL (state stored in session)
- `GET /api/workspace/integrations/{platform}/callback` — exchange code, upsert to `workspace_integrations`, redirect to `{FRONTEND_URL}/settings?tab=integrations&connected={platform}`
- `DELETE /api/workspace/integrations/{platform}?company_id=` — remove integration
- Reused: `services.auth_service.get_current_user`, `db_manager`, aiohttp token exchange, `$setOnInsert` upsert pattern
- Notion uses Basic auth (`client_id:client_secret`) per Notion API requirement; others use body params

**`workspace_integrations` MongoDB collection:**
```json
{ "user_id", "company_id", "platform", "access_token", "refresh_token", "token_expiry", "scopes", "connected_at", "updated_at" }
```
Env vars needed on Scalingo: `GITHUB_CLIENT_ID/SECRET/OAUTH_REDIRECT_URI`, `NOTION_*`, `LINEAR_*`, `SLACK_*`

**Desktop — `LenGrowthSettingsPanel.tsx`:**
- Workspace Integrations section renders only when LenGrowth is connected
- Connect: `openUrl(${LENGROWTH_BASE}/api/workspace/integrations/${platform}/connect?company_id=...)` 
- Disconnect: DELETE call, optimistic state update
- Status fetched on mount from `/api/workspace/integrations/status`

**Web — `IntegrationsSettingsPanel.tsx` + `SettingsModal.tsx`:**
- New "Integrations" tab in settings sidebar
- Calls `growth-api.lenquant.com` directly with `lenos_managed_signer_token`
- Connect: `window.open` to OAuth connect URL
- Shows "Connect LenGrowth first" if no `lengrowth-company-id` in localStorage

**Mobile — `settings_page.dart`:**
- Read-only `_IntegrationsSection` card with 4 rows (GitHub/Notion/Linear/Slack)
- Each row taps to `app.lengrowth.com/settings?tab=integrations` in external browser (manage on web/desktop for v1)

**MCP tools added:**
| Tool | What it does |
|---|---|
| `lengrowth_get_github_data` | Commits, PRs, issues from GitHub API |
| `lengrowth_get_notion_pages` | Search pages or query a database |
| `lengrowth_get_linear_issues` | List issues filtered by team/state/assignee (GraphQL) |
| `lengrowth_post_slack_message` | Post to Slack channel |

All tools: `resolve_user(nostr_pubkey)` → lookup `workspace_integrations` by `company_id + platform` → call platform API.

---

## 7. Phase 3 — Agent-Triggered Crons / Proactive Scheduling ✅ Done

**Goal:** "Len, send me a standup every morning at 8am" → Len creates a scheduled job → it runs forever.

This is the core differentiator vs Claude/ChatGPT. They have no persistent scheduled context. Len does.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend** | ✅ `agent_crons` collection + Celery task + 3 MCP tools + REST CRUD routes |
| **Desktop** | ✅ Automations section in `LenGrowthSettingsPanel.tsx` — list active crons, cancel button |
| **Web** | ✅ Automations tab in `SettingsModal.tsx` + `AutomationsSettingsPanel.tsx` |
| **Mobile** | ✅ `_AutomationsSection` in `settings_page.dart` — links to web for management |

### What was built

**Backend — `LenGrowth/backend/worker/agent_cron_tasks.py`:**
- `_parse_schedule(raw)`: accepts cron expression or natural language ("every day at 8am", "every morning at 9", "every week") → returns cron string
- `_next_run_utc(cron_expr, tz)`: uses `croniter` + `pytz` to compute next UTC run datetime
- `check_agent_crons` Celery task: queries `agent_crons` where `enabled=True` and `next_run_at <= now`, POSTs prompt to `NOSTR_ADAPTER_URL/publish` for each, updates `last_run_at`/`next_run_at`/`run_count`
- Added to `beat_schedule.py` as `check-agent-crons` (every minute) and `worker.agent_cron_tasks` to `celery_app.autodiscover_tasks`
- Added `croniter>=2.0.0`, `pytz>=2024.1` to `requirements.txt`

**Backend — `LenGrowth/backend/routes/agent_crons.py`:**
- `POST /api/agent/crons` — create cron, parses schedule, calculates `next_run_at`
- `GET /api/agent/crons?company_id=` — list enabled crons for user+company
- `DELETE /api/agent/crons/{cron_id}?company_id=` — sets `enabled=false` (non-destructive)

**`agent_crons` MongoDB collection:**
```json
{ "company_id", "user_id", "relay_url", "community_id", "channel_id", "workspace_slug",
  "nostr_pubkey", "prompt", "schedule", "timezone", "created_by_agent", "enabled",
  "last_run_at", "next_run_at", "run_count", "created_at", "updated_at" }
```

**MCP tools added (`lengrowth_create_cron`, `lengrowth_list_crons`, `lengrowth_delete_cron`):**
| Tool | What it does |
|---|---|
| `lengrowth_create_cron` | Creates scheduled recurring prompt; accepts cron or natural language schedule |
| `lengrowth_list_crons` | Lists all active crons for this company |
| `lengrowth_delete_cron` | Disables cron by ID (non-destructive) |

**End-to-end standup flow:**
1. User: "Len, send me a standup every morning at 8am"
2. Len calls `lengrowth_create_cron(prompt="...", schedule="every morning at 8am", timezone="America/Sao_Paulo", channel_id="...")`
3. Next morning 8am: Celery fires, posts prompt to relay as Len
4. Len executes: calls `lengrowth_get_github_data` + `lengrowth_get_google_analytics` + `lengrowth_get_tasks`, posts standup to channel
5. User: "Len, cancel the standup" → Len calls `lengrowth_delete_cron(cron_id)`

**Desktop — `LenGrowthSettingsPanel.tsx`:**
- Automations section renders above Workspace Integrations when connected and crons exist
- Each cron shows prompt (truncated), schedule + timezone + run count, Cancel button (optimistic DELETE)

**Web — `AutomationsSettingsPanel.tsx` + `SettingsModal.tsx`:**
- New "Automations" tab in settings sidebar
- Lists active crons with schedule metadata and trash-icon cancel per cron
- Empty state: "Ask Len to create one: 'Send me a standup every morning at 8am.'"

**Mobile — `settings_page.dart`:**
- `_AutomationsSection`: single row linking to `app.lengrowth.com/settings?tab=automations` for management

### LenGrowth/backend — new collection `agent_crons`

```json
{
  "company_id": "...",
  "user_id": "...",
  "relay_url": "wss://relay.lengrowth.com",
  "channel_id": "...",
  "nostr_pubkey": "...",
  "prompt": "Post morning standup: GitHub commits last 24h, GA traffic delta vs yesterday, top 3 active tasks",
  "schedule": "0 8 * * *",
  "timezone": "America/Sao_Paulo",
  "created_by_agent": true,
  "enabled": true,
  "last_run_at": null,
  "next_run_at": "2026-08-10T11:00:00Z",
  "run_count": 0,
  "created_at": "2026-08-09T..."
}
```

### LenGrowth/backend — new Celery task

Add to `worker/beat_schedule.py`:
```python
"check-agent-crons": {
    "task": "worker.tasks.agent_crons.check_agent_crons",
    "schedule": crontab(minute="*"),
}
```

`worker/tasks/agent_crons.py` logic:
1. Query `agent_crons` where `next_run_at <= now` and `enabled=true`
2. For each: post `prompt` as Nostr event to `relay_url` in `channel_id`, attributed to Len's pubkey
3. nostr_adapter receives → lenos-acp picks up → Len executes → reply posted to channel
4. Update `last_run_at = now`, `run_count += 1`, recalculate `next_run_at` from cron + timezone

### New MCP tools in `lengrowth_mcp/`

```python
@mcp.tool()
async def create_cron(
    nostr_pubkey: str,
    prompt: str,
    schedule: str,   # cron expression OR "every day at 8am"
    timezone: str,
    channel_id: str,
) -> dict | str:
    """Create recurring agent task. Natural language schedule parsed to cron expression.
    Returns: { cron_id, schedule, next_run_at }"""

@mcp.tool()
async def list_crons(nostr_pubkey: str) -> dict | str:
    """List all active crons for this company with schedule and last_run_at."""

@mcp.tool()
async def delete_cron(nostr_pubkey: str, cron_id: str) -> dict | str:
    """Disable cron by ID. Sets enabled=false, does not delete document."""
```

### End-to-end standup flow

1. User: "Len, send me a standup every morning at 8am with latest commits, GA traffic, and top tasks"
2. Len calls `create_cron(prompt="...", schedule="0 8 * * *", timezone="America/Sao_Paulo", channel_id="...")`
3. Next morning 8am: Celery fires, posts prompt to channel as Len
4. Len calls `get_github_data()` + `get_google_analytics()` + `lengrowth_get_tasks()`
5. Formats and posts standup — whole team sees it. Repeats every day.
6. User can cancel: "Len, cancel the morning standup" → Len calls `delete_cron(cron_id)`

---

## 8. Phase 4 — Free Zero-Auth Utility Tools (1 day)

**Goal:** General tools Len can use for any user, no credentials needed. Operator-level — shared across all workspaces.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend (Node MCP)** | Add 4 tools to `backend/mcp/server.js` — web fetch, search, weather, RSS |
| **Desktop** | No UI change — Len uses tools automatically |
| **Web** | No UI change — Len uses tools automatically |
| **Mobile** | No UI change — Len uses tools automatically |

Add to `LenGrowth/backend/mcp/server.js` (Node MCP aggregator, already deployed as `lengrowth-mcp`):

| Tool | Implementation | Scalingo env var |
|---|---|---|
| Web fetch / scrape | Native `fetch` in Node 24 — custom handler | None |
| Web search | Tavily API (1000 req/mo free tier) | `TAVILY_API_KEY` |
| Weather | Open-Meteo REST API (free, no key) | None |
| RSS feed reader | `rss-parser` npm package | None |

---

## 9. Phase 5 — Migrate Complex Dashboard Views into LenOS (3–5 months)

Move high-value LenGrowth dashboard views into LenOS as workspace panels. Users never need to leave the workspace for daily work.

### 5a. Task list panel (low effort, high value — 2–3 days)

Sidebar panel in LenOS showing tasks from LenGrowth backend (`lengrowth_get_tasks` MCP tool — already exists). Click task → task detail. Create task from Len chat. List view first, Kanban later.

**Surface checklist:**
| Surface | Work needed |
|---|---|
| **Desktop** | New sidebar panel component — task list, click-to-detail, create from chat |
| **Web** | New sidebar or workspace panel — same task list UI |
| **Mobile** | Dedicated Tasks screen in bottom nav or drawer — list view, tap to detail |

### 5b. Metrics dashboard panel (medium effort — 3–4 days)

Workspace home panel: north star metric, top 3 KPIs, weekly delta. Calls Phase 1 MCP tools. Simple numbers + sparklines, narrated by Len: "Traffic up 12% vs last week, mostly organic. MRR flat." Better than a chart nobody reads.

**Surface checklist:**
| Surface | Work needed |
|---|---|
| **Desktop** | Home route panel — metric tiles + Len narration block |
| **Web** | Home page section — same metric tiles |
| **Mobile** | Home screen widget or scroll section — simplified metric tiles (sparklines optional) |

### 5c. Kanban pipeline view (high effort — 2–3 weeks)

Port LenGrowth Kanban into LenOS workspace panel. Same stages (Queued → Active → Waiting → Monitoring → Done), same drag-and-drop, same task detail dialog.

**Surface checklist:**
| Surface | Work needed |
|---|---|
| **Desktop** | New route/panel — drag-and-drop Kanban board |
| **Web** | New route/panel — same Kanban board |
| **Mobile** | Simplified list-by-stage view (drag-and-drop impractical on mobile) — swipe to change stage |

### 5d. Growth Trees visualization (high effort — 2–3 weeks)

Port React Flow Growth Trees into LenOS. Defer until after Kanban.

**Surface checklist:**
| Surface | Work needed |
|---|---|
| **Desktop** | New panel — React Flow graph, same as LenGrowth dashboard |
| **Web** | New panel — same React Flow graph |
| **Mobile** | Read-only tree view (interactive graph impractical on mobile for v1) |

### 5e. Reporting view (medium effort — 1 week)

Replace decorative charts with Len-narrated reports. Len reads metrics, writes paragraph about what changed and why. Append chart if needed. Strictly better than the current dashboard view.

**Surface checklist:**
| Surface | Work needed |
|---|---|
| **Desktop** | Report panel — Len narrative text + optional chart |
| **Web** | Report page — same narrative + chart |
| **Mobile** | Report screen — narrative text first, chart scrolls below |

---

## 10. Phase 6 — Specialists as Workspace Members (2–4 weeks)

**Goal:** Instead of assigning a task to a specialist via a ticket form (current LenGrowth model), a specialist joins your workspace as a real participant — Nostr identity, appears in channels, @mentionable, picks up tasks directly.

Reuses existing backend: `models/specialist.py`, Cerbos RBAC, Stripe specialist seats. Only the entry point changes — workspace invite instead of task assignment form.

### Surface checklist
| Surface | Work needed |
|---|---|
| **LenGrowth backend** | 2 new MCP tools (`request_specialist`, `list_workspace_members`); specialist Nostr provisioning on assignment |
| **Desktop** | Specialist appears as workspace member automatically — no dedicated UI needed for v1; members list shows role "specialist" |
| **Web** | Same — member list shows specialist role badge |
| **Mobile** | Same — member list shows specialist role badge |

### How it works

1. User: "Len, I need a specialist for our SEO strategy"
2. Len calls `request_specialist(nostr_pubkey, category="seo", description="...", channel_id="...")`
3. LenGrowth matches + assigns specialist from talent pool
4. Backend provisions Nostr identity for specialist via `managed_nostr_identities`
5. Specialist invited to workspace channel (e.g. `#seo-strategy`) as real participant
6. They see channel history, pick up tasks, post updates — same as any team member
7. Billing: specialist seat ($990/mo Enterprise OS) charged via existing Stripe

### New MCP tools

```python
@mcp.tool()
async def request_specialist(
    nostr_pubkey: str,
    category: str,       # seo | ads | content | growth | aso | email
    description: str,
    channel_id: str | None = None,
) -> dict | str:
    """Request specialist be added to workspace. Returns request_id."""

@mcp.tool()
async def list_workspace_members(nostr_pubkey: str) -> dict | str:
    """List all workspace members: users, agents (Len/Scout/Forge), active specialists."""
```

---

## 11. What LenGrowth Frontend Becomes

After Phase 5, the LenGrowth Next.js dashboard (`dashboard.lengrowth.com`) is scoped to the management plane only:

| Section | What it does |
|---|---|
| Billing & Plans | Stripe subscription, upgrade/downgrade, usage metering |
| Admin | User management, roles, SSO/SCIM config |
| Specialist Marketplace | Browse specialists by category, review history, hire outside workspace context |
| App Directory (future) | 3rd-party integrations, partner tools — equivalent to Slack's app directory |
| API Keys | For developers building on LenGrowth backend |
| Company Profiles | Multi-company management for Enterprise OS agencies |

Never decommissioned. Grows into a management + marketplace surface. `lengrowth.com` = marketing + management. LenOS workspace = where work happens.

---

## 12. Build Order

| # | Phase | Effort | What it unlocks |
|---|---|---|---|
| 0 | Fix signup — one flow, auto-link identities | 1 week | Everything |
| 1 | MCP tools for existing synced data | 1–2 days | Len answers data questions immediately |
| 4 | Free zero-auth tools (search, fetch, weather) | 1 day | Len can research anything |
| 2 | Connect Your Tools settings tab (GitHub first) | 3–5 days | Phases 3 and 6 |
| 3 | Agent-triggered crons + standup flow | 3–4 days | Proactive agents |
| 5a | Task list panel in LenOS | 2–3 days | Phase 5c |
| 5b | Metrics dashboard panel | 3–4 days | Phase 5e |
| 5c | Kanban pipeline in LenOS | 2–3 weeks | Phase 5d |
| 5d | Growth Trees in LenOS | 2–3 weeks | — |
| 5e | Len-narrated reporting | 1 week | — |
| 6 | Specialists as workspace members | 2–4 weeks | Marketplace growth |

---

## 13. What NOT to Rebuild

- All GA/GSC/Ads/Meta/HubSpot/Shopify/Stripe/PostHog OAuth flows — done in `services/integrations/`
- Celery Beat infrastructure — only add tasks to `beat_schedule.py`
- Token storage for existing 9 integrations — `workspace_integrations` is additive for new platforms
- Supabase ↔ Nostr identity bridge — `nostr_links` + `managed_nostr_identities` fully built
- lenos-acp agent runtime — Len already dispatches and orchestrates
- Node MCP aggregator (`lengrowth-mcp`) — deployed, just add connectors
- Stripe billing — stays in LenGrowth backend + management plane
- Cerbos RBAC — reused as-is for specialist permissions in Phase 6
- Specialist assignment backend — reused in Phase 6, different entry point only

---

## 14. Open Questions

1. **Domain:** Does LenOS web become `app.lengrowth.com`? Needs decision before Phase 0 ships.
2. **Supabase auth in LenOS web:** Current LenOS web uses NIP-07 / Nostr keypair for auth. For users without a Nostr extension, the managed identity flow needs wiring into LenOS web signup — thin `/api/provision-identity` endpoint callable from LenOS web.
3. **Relay auth for crons (NIP-42):** When Celery fires a cron and posts to relay as Len, it needs Len's private key to sign the event. Len's managed Nostr identity must be provisioned at workspace creation and its signing key accessible by the Celery worker.
4. **Multi-company:** Enterprise OS users manage up to 20 company profiles. Phase 0 creates one — multi-company workspace switching is a future concern.
