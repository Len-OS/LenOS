# LenOS / LenGrowth Web Workspace Readiness

**Audit date:** 2026-08-07
**Scope:** `LenOS/web`, LenOS desktop/Tauri capabilities, and the LenGrowth workspace/integration surfaces in `C:\Users\smikl\Desktop\Work\LenGrowth`.

## 1. Executive conclusion

The web shell is not yet a 100% launch-ready replacement for the desktop application. It is a separate connected workspace client with a different capability boundary.

The current web implementation already has a substantial surface: workspace lookup, relay-backed channels and messages, browser/NIP-07 identity support, invites, agents/agent sessions, workflows, repos, search, settings, notifications, reactions, threads, moderation, and responsive UI work. The main remaining risk is not the existence of screens; it is end-to-end proof against real authenticated data and production services.

The correct launch definition should be:

1. **Web beta complete:** all browser-supported collaboration flows work against production-like relay/API data, with isolation, reconnect, authorization, error handling, accessibility, and responsive validation.
2. **Desktop parity complete:** desktop retains all native-only capabilities and shares the same workspace/identity/event contract.
3. **Mobile complete:** mobile is a separate client milestone; it should not be represented as complete merely because the web UI is responsive.

Native sidecars, local agent runtime, OS deep links, and Tauri updater behavior cannot be reproduced by the static browser shell without adding a new browser/host service. They must either remain explicitly desktop-only or receive a documented web equivalent.

## 2. Current architecture and boundary

| Area | Web client | Desktop client | Readiness implication |
|---|---|---|---|
| Workspace identity | Host slug resolves through the public LenGrowth workspace endpoint to a relay community | Native app can use local/native configuration and Tauri commands | Must converge on the same slug/community contract |
| Collaboration | Browser WebSocket to `wss://relay.lengrowth.com`; Nostr events; NIP-07 or ephemeral read-only identity | Native relay client plus Tauri bridge | Web must prove reconnect, auth, publish, dedupe, and isolation |
| Channels/messages | Implemented in `web/src/features` | Implemented with native-backed desktop flows | Must validate create, edit, delete, send, history, threads, reactions, unread state |
| Agents | Remote/managed LenGrowth agents are visible; local agents are not runnable in the browser | Local and managed agent runtime supported through native commands/sidecars | Web needs clear remote-only UX and desktop handoff for local runtime |
| Deep links | HTTP invite route exists | `lenos://` and other native deep links exist | Web needs stable HTTP invite/share URLs; native links remain desktop-specific |
| Updates | Cloudflare Pages deployment, no binary updater | Tauri updater plugin/configuration exists | Web deployment rollback/versioning must be documented separately |
| Mobile | Responsive browser layout only | Flutter mobile tree exists but is not ready | Mobile app remains a separate release gate |

## 3. Required capability decisions

Before calling the product 100% complete, document and expose these rules in the UI and release notes:

- A browser user can read and collaborate through the relay.
- A browser user can use remote LenGrowth agents and task/callback flows once the integration is enabled.
- A browser user cannot run a local ACP/sidecar agent, access local files/processes, use Tauri commands, or receive native OS deep links.
- A desktop user can run local agents, use sidecars, receive `lenos://` links, and use the Tauri updater.
- A mobile user is not part of the web launch unless the Flutter client has its own complete release checklist.
- “Team Hub” must be defined as either the LenGrowth company/member system or the LenOS relay community. They currently have different data models and authorization paths; the test plan must cover both if both are product requirements.

## 4. Web functionality inventory

The following surfaces are present in the web source and need completion-level verification rather than assuming they work because the route exists:

