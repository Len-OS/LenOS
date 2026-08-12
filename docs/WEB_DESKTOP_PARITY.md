# LenOS Web ↔ Desktop Parity Tracker

**Last updated:** 2026-08-11 (P5 complete — huddle, presence, deep links all done)  
**Branch:** feat/web-onboarding-p0  
**Status legend:** ✅ Done · ⚠️ Partial · 🔲 Not built · 🚫 Desktop-only (expected gap)

---

## Summary

| Phase | Area | Status |
|---|---|---|
| P0 | Onboarding + local signer | ✅ Complete |
| P1 | Navigation / sidebar + profile | ✅ Complete |
| P2 | Agents + channels/messaging | ✅ Complete |
| P3 | Inbox/home + settings | ✅ Complete |
| P4 | Workflows + auth/identity | ✅ Complete |
| P5 | Desktop-only infra (known gaps) | ✅ Complete |

---

## Phase 0 — Onboarding + Local Signer ✅

All items complete as of 2026-08-10.

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Local nsec signer tier | `nostr-signer` (Tauri) | `shared/lib/nostr-signer.ts` | ✅ |
| Animated avatar capture | `AnimatedAvatarCapture.tsx` | `profile/ui/WebAnimatedAvatarCapture.tsx` | ✅ |
| Nostr key import form | `KeyImportStep.tsx` | `onboarding/ui/KeyImportStep.tsx` | ✅ |
| NIP-49 backup / download | `EncryptedBackupCreator`, `DownloadKeyStep` | `onboarding/ui/WebBackupStep.tsx` | ✅ |
| Invite redeem screen | `InviteRedeemForm.tsx` | `onboarding/ui/WebInviteRedeemStep.tsx` | ✅ |
| Keyring-locked + recovery | `KeyringLockedScreen.tsx` | `onboarding/ui/KeyringLockedScreen.tsx` (replaced) | ✅ |
| 3-card identity choice | `IdentityStep.tsx` | `onboarding/ui/IdentityStep.tsx` (replaced) | ✅ |
| Multi-step onboarding wizard | `OnboardingFlow.tsx` | `onboarding/ui/WebOnboardingFlow.tsx` | ✅ |
| Real onboarding gate | `OnboardingGate.tsx` | `onboarding/ui/OnboardingGate.tsx` (replaced) | ✅ |
| Pending invite URL stash | native deep link handler | `onboarding/lib/pendingInvite.ts` | ✅ |

---

## Phase 1 — Navigation / Sidebar + Profile ⚠️

### Navigation / Sidebar

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| App sidebar shell | `AppSidebar.tsx` | `channels/ui/ChannelsSidebar.tsx` (is the shell) | ✅ |
| Channel list in sidebar | `ChannelList.tsx` | exists (wired) | ✅ |
| Community rail | `CommunityRail.tsx` | `communities/ui/CommunityRail.tsx` | ✅ wired into WorkspaceShell |
| Channel context menu (rename/delete/settings) | `ChannelContextMenu.tsx` | `channels/ui/ChannelContextMenu.tsx` | ✅ |
| Drag-and-drop channel reordering | native DnD | — | 🚫 Desktop-only (HTML DnD not planned) |
| Sidebar profile card with status | `SidebarProfileCard.tsx` | `profile/ui/SidebarProfileCard.tsx` | ✅ |
| Workspace switcher | `WorkspaceSwitcher.tsx` | `communities/ui/WorkspaceSwitcher.tsx` | ✅ |

### Profile / Identity

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Profile popover | `ProfilePopover.tsx` | `profiles/ui/ProfilePopover.tsx` | ✅ wired in MemberCard |
| Full user profile panel | `UserProfilePanel.tsx` | `profiles/ui/UserProfilePanel.tsx` | ✅ wired in _workspace.tsx |
| Avatar editor | `AvatarEditor.tsx` | `profiles/ui/AvatarEditor.tsx` | ✅ wired in UserProfilePanel |
| Nostr bind consent dialog | `NostrBindDialog.tsx` | `profiles/ui/NostrBindDialog.tsx` | ✅ |
| Profile snapshot export | `ProfileExport.tsx` | `profiles/ui/ProfileExport.tsx` | ✅ |
| Profile panel context/provider | — | `profiles/profile-panel-context.tsx` | ✅ |

