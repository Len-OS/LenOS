# LenOS Web ↔ Desktop Parity Tracker

**Last updated:** 2026-08-11  
**Branch:** feat/web-onboarding-p0  
**Status legend:** ✅ Done · ⚠️ Partial · 🔲 Not built · 🚫 Desktop-only (expected gap)

---

## Summary

| Phase | Area | Status |
|---|---|---|
| P0 | Onboarding + local signer | ✅ Complete |
| P1 | Navigation / sidebar + profile | ⚠️ Partial |
| P2 | Agents + channels/messaging | ⚠️ Partial |
| P3 | Inbox/home + settings | ⚠️ Partial |
| P4 | Workflows + auth/identity | ⚠️ Partial |
| P5 | Desktop-only infra (known gaps) | 🚫 Not planned |

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
| App sidebar shell | `AppSidebar.tsx` | — | 🔲 |
| Channel list in sidebar | `ChannelList.tsx` | exists (wired) | ✅ |
| Community rail | `CommunityRail.tsx` | `communities/ui/CommunityRail.tsx` | ✅ wired into WorkspaceShell |
| Channel context menu (rename/delete/settings) | `ChannelContextMenu.tsx` | — | 🔲 |
| Drag-and-drop channel reordering | native DnD | — | 🔲 |
| Sidebar profile card with status | `SidebarProfileCard.tsx` | — | 🔲 |
| Workspace switcher | `WorkspaceSwitcher.tsx` | — | 🔲 |

### Profile / Identity

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Profile popover | `ProfilePopover.tsx` | `profiles/ui/ProfilePopover.tsx` | ✅ (needs wiring) |
| Full user profile panel | `UserProfilePanel.tsx` | `profiles/ui/UserProfilePanel.tsx` | ✅ (needs wiring) |
| Avatar editor | `AvatarEditor.tsx` | — | 🔲 |
| Nostr bind consent dialog | `NostrBindDialog.tsx` | — | 🔲 |
| Profile snapshot export | `ProfileExport.tsx` | — | 🔲 |
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
| Agent session transcript viewer | `AgentTranscriptViewer.tsx` | — | 🔲 |
| Agent memory section | `AgentMemorySection.tsx` | — | 🔲 |
| Agent list page | `AgentsPage.tsx` | `agents/ui/AgentsPage.tsx` | ✅ updated |

### Channels / Messaging

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Channel permissions settings | `ChannelPermissions.tsx` | — | 🔲 |
| Bot activity bar / quick bot bar | `BotActivityBar.tsx` | — | 🔲 |
| Forum thread panel | `ForumThreadPanel.tsx` | — | 🔲 |
| Image editor in composer | `ImageEditor.tsx` | — | 🔲 |
| Emoji picker in composer | `EmojiPicker.tsx` | emoji-mart wired | ✅ |
| Drafts panel | `DraftsPanel.tsx` | — | 🔲 |
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
| Inbox filter menu | `InboxFilterMenu.tsx` | — | 🔲 |
| Feed section | `FeedSection.tsx` | — | 🔲 |
| Recent notes section | `RecentNotesSection.tsx` | — | 🔲 |
| Home page | `HomePage.tsx` | `home/ui/HomePage.tsx` | ✅ updated |

### Settings

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Settings modal shell | `SettingsModal.tsx` | `settings/ui/SettingsModal.tsx` | ✅ updated |
| Agent defaults panel | `AgentDefaultsSettings.tsx` | `settings/ui/AgentDefaultsSettingsPanel.tsx` | ✅ |
| Private key backup row | `BackupSettings.tsx` | `settings/ui/BackupSettingsPanel.tsx` | ✅ |
| Keyboard shortcuts card | `KeyboardShortcuts.tsx` | `settings/ui/KeyboardShortcutsPanel.tsx` | ✅ |
| Harness settings | `HarnessSettings.tsx` | — | 🔲 |
| Voice settings | `VoiceSettings.tsx` | — | 🚫 desktop-only (no web audio runtime) |
| Mobile pairing card | `MobilePairing.tsx` | — | 🔲 |
| Moderation queue | `ModerationQueue.tsx` | — | 🔲 |

**P3 targets to build:**
1. Inbox filter menu
2. Feed section
3. Recent notes section
4. Harness settings panel
5. Mobile pairing card
6. Moderation queue panel

---

## Phase 4 — Workflows + Auth/Identity Polish ⚠️

### Workflows

| Feature | Desktop file | Web file | Status |
|---|---|---|---|
| Workflow card | `WorkflowCard.tsx` | `workflows/ui/WorkflowCard.tsx` | ✅ updated |
| Workflow list page | `WorkflowsPage.tsx` | `workflows/ui/WorkflowsPage.tsx` | ✅ updated |
| Workflow detail panel | `WorkflowDetailPanel.tsx` | `workflows/ui/WorkflowDetailPanel.tsx` | ✅ |
| Workflow form builder | `WorkflowFormBuilder.tsx` | — | 🔲 |
| Approval card | `WorkflowApprovalCard.tsx` | — | 🔲 |
| Run trace viewer | `WorkflowRunTrace.tsx` | — | 🔲 |
| Webhook secret dialog | `WebhookSecretDialog.tsx` | — | 🔲 |

### Auth / Identity Polish

| Feature | Desktop | Web | Status |
|---|---|---|---|
| Nostr bind consent dialog | `NostrBindDialog.tsx` | — | 🔲 |
| Profile snapshot export | `ProfileExport.tsx` | — | 🔲 |
| LenGrowth managed signer session | backend provisioned | `nostr-signer.ts` (managed tier) | ✅ |

**P4 targets to build:**
1. Workflow form builder
2. Approval card
3. Run trace viewer
4. Webhook secret dialog
5. Nostr bind consent dialog
6. Profile snapshot export

---

## Phase 5 — Desktop-only Infrastructure 🚫

Expected gaps. No web equivalent planned unless product strategy changes.

| Feature | Reason not on web |
|---|---|
| Huddle / voice chat | Requires WebRTC peer mesh or relay — separate project |
| Presence badges (online/active) | Requires persistent relay subscription + heartbeat service |
| Mesh compute settings | Tauri sidecar + local process management |
| Local archive settings | Local filesystem access via Tauri |
| `lenos://` deep links | Native OS URL scheme handler |
| Tauri updater | Binary distribution; web uses Cloudflare Pages deploy |
| Local agent runtime (ACP/sidecar) | Native process spawn; browser cannot run sidecars |

---

## Definition of done per phase

A phase is complete when:
- All `🔲` items are built and `pnpm --filter lenos-web typecheck` passes
- Each new component is wired into its parent route/shell (not just an orphan file)
- Navigation paths work end-to-end in the browser

---

## Next action

Start **P1**: `AppSidebar.tsx` + channel context menu + sidebar profile card + wire profile popover/panel.