- Workspace host lookup and not-found handling.
- Home/inbox and browser notifications.
- Channel list, channel creation, editing, deletion, membership, unread/starred/muted state.
- Message history and live updates, composer, replies/threads, reactions, typing state, attachments where supported.
- Browser identity: ephemeral read-only mode, NIP-07 detection, signing failures, identity/profile settings.
- Community invites: invite creation, copy/share, HTTP invite landing page, browser claim, desktop handoff, invalid/expired/exhausted states.
- Members and moderation: member display, reports, mute/ban, permission-denied states.
- Team/agent views: remote agent roster, sessions, status, agent requests, task result callbacks, missing-agent states.
- Workflows, pulse/activity, repos/project browsing, search, settings, theme, notification permission, relay settings.
- Routing: direct load and refresh of every route, unknown workspace, unknown channel, unknown post, invite URL, and browser back/forward behavior.

## 5. Launch gates

### Gate A — Production shell and workspace isolation

- [ ] `https://<slug>.lengrowth.com` serves the current web build with correct custom-domain routing.
- [ ] Public lookup returns the expected slug, relay community ID, and relay URL.
- [ ] Unknown, deleted, suspended, and malformed slugs fail safely without leaking another workspace.
- [ ] Two test workspaces are provisioned. Events from workspace A never appear in workspace B.
- [ ] Relay WSS, health, persistence, and reconnect behavior are verified from a real browser.
- [ ] Cloudflare Pages environment variables, cache behavior, SPA fallback, security headers, and rollback procedure are recorded.

### Gate B — Authenticated identity and permissions

- [ ] A durable NIP-07 identity can connect, sign, publish, refresh, and reconnect.
- [ ] Read-only/ephemeral mode is visibly limited and cannot silently become the account identity.
- [ ] Missing extension, locked extension, rejected signature, stale identity, and relay AUTH failure have actionable messages.
- [ ] Unauthenticated users can only perform explicitly allowed read actions.
- [ ] Authorized members can create/update/delete channels and send messages.
- [ ] Non-members and insufficient-role users receive a stable denial state; they cannot publish by bypassing the UI.
- [ ] Admin/owner-only invite, membership, moderation, and settings operations are tested.
- [ ] Identity linking to LenGrowth is idempotent and revocable.

### Gate C — Core collaboration E2E

Use at least two real browser identities and one admin identity.

- [ ] Create a public channel; it appears for both users after live update and refresh.
- [ ] Create a private channel; only permitted members can discover and read it.
- [ ] Send a message from user A; user B receives it live; both see it after refresh.
- [ ] Verify duplicate events are not rendered twice after history/live overlap or reconnect.
- [ ] Verify ordering, pagination/history, empty state, loading state, failed publish, retry, and offline/reconnect behavior.
- [ ] Verify replies/threads, reactions, mentions, typing indicator, unread counts, mark-read, starred/muted channels, and navigation anchors.
- [ ] Verify edit/delete/report/moderation behavior, including permission-denied and already-deleted events.
- [ ] Verify long messages, markdown/rich content, emoji, Unicode, media/link previews where supported, and unsafe content handling.

### Gate D — Invitations and Team Hub membership

- [ ] Admin creates an invite with the intended expiry/use limit/role.
- [ ] Copy/share link opens the correct workspace and survives a cold browser load.
- [ ] New user completes age/legal policy requirements, creates or connects identity, claims invite, and lands in the correct workspace.
- [ ] Existing user accepts invite without duplicate membership.
- [ ] Invalid, expired, exhausted, revoked, wrong-workspace, and already-used invite states are tested.
- [ ] Member appears in the correct LenOS community and, if required, the LenGrowth company/Team Hub.
- [ ] Role mapping is tested end-to-end. The LenGrowth audit already records a frontend/backend mismatch around `team_member`; resolve or explicitly remove that role before launch.
- [ ] Member list, pending invites, removal, role change, and re-invite are verified against the actual API response shape.
- [ ] A real test company and at least two memberships exist. The current test account lacking company/member setup is a test-data blocker, not evidence that the flow works.

### Gate E — LenGrowth task and agent loop