**P1 targets to build:**
1. `AppSidebar.tsx` — container with channel list, sidebar profile card, workspace switcher
2. Channel context menu (DropdownMenu on right-click / gear icon)
3. Sidebar profile card with status picker (reuse `StatusPicker.tsx`)
4. Wire `ProfilePopover` + `UserProfilePanel` into click targets
5. Avatar editor (crop + upload)

---

## Phase 2 — Agents + Channels/Messaging ⚠️

### Agents

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Agent card viewer | `AgentCard.tsx` | `agents/ui/AgentCard.tsx` | ✅ updated |
| Agent config/definition dialog | `AgentConfigDialog.tsx` | `agents/ui/AgentConfigDialog.tsx` | ✅ |
| Activity render rows (thought/tool/message/plan/command) | `AgentActivityRow.tsx` | `agents/ui/AgentActivityRow.tsx` | ✅ |
| Agent session transcript viewer | `AgentTranscriptViewer.tsx` | `agents/ui/AgentTranscriptViewer.tsx` | ✅ |
| Agent memory section | `AgentMemorySection.tsx` | `agents/ui/AgentMemorySection.tsx` | ✅ |
| Agent list page | `AgentsPage.tsx` | `agents/ui/AgentsPage.tsx` | ✅ updated |

### Channels / Messaging

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Channel permissions settings | `ChannelPermissions.tsx` | `channels/ui/ChannelPermissions.tsx` | ✅ |
| Bot activity bar / quick bot bar | `BotActivityBar.tsx` | `channels/ui/BotActivityBar.tsx` | ✅ |
| Forum thread panel | `ForumThreadPanel.tsx` | `forum/ui/ForumThreadPanel.tsx` | ✅ |
| Image editor in composer | `ImageEditor.tsx` | — | 🔲 |
| Emoji picker in composer | `EmojiPicker.tsx` | emoji-mart wired | ✅ |
| Drafts panel | `DraftsPanel.tsx` | `messages/ui/DraftsPanel.tsx` | ✅ |
| Diff message viewer | `DiffMessageViewer.tsx` | — | 🔲 |
| Member card | `MemberCard.tsx` | `channels/ui/MemberCard.tsx` | ✅ updated |

**P2 targets to build:**
1. Agent session transcript viewer
2. Agent memory section
3. Channel permissions settings modal
4. Forum thread panel
5. Drafts panel
6. Bot/quick-bot bar

---

## Phase 3 — Inbox / Home + Settings ⚠️

### Inbox / Home

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Inbox item rows | `InboxItemRow.tsx` | `home/ui/InboxItemRow.tsx` | ✅ updated |
| Inbox detail pane | `InboxDetailPane.tsx` | `home/ui/InboxDetailPane.tsx` | ✅ |
| Inbox filter menu | `InboxFilterMenu.tsx` | `home/ui/InboxFilterMenu.tsx` | ✅ |
| Feed section | `FeedSection.tsx` | `home/ui/FeedSection.tsx` | ✅ |
| Recent notes section | `RecentNotesSection.tsx` | `home/ui/RecentNotesSection.tsx` | ✅ |
| Home page | `HomePage.tsx` | `home/ui/HomePage.tsx` | ✅ updated |

### Settings

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Settings modal shell | `SettingsModal.tsx` | `settings/ui/SettingsModal.tsx` | ✅ updated |
| Agent defaults panel | `AgentDefaultsSettings.tsx` | `settings/ui/AgentDefaultsSettingsPanel.tsx` | ✅ |
| Private key backup row | `BackupSettings.tsx` | `settings/ui/BackupSettingsPanel.tsx` | ✅ |
| Keyboard shortcuts card | `KeyboardShortcuts.tsx` | `settings/ui/KeyboardShortcutsPanel.tsx` | ✅ |
| Harness settings | `HarnessSettings.tsx` | `settings/ui/HarnessSettingsPanel.tsx` | ✅ |
| Voice settings | `VoiceSettings.tsx` | — | 🚫 desktop-only (no web audio runtime) |
| Mobile pairing card | `MobilePairing.tsx` | `settings/ui/MobilePairingPanel.tsx` | ✅ |
| Moderation queue | `ModerationQueue.tsx` | `settings/ui/ModerationQueuePanel.tsx` | ✅ |

