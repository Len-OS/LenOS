# Production Gap Analysis — LenOS + LenGrowth
_Last updated: 2026-08-13_

## What Already Works

Before gaps — confirmed existing features (first audit was wrong on several):

| Feature | Status | Evidence |
|---|---|---|
| Huddle (audio + video + screen share) | ✅ | `huddleVideoWs.ts:358`, `HuddleContext.tsx:584`, `desktop/src-tauri/src/huddle/video.rs` |
| @mentions (users, teams, agents) | ✅ | `useMentions.ts`, `agentAutocompleteEligibility.ts:33` |
| Emoji reactions | ✅ | `MessageReactions.tsx`, kind:7 events |
| Search UI | ✅ | `SearchModal.tsx`, `TopbarSearch.tsx` |
| Scheduled workflows (cron) | ✅ | `lenos-workflow/src/lib.rs:520`, 60s tick loop active |
| Group DMs | ✅ | `channelLabels.ts:15`, multi-participant hash in schema |
| Message edit | ✅ | kind:40003 in relay, `edit_message` Tauri command |
| Message delete | ✅ | kind:5 (NIP-09) in `lenos-core/src/kind.rs:55` |
| Status messages | ✅ | `StatusPicker.tsx`, KIND_USER_STATUS=30315 |
| Workspace switching | ✅ | `WorkspaceSwitcher.tsx:80` |
| Channel sections/folders | ✅ | `channelSectionsSync.ts`, KIND_CHANNEL_SECTIONS=30078 |
| LenGrowth MCP (24 tools) | ✅ | `LENGROWTH_MCP_URL` auto-inject, GA/GSC/paid media/GitHub/Notion |
| Real-time (typing, presence) | ✅ | Redis pub/sub, NIP-42 auth |
| Invite + workspaces | ✅ | NIP-98, slug provisioning, `*.lengrowth.com` wildcard |
| Document Q&A (RAG) | ✅ | `lenos-rag`, `search_documents` tool |
| Agent sessions + transcripts | ✅ | `lenos-agent`, MCP protocol |
| Recurring agent tasks | ✅ | `lengrowth_create_cron` MCP tool |
| Integrations (GA, GSC, HubSpot, Stripe, Shopify, PostHog) | ✅ | `lengrowth_mcp/main.py` tools |
| K8s + observability | ✅ | Helm charts, OpenTelemetry, Prometheus, Datadog |

---

## What Slack Has That We Don't

### Confirmed Missing Features

| Feature | Priority | Notes |
|---|---|---|
| Do Not Disturb | High | No pause-notifications mode anywhere |
| Scheduled messages | Medium | Cron exists for workflows, not for user-scheduled send |
| Saved messages UI | Medium | NIP-51 bookmark kinds defined, no UI component |
| Channel bookmarks UI | Medium | Kinds defined (`KIND_BOOKMARK_LIST`), no UI |
| Custom emoji upload | Low | Emoji picker exists, no upload/manage |
| Outgoing webhooks | Medium | No user-configurable webhook endpoints |
| Notification keyword rules | Medium | Only toggle on/off, no keyword triggers |
| SSO / SAML | High (enterprise) | OAuth exists for agent→LLM only, not user login |
| 2FA / MFA | High (enterprise) | Nostr keys only, no TOTP/SMS |
| Bulk invite | Low | Single invite tokens only |
| Data export (GDPR) | High (compliance) | Audit crate exists, no export UI |
| User directory / people search | Medium | Minimal profiles, no searchable people list |
| Desktop/mobile parity | High | Explicitly deferred in `LENOS_GO_LIVE_PLAN.md` |
| Huddle quality settings UI | Low | Audio relay works, no bitrate/quality toggles |
| Huddle recording | Low | No record/playback |
| Channel analytics | Low | No per-channel usage metrics for workspace admin |

### Confirmed Pending (Production Blockers from LENOS_GO_LIVE_PLAN.md)

| Item | Status |
|---|---|
| Durable E2E test identity verification | Pending |
| Agent completion callbacks in production | Pending |
| Relay/ECS health confirmation | Pending |

---

## Phased Roadmap

### Phase 0 — Production Launch Blockers (do now)

These block safe launch:

1. **Agent completion callbacks**
   - Verify `LENOS_RELAY_URL` (or equivalent) is set in prod ECS task definition
   - Add `scripts/smoke-agent.sh`: publish test prompt to relay via WebSocket → wait ≤30s for agent reply event → exit 0/1
   - Wire as post-deploy CI check
   - If env var missing/wrong: fix in `infra/terraform/main.tf` ECS task definition