- [ ] Workspace identity is linked to exactly one LenGrowth identity.
- [ ] Browser can create a typed task/request for Growth Guide, Market Analyst, and Execution Partner.
- [ ] Task includes required company, task type, step, input, source event, workspace, and correlation metadata.
- [ ] Adapter accepts the intended command/UI path; the existing plan notes that the parser is narrower than the MCP surface.
- [ ] Queued, running, success, failure, timeout, cancellation, and retry states are visible.
- [ ] Completion/failure callback returns to the originating workspace/channel/thread exactly once.
- [ ] API timeout, expired link, revoked link, worker failure, relay disconnect, and duplicate callback are tested.
- [ ] Remote agent roster and session history are accurate after reconnect and refresh.
- [ ] Browser clearly directs users to desktop for local agent runtime; no dead “run locally” action is exposed in web.

### Gate F — Desktop/native compatibility

- [ ] Desktop and web use the same workspace slug, relay community, event kinds, channel IDs, and identity/link semantics.
- [ ] Native sidecars start, stop, restart, report logs/errors, and recover after app restart.
- [ ] Local agent runtime permissions, provider configuration, environment variables, secrets, and process cleanup are tested.
- [ ] `lenos://join`, `lenos://connect`, `lenos://add-community`, and message deep links open the intended desktop state.
- [ ] Deep-link pending queue, acknowledgement, duplicate delivery, malformed URL, and app-not-running cases are tested.
- [ ] Updater metadata/signatures/endpoints, update available, download failure, install failure, restart, rollback/recovery, unsupported platform, and disabled-update builds are tested.
- [ ] Desktop-only capabilities are marked in the web UI instead of appearing broken.

### Gate G — Responsive web and accessibility

- [ ] Validate 320px, 375px, 414px, 768px, 1024px, 1280px, and ultrawide layouts.
- [ ] Validate mobile browser portrait/landscape, virtual keyboard, safe areas, scrolling, modal focus, and back navigation.
- [ ] Sidebar/channel navigation has a mobile drawer or equivalent; composer remains usable with the keyboard open.
- [ ] No horizontal overflow, clipped dialogs, inaccessible hover-only controls, or fixed-height content traps.
- [ ] Keyboard navigation, visible focus, labels, dialog semantics, escape handling, screen-reader names, contrast, reduced motion, and zoom are checked.
- [ ] Browser notification permission denial and unsupported browsers degrade cleanly.

### Gate H — Operational readiness

- [ ] Build, deploy, rollback, and cache invalidation are repeatable from documented commands.
- [ ] Frontend errors include release version, workspace slug, route, relay URL, and correlation ID without logging secrets or message content unnecessarily.
- [ ] Relay, public workspace lookup, invite API, adapter, workers, and callback paths have health checks and alerts.
- [ ] Rate limits and abuse controls cover workspace creation, invite claims, message publishing, and agent/task triggering.
- [ ] Backups and restore tests exist for LenGrowth workspace records and relay state/media as applicable.
- [ ] Ownership, on-call, incident response, support escalation, and known limitations are written down.
- [ ] Privacy, retention, export/delete, account deletion, invite policy, and terms/age-gate behavior are approved for launch.

## 6. Test data required

Create a disposable production-like fixture before E2E execution:

| Identity | Required setup |
|---|---|
| Owner/admin | LenGrowth company, Team Hub/company membership, LenOS community membership, NIP-07 identity, invite/admin permissions |
| Member | Same company and LenOS community, normal member role, NIP-07 identity |
| Restricted user | Account without membership or with viewer/guest permissions |
| Remote agent | At least one real managed agent with a known callback path |
| Failure fixture | Expired/revoked invite, disconnected relay, invalid signature, failing task/worker |

Record IDs, not private keys, in the runbook. Reset fixtures between runs and make every provisioning operation idempotent.

## 7. Verification suite to add

The current web E2E suite is invite/smoke-oriented; desktop has much broader E2E coverage. The web release gate needs its own authenticated suite, not a desktop test count reused as proof.