**P3 targets — all complete.**

---

## Phase 4 — Workflows + Auth/Identity Polish ⚠️

### Workflows

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Workflow card | `WorkflowCard.tsx` | `workflows/ui/WorkflowCard.tsx` | ✅ updated |
| Workflow list page | `WorkflowsPage.tsx` | `workflows/ui/WorkflowsPage.tsx` | ✅ updated |
| Workflow detail panel | `WorkflowDetailPanel.tsx` | `workflows/ui/WorkflowDetailPanel.tsx` | ✅ |
| Workflow form builder | `WorkflowFormBuilder.tsx` | `workflows/ui/WorkflowFormBuilder.tsx` | ✅ |
| Approval card | `WorkflowApprovalCard.tsx` | `workflows/ui/WorkflowApprovalCard.tsx` | ✅ |
| Run trace viewer | `WorkflowRunTrace.tsx` | `workflows/ui/WorkflowRunTrace.tsx` | ✅ |
| Webhook secret dialog | `WebhookSecretDialog.tsx` | `workflows/ui/WebhookSecretDialog.tsx` | ✅ |

### Auth / Identity Polish

| Feature | Desktop | Web | Status |
|---|---|---|---|
| Nostr bind consent dialog | `NostrBindDialog.tsx` | `profiles/ui/NostrBindDialog.tsx` | ✅ |
| Profile snapshot export | `ProfileExport.tsx` | `profiles/ui/ProfileExport.tsx` | ✅ |
| LenGrowth managed signer session | backend provisioned | `nostr-signer.ts` (managed tier) | ✅ |

**P4 targets — all complete.**

---

## Phase 5 — Desktop-only Infrastructure ✅

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Presence badges (online/active) | native relay heartbeat | `presence/usePresenceHeartbeat.ts` + `presence/usePresence.ts` | ✅ |
| `lenos://` deep links | OS URL scheme handler | `deep-links/deepLinkParser.ts` + `deep-links/useDeepLinkHandler.ts` + `/lenos/*` route | ✅ |
| Huddle / voice chat | `huddle/` (Tauri + Rust relay WS) | `huddle/` (WebCodecs + opusscript relay WS) | ✅ |
| Mesh compute settings | Tauri sidecar | — | 🚫 Desktop-only |
| Local archive settings | Tauri filesystem | — | 🚫 Desktop-only |
| Tauri updater | Binary distribution | — | 🚫 Desktop-only |
| Local agent runtime (ACP/sidecar) | native process spawn | — | 🚫 Browser limitation |

### Presence implementation notes

- Ephemeral kind 20010 heartbeat every 30 s while workspace is active
- Online TTL: 90 s (3 missed beats → offline)
- Scoped per workspace (`#d` tag = communityId)
- `MembersSidebar` shows online count + sorts online members first

### Deep link implementation notes

- URL-based: `/lenos/channel/<id>`, `/lenos/dm/<id>`, `/lenos/user/<pubkey>`, `/lenos/home`, etc.
- Protocol handler: `web+lenos://` scheme registered via `navigator.registerProtocolHandler` → `/?_lenos=<encoded-uri>`
- Handled in `WorkspaceLayoutInner` on mount; profile links open the right-panel ProfilePanel
- Scheme map: `channel` → `/channels/$id`, `dm` → `/messages/$id`, `user` → profile panel, `invite` → `/invite/$code`

---

## Definition of done per phase

A phase is complete when:
- All `🔲` items are built and `pnpm --filter lenos-web typecheck` passes
- Each new component is wired into its parent route/shell (not just an orphan file)
- Navigation paths work end-to-end in the browser

---

## Next action

P0–P5 complete. Remaining desktop-only gaps (mesh compute, local archive, Tauri updater, ACP sidecar, voice settings) are intentional — no web equivalent planned. See `docs/HUDDLE.md` for the full huddle roadmap (screen share, video, notes, mobile).