2. **Relay/ECS health**
   - Relay already has `/_readiness` (Postgres + Redis ping, 2s timeout) at `crates/lenos-relay/src/router.rs:388`
   - Change Terraform ALB target group health check from `/health` → `/_readiness`
   - Add CloudWatch alarm: unhealthy target count > 0

3. **Durable E2E test identity**
   - Generate stable keypair; store private key in AWS Secrets Manager as `lenos/test-owner-privkey`
   - Add `.github/workflows/e2e-daily.yml` (cron `0 8 * * *`): read secret → set `LENOS_TEST_OWNER_PRIVATE_KEY` → run `cargo test -p lenos-test-client -- e2e` against prod relay URL
   - Failures alert on-call via existing alerting

4. **Desktop/mobile minimum parity**
   - Parity gap audit: 18/20 features already in both; only 4 real gaps
   - **Documents → desktop:** add `documents` feature to `desktop/src/features/` mirroring `web/src/features/documents/`; reuse hooks/components; wire Tauri HTTP for upload; add desktop router route
   - **Agent Memory → web:** copy `desktop/src/features/agent-memory/` into `web/src/features/agent-memory/`; add to web router under agents page
   - Mesh Compute (local LLM) intentionally desktop-only; Repos intentionally web-only

### Phase 1 — Core UX Gaps (Sprint 1-2, ~2 weeks)

Features real users hit immediately:

1. **Do Not Disturb**
   - State stored in kind:30078 (`d:"dnd"`) with fields `enabled: bool`, `expires_at: unix_ts | null`
   - Both web + desktop subscribe to own pubkey's DnD event on load
   - `desktop/src/features/notifications/lib/shouldNotify.ts`: add DnD check at top — if active and not expired, return false
   - Settings: DnD toggle + preset durations (30m / 1h / until EOD / custom) + manual off
   - Auto-expiry: client-side `setTimeout` re-publishes `enabled: false` at expiry

2. **Saved Messages UI**
   - Save action in message context menu (web + desktop)
   - On save: publish kind:10003 replaceable list, append message event ID as `e` tag
   - New `/saved` route + `SavedMessagesPage`: subscribe to own kind:10003, resolve `e` tags → original events, render reverse-chron
   - Unsave: remove `e` tag, republish
   - Reuses existing `useProfile` + message rendering components

3. **Channel Bookmarks UI**
   - Bookmark action in message context menu
   - On bookmark: publish kind:30003 parameterized by channel (`d: channel_id`), append message event ID as `e` tag
   - Channel sidebar gets collapsible "Bookmarks" section: subscribe to own kind:30003 filtered by channel
   - Click jumps to message in history

4. **Notification Keyword Rules**
   - `keyword_rules` field added to kind:30078 (`d:"notif-settings"`) alongside existing mute prefs
   - Settings UI: text input to add keywords, list to remove
   - `shouldNotify.ts`: keyword pass after mute check — if message text matches any keyword → force-notify + set `matched_keyword` flag for feed highlight

5. **User Directory**
   - New `/people` route + `PeoplePage` component (web + desktop)
   - On mount: subscribe to kind:0 (profiles) for all pubkeys in workspace channels (from kind:39000 metadata)
   - Searchable grid: filter by display name, NIP-05
   - Click → existing `ProfilePopover` + "Send DM" button wired to DM flow

### Phase 2 — Feature Parity (Sprint 3-5, ~4 weeks)

Close the gap with Slack's daily-use features:

1. **Scheduled messages** — composer date/time picker; store as draft event with `not_before`; deliver via workflow engine
2. **Custom emoji upload** — workspace admin uploads PNG/GIF; stored in Blossom; short-name → URL mapping in workspace kind
3. **Outgoing webhooks** — workspace admin configures URL + event filter; relay fan-out posts JSON to endpoint on match
4. **Notification keyword rules (advanced)** — regex support, per-channel scoping, mute specific keywords
5. **Huddle quality settings** — expose bitrate, noise suppression toggle, audio device selector in HuddleBar
6. **Data export (GDPR)** — admin UI: export all events for a user as JSON/ZIP; uses audit crate already built

### Phase 3 — Enterprise (Sprint 6-10, ~6 weeks)

Needed for B2B/enterprise customers:

1. **SSO / SAML** — add SAML2 provider support to auth flow; map SAML attributes to Nostr key provisioning; support Okta/Azure AD/Google Workspace
2. **2FA / MFA** — TOTP as second factor on top of Nostr key login; recovery codes
3. **Bulk invite** — CSV upload in workspace settings; batch create invite tokens
4. **Audit trail UI** — admin view over `lenos-audit` crate data; filter by user/channel/event type; export
5. **Channel analytics** — messages/day, active members, top contributors per channel; workspace-level rollup

### Phase 4 — LenGrowth Intelligence Loop (Sprint 8-10, ~4 weeks)

Make LenGrowth proactive — the system acts on signals without the user asking.

**Dropped / deferred from original plan:**
- ~~Dashboard in LenOS~~ — feedback analytics belong in the LenGrowth frontend, not the chat platform
- ~~Agent performance scoring UI~~ — deferred to Phase 5; backend tracking still collected
- ~~Cross-company pattern library~~ — deferred to Phase 5; premature and privacy complexity not worth it yet

**3 deliverables:**

1. **Proactive growth reports** _(centerpiece)_ — scheduled pipeline runs `reporting_service.py` weekly/monthly; broadcasts report as a Nostr event to the workspace channel via relay; no user action required. Infrastructure is nearly complete (`reporting_service.py` 1625 lines mature, `lengrowth_create_cron` MCP tool exists, relay broadcast plumbing exists). Work: add scheduler entry-point in LenGrowth, emit relay event with report payload, LenOS renders it as a structured message in the agent channel.

2. **Signal threshold → suggest mode** — `bottleneck_scorer.py` emits a suggestion event when a bottleneck severity score crosses a configurable threshold; agent posts the suggestion in workspace for user approval before any task is created. Auto-create only enabled after N accepted suggestions (confidence gate). Prevents wrong-data-at-start problem while building toward full autonomy. Work: add threshold config table + monitor loop in LenGrowth; new MCP tool `lengrowth_set_signal_threshold`; LenOS renders suggestion cards with approve/dismiss actions.

3. **Feedback wire-up** _(backend only, no new LenOS UI)_ — `RecommendationFeedbackType` already defined (accepted/dismissed/snoozed/not_meaningful_now/prefer_different_mode); outcomes already tracked in `telemetry_service.py`. Work: pipe accepted/dismissed outcomes back into `bottleneck_scorer.py` category weights so high-dismissal signal types get lower severity scores over time. Pure LenGrowth backend change.

### Phase 5 — Platform Expansion (Backlog)

Nice-to-have after core is solid:

- Huddle recording + async playback
- Screen annotation during share
- Mobile feature parity (Flutter)
- Workspace federation (relay mesh, already in `lenos-relay-mesh`)
- Giphy / GIF search integration
- Slack import / migration tool
- App directory for third-party LenOS integrations
- White-label workspace branding per tenant

---

## LenGrowth ↔ LenOS Integration Status

| Capability | Status | Gap |
|---|---|---|
| Workspace provisioning on `slug.lengrowth.com` | ✅ | — |
| `@lengrowth` mention → agent dispatch | ✅ | Needs prod callback verification |
| Role commands (seo, ads, blog, social...) | ✅ | — |
| 24 MCP tools accessible from browser agent | ✅ | LENGROWTH_MCP_URL must be set in prod env |
| GA / GSC / paid media data in agent context | ✅ | Integrations must be connected per company |
| Recurring cron tasks via `lengrowth_create_cron` | ✅ | — |
| Proactive daily/weekly growth reports | ❌ | Phase 4 — scheduler + relay broadcast not wired |
| Signal threshold → workspace suggestion | ❌ | Phase 4 — bottleneck_scorer exists, threshold monitor + suggest mode missing |
| Recommendation feedback → improved suggestions | ❌ | Phase 4 — telemetry collected, weight feedback loop not wired |
| Cross-company learning | ❌ | Phase 5 — deferred |

---

## Summary Priority Stack

```
NOW:   agent callbacks prod  |  relay health  |  E2E smoke test  |  desktop parity minimum
P1:    DnD  |  saved msgs  |  bookmarks  |  keyword rules  |  user directory
P2:    scheduled msgs  |  custom emoji  |  webhooks  |  GDPR export  |  huddle quality
P3:    SSO/SAML  |  2FA  |  bulk invite  |  audit UI  |  channel analytics
P4:    proactive reports  |  signal suggest-mode  |  feedback weight tuning
P5:    huddle recording  |  mobile parity  |  relay federation  |  app directory
```