Minimum browser specs:

1. `workspace-shell.live.spec.ts` — lookup, relay connection, loading/error/not-found states.
2. `channels-authenticated.live.spec.ts` — list/create/edit/delete/public/private/permissions.
3. `messages-authenticated.live.spec.ts` — send, receive, refresh, history/live dedupe, reconnect, ordering.
4. `threads-reactions.live.spec.ts` — reply, thread route, reactions, mentions, typing, unread/read.
5. `invites-team-hub.live.spec.ts` — create, claim, membership, role, revoke, expiry, duplicate acceptance.
6. `agent-loop.live.spec.ts` — link, request, queue, callback success/failure, duplicate callback.
7. `responsive-web.spec.ts` — mobile and desktop viewport interaction, keyboard, drawer, dialogs, overflow.
8. `security-isolation.live.spec.ts` — cross-workspace reads/writes, unauthorized routes, malformed input, rate-limit behavior.

Also add unit/contract tests for relay event parsing, NIP-42 auth, event signing, workspace lookup, invite API payloads, role mapping, callback correlation, and updater/deep-link contracts on desktop.

## 8. Priority order

### P0 — blocks web beta

- Provision real owner/member/company test data.
- Complete authenticated channel/message E2E.
- Prove relay/community isolation and permission enforcement.
- Complete invite and Team Hub membership flow.
- Prove identity linking and at least one successful/failing remote agent callback.
- Fix all frontend/backend membership-role and invite response contract mismatches.
- Verify production deploy, WSS, SPA routing, observability, and rollback.

### P1 — required for a credible public release

- Responsive mobile-web and accessibility pass.
- Reconnect/offline/retry/deduplication hardening.
- Full error states, rate limits, abuse controls, privacy/retention review.
- Desktop shared-contract verification, native deep links, sidecar lifecycle, and updater release test.
- Support/runbook/incident documentation.

### P2 — can follow browser beta

- Flutter mobile parity.
- Browser equivalents for local agents, if product strategy requires them.
- Advanced workflows, richer integrations, and polish beyond core collaboration.

## 9. Definition of done

Call the web workspace **ready** only when all P0 gates are checked by a real authenticated run and the release owner has recorded URLs, build version, relay version, test identities, date, and evidence.

Call the overall LenOS product **100% complete** only when:

- the web capability contract is complete and tested;
- desktop native capabilities are complete and tested;
- mobile has passed its own release gates;
- LenGrowth company/Team Hub and LenOS community membership are intentionally aligned;
- production operations, security, recovery, and support are ready.

Until then, the accurate status is: **web shell implemented; authenticated collaboration and integration validation incomplete; native parity and mobile intentionally outstanding.**

## 11. Current implementation session (2026-08-07)

### Feature/readiness matrix

| Area | Status | Evidence / next proof |
|---|---|---|
| Workspace lookup and relay URL | Implemented locally | Public workspace lookup and fixed relay URL code exist; live authenticated isolation remains unverified. |
| Persistent relay channels/messages | Implemented locally | Live client, history/live merge, ordering, and event-ID dedupe exist; browser reconnect and permission E2E remain open. |
| Authenticated channel/message permissions | Missing proof | Requires owner, member, and restricted NIP-07 identities against a real relay community. |
| Invitations and Team Hub membership | Partially implemented | Invite CRUD and role catalog exist. Invite-history callers now use an explicit status-capable API; live claim/membership mapping remains unverified. |
| Membership role contract | Implemented locally | Frontend `MembershipRole` now matches backend enum; `team_member` is not accepted. |
| LenGrowth identity linking | Implemented / live smoke verified | Deployed backend commit `c669e4f` passed authenticated link, repeat-link, and revoke checks with `+32`; durable browser signer persistence remains open. |
| Remote agent task/callback loop | Partially implemented | Typed browser actions and adapter mappings exist; success/failure callback E2E remains blocked by authenticated agent data. |
| Responsive/accessibility | Partially implemented | Responsive UI exists; required viewport, keyboard, focus, and screen-reader pass has not been run. |
| Desktop shared contracts/deep links/sidecars/updater | Partially implemented | Native code and tests exist; this web session did not perform a release-candidate desktop verification. |
| Authenticated production-like fixture | Partially provisioned / signer blocked | `+32` owner, `+33` contributor, and `+20` restricted identities are recorded in `LenGrowth/docs/lenos-web-authenticated-fixture.json`. Company `6a75d8700418e3844768d91e` and workspace `lenos-e2e32` are live; relay membership, Team Hub ID, and managed-agent fixture remain open. Backend `c669e4f` and frontend `2e077ae` are deployed successfully; relay NIP-42 membership checks still need a durable signer. |

This matrix is evidence-based from the current source tree. “Implemented locally” does not mean live production verification.

### Session delta

- Added an explicit `getCompanyInvites` frontend contract for invite history while keeping `getPendingInvites` server-filtered to `status=pending`.
- Updated `PendingInvitesList` to use the status-capable contract, so its all/accepted/expired/revoked filters no longer query a permanently pending-only response.
- Invalidated invite-history queries after invite, resend, and cancel mutations.
- Added focused membership contract tests and a disposable authenticated-fixture manifest without credentials or private keys.
- Authenticated the supplied test account and provisioned a disposable LenGrowth company with an active owner membership.
- After the plan upgrade, provisioned `+32` as owner and `+33` as contributor; `+20` receives `403` on the fixture company. Backend identity-link tests pass, and deployed live link/repeat/revoke checks returned `200`.
- Scalingo GitHub integrations now point to `Lengrowth/backend` and `Lengrowth/frontend`, both on `master`; backend `c669e4f` and frontend `2e077ae` deployments succeeded.
- Live company access passed for `+33`; restricted `+20` receives `404` for the company resource. Owner-only member listing correctly returns `403` for the contributor role.
- Hardened the browser relay client’s NIP-42 state machine so only the matching AUTH event acknowledgement enables subscriptions; unrelated `OK` frames (including publish acknowledgements) cannot be mistaken for successful authentication. Web typecheck, production build, and full Biome/check suite passed after this change.
- Changed core browser writes from fire-and-forget relay publishes to acknowledgement-aware `publishAndWait()`, covering channel CRUD, messages, threads, workflows, invites, workspace settings, moderation, reactions, profile/status, and DM channel creation. Local verification passed; live authorization and relay persistence remain unverified until durable identities are provisioned.
- Updated stale public smoke assertions to the current LenGrowth branding contract; the browser smoke suite now passes 6/6. This validates shell/invite/download behavior only, not authenticated relay collaboration.
- Began replacing the extension-only browser identity path with a managed LenGrowth signer: Supabase-authenticated provisioning creates an encrypted server-side Nostr identity, returns only its public key plus a 15-minute signer session, and LenOS stores only that opaque session in `sessionStorage`. Backend managed-identity tests pass 3/3; this path is not production-live until `MANAGED_NOSTR_MASTER_KEY` is provisioned and the backend/frontend commits are deployed.

## 10. Existing references

- `LenOS/docs/web-workspace-ui-plan.md` — web implementation history and architecture.
- `LenOS/docs/lengrowth-integration-runbook.md` — live integration checks.
- `LenOS/WORKSPACE_ARCHITECTURE.md` and `LenOS/ARCHITECTURE.md` — system architecture.
- `LenGrowth/LENOS_GO_LIVE_PLAN.md` — rollout phases and current launch checklist.
- `LenGrowth/LENOS_WORKSPACE_PLAN.md` — LenGrowth/LenOS product contract.
- `LenGrowth/docs/frontend-backend-contract-audit-membership-roles.md` — known membership/invite contract risks.
