++ b/docs/superpowers/specs/2026-08-14-phase3-design.md
# Phase 3 Design — LenOS

**Date:** 2026-08-14  
**Status:** Approved

---

## Overview

Six features for Phase 3. Stack: React+TypeScript web (`web/src/`), Tauri desktop (`desktop/src/`), Rust relay (`crates/lenos-relay/`). Every feature ships web + desktop unless noted.

### Codebase-vs-spec corrections (locked in)

| Spec says | Reality | Decision |
|---|---|---|
| Typing: kind:24133 | Already kind:20002, working | Extend kind:20002 |
| Presence: kind:24134 | Already kind:20010/20001, PresenceDot exists | Extend existing |
| Status: kind:30078 d:"user-status" | Already kind:30315 d:"general" | Follow kind:30315 |
| Channel templates desktop | Already fully implemented | Web-only gap |

---

## Feature 1: Thread Summaries (AI)

### Schema / Protocol

- **Endpoint:** `POST /api/thread-summary`
- **Auth:** NIP-98 (`Authorization: Nostr <base64-kind-27235>`)
- **Request body:** `{ messages: [{ pubkey: string, content: string, created_at: number }] }`
- **Response:** `{ summary: string }`
- **Relay behavior:** Validate NIP-98 → forward body to `{LENGROWTH_API_URL}/api/ai/summarize` via reqwest → return response

### Relay changes

- `crates/lenos-relay/src/api/thread_summary.rs` — new handler, mirrors `documents.rs` structure
- `crates/lenos-relay/src/router.rs` — add `POST /api/thread-summary` at line ~147 (before `/hooks/{id}`)
- Relay env: add `LENGROWTH_API_URL` (currently only in `lenos-agent`, not relay)

### Web (`web/src/features/messages/`)

- `useThreadSummary.ts` — calls `relayHttpBaseUrl() + "/api/thread-summary"` with `makeNip98AuthHeader(url, "POST", {body})`, returns `{summary, loading, error}`
- `ThreadPanel.tsx` — add summarize icon button in header (line ~105); below header render `<SummaryCard>` (collapsible) when summary exists
- `ui/SummaryCard.tsx` — shared collapsible card component

### Desktop (`desktop/src/features/messages/`)

- `useThreadSummary.ts` — Tauri HTTP client + `nip98PostHeader(url, body)`
- `MessageThreadPanel.tsx` — add button in `AuxiliaryPanelHeaderGroup` (line ~919); same `<SummaryCard>`

### New files
`thread_summary.rs`, `useThreadSummary.ts` ×2, `SummaryCard.tsx` ×2

---

## Feature 2: Message Pinning

### Schema

- **Kind:** 30078 (NIP-78)
- **d-tag:** `"pins:{channelId}"`
- **Content:** `{ pins: [{ eventId: string, pinnedBy: string, pinnedAt: number }] }`
- **Write:** admin-only (replace full array on each pin/unpin)
- **Read:** all members

### Hooks

- `usePinnedMessages(channelId)` — queries kind:30078 `{'#d': ['pins:'+channelId]}`; subscribes for live updates; returns `PinnedMessage[]`
- `usePinMessage()` / `useUnpinMessage()` — load current pins array, splice, publish new 30078 event; admin-gated via `useMembers` role check

### UI — Web

- `MessageContextMenu.tsx` — add "Pin message" / "Unpin" menu items; visible only when `currentUserRole === 'admin'`
- `PinnedMessagesBar.tsx` — new component: shows pin count badge; expand/collapse list overlay; each pin renders message preview text + "Jump to message" button + admin-only unpin button
- `ChannelView.tsx:172` — mount `<PinnedMessagesBar>` above `<MessageTimeline>`

### UI — Desktop

- Desktop MessageRow uses `MessageActionBar` (not a context menu) — add pin action
- Same `PinnedMessagesBar.tsx` mounted in desktop's ChannelView equivalent
- "Jump to message" via `useAnchoredScroll` anchor by message ID

### New files
`usePinnedMessages.ts` ×2, `usePinMessage.ts` ×2, `PinnedMessagesBar.tsx` ×2

---

## Feature 3: Read Receipts

### Schema

- **Kind:** 30078 (NIP-78)
- **d-tag:** `"read:{channelId}"` — distinct from existing `"read-state:{slotId}"` (no conflict)
- **Content:** `{ last_read_event_id: string, last_read_at: number }`
- **Write:** self (each user publishes own receipt)
- **Read:** all members subscribe all-authors

### Publish trigger

- Web: extend `bottomRef` useEffect in `ChannelView.tsx` — debounce 2 000 ms; guard: `last_read_at > existingPublishedValue + 10_000`
- Desktop: hook into `useAnchoredScroll.isAtBottom` (threshold already 32 px in `useAnchoredScroll.ts:19`) — same debounce/guard

### Hook

`useReadReceipts(channelId)`:
1. Get `memberPubkeys` from `useMembers(channelId)`
2. Subscribe kind:30078 `{'#d': ['read:'+channelId], authors: memberPubkeys}`
3. Returns `Map<pubkey, { last_read_event_id: string, last_read_at: number }>`

### MessageRow avatar stack

- Rendered at right edge of each `MessageRow`
- Logic: show avatars of members whose `last_read_event_id === event.id` (exact) OR `last_read_at >= event.created_at` (fallback approximate)
- Render at most 3 avatars; `+N` overflow badge if more
- `ReadAvatarStack.tsx` — shared component used by both web and desktop MessageRow

### New files
`useReadReceipts.ts` ×2, `ReadAvatarStack.tsx` ×2

---

## Feature 4: Channel Templates

### Desktop — already complete

All infrastructure exists:
- `desktop/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx`
- `desktop/src/shared/api/types.ts:851` — `ChannelTemplate` type
- `desktop/src/features/sidebar/lib/useCreateChannelForm.ts:85` — `useChannelTemplatesQuery()`
- `desktop/src/features/sidebar/ui/CreateChannelFormFields.tsx:119` — template dropdown

### Web — 3 touchpoints

1. `web/src/features/settings/ui/SettingsModal.tsx:80` — add `{ id: 'channel-templates', label: 'Channel Templates', icon: LayoutTemplate }` to `SECTIONS` array
2. `web/src/features/settings/ui/ChannelTemplatesSettingsCard.tsx` — new component; mirrors desktop card; same kind:30078 `d:"channel-templates"` pub/query pattern; template shape: `{ id, name, description, defaultTopic, isPrivate }`
3. `web/src/features/channels/ui/CreateChannelModal.tsx` — add template `<Select>` dropdown using `useChannelTemplatesQuery()`; on select, populate name/description/isPrivate fields

### New files
`ChannelTemplatesSettingsCard.tsx` (web only); extend `SettingsModal.tsx`, `CreateChannelModal.tsx`

---

## Feature 5: Slash Commands

### Registry interface

```typescript
// shared/lib/slashCommandRegistry.ts (imported by both web + desktop)
interface CommandContext {
  channelId: string
  publishEvent(params: { kind: number; content: string; tags: string[][] }): Promise<void>
}

interface SlashCommand {
  name: string        // "giphy"
  description: string // "Search GIFs"
  usage: string       // "/giphy <query>"
  execute(args: string, context: CommandContext): Promise<void>
}

export const SLASH_COMMANDS: SlashCommand[] = [/* giphy, poll, remind */]
```

### Detection hook

`useSlashCommands(editorText, cursorPos)`:
- Mirrors `useMentions.ts` pattern; uses existing `detectPrefixQuery()` at `desktop/src/shared/lib/detectPrefixQuery.ts:16`
- Triggers on `/` at start of line or after whitespace
- Returns `{ active: boolean, query: string, filtered: SlashCommand[] }` (fuzzy match on query)
- 120 ms debounce (consistent with other autocomplete hooks)

### Palette UI

`SlashCommandPalette.tsx`:
- Popover anchored above composer input, same pattern as `MentionAutocomplete.tsx` / `EmojiAutocomplete.tsx`
- Keyboard: ↑↓ navigate, Enter select, Esc dismiss
- Each row: command name + usage + description

### Built-in commands

**`/giphy <query>`**
- `execute`: GET `relayHttpBaseUrl()/api/giphy?q=<query>` with NIP-98 auth; if no results, show "No GIFs found" in palette and abort; otherwise show top-10 grid in palette for user to pick; on select, insert GIF URL as message content
- Relay: `GET /api/giphy?q=` — new route + `crates/lenos-relay/src/api/giphy.rs`; NIP-98 auth; reads `GIPHY_API_KEY` env; proxies to Giphy API `https://api.giphy.com/v1/gifs/search?api_key=…&q=…&limit=10`; returns `{ gifs: [{ url, preview_url, title }] }`

**`/poll <question> | <opt1> | <opt2>`**
- Parse: split on ` | `; first segment = question, rest = options (2–4)
- Publishes TWO events:
  1. kind:40002 channel message, content: `JSON.stringify({ type: "poll", pollId: uuid })` — appears in timeline
  2. kind:30078 d:`"poll-{uuid}"`, content: `{ question, options: string[], createdAt }` — poll data store
- Timeline detects `type === "poll"` in parsed message content; renders `PollMessage` instead of regular row
- `PollMessage.tsx` — receives `pollId`; loads poll data from kind:30078 via `usePollData(pollId)`; displays question + option buttons with vote counts
- Vote: publish kind:7 reaction with `['#e', pollEventId]` tag, content = option index as string
- `usePollVotes(pollEventId)` — subscribes kind:7 reactions on that event, groups by content, returns `Map<optionIndex, Set<pubkey>>`

**`/remind <time> <message>`**
- Reuses `handleSchedule()` pattern from `MessageComposer.tsx:125`
- Time format: relative (`10m`, `2h`, `1d`) or absolute ISO-8601 (`2026-08-15T09:00`)
- Publishes kind:30078 d:`"scheduled-{uuid}"` with `["not_before", unixTimestamp]` tag (existing infrastructure)

### Relay changes

- `crates/lenos-relay/src/api/giphy.rs` — new
- `crates/lenos-relay/src/router.rs` — add `GET /api/giphy`
- Relay env: add `GIPHY_API_KEY`

### New files
`slashCommandRegistry.ts` (shared), `useSlashCommands.ts` ×2, `SlashCommandPalette.tsx` ×2, `PollMessage.tsx` ×2, `usePollVotes.ts` ×2, `giphy.rs`

---

## Feature 6: Presence & Typing Improvements

### What already exists (do not re-implement)

| Already done | Location |
|---|---|
| Typing: kind:20002, 8s TTL, thread-scoped | `useChannelTyping.ts`, `useTypingBroadcast.ts` |
| Presence: kind:20010/20001, 30s heartbeat, 90s TTL | `usePresence.ts`, `usePresenceHeartbeat.ts` |
| Status: kind:30315 d:"general", read | `useUserStatus.ts` |
| PresenceDot UI (desktop) | `desktop/src/features/presence/ui/PresenceBadge.tsx` |
| Online dot in MemberCard (web) | `web/src/features/channels/ui/MemberCard.tsx:42` |
| Activity tracking: pointer/key/focus events | `desktop/src/features/presence/hooks.ts:265` |

### Gap 1: Avatar + name in typing indicator

- **Web** `TypingIndicator.tsx:13` — currently renders from `pubkeys[]`; extend to resolve display name via `useProfile(pubkey)` and render `<Avatar size="xs">` per typer (max 3); text: "Alice, Bob are typing…"
- **Desktop** `TypingIndicatorRow.tsx:54` — same pattern; avatars alongside existing text

### Gap 2: Web PresenceDot parity

- Web `MemberCard.tsx:42` uses boolean `online` prop; replace with `PresenceDot`-style component mirroring desktop `PresenceBadge.tsx`
- New `web/src/features/presence/ui/PresenceBadge.tsx` — 1:1 port of desktop version (green/amber/gray dot + label)
- `MemberCard.tsx` — use `usePresence()` (already exists, 90s TTL) instead of boolean prop

### Gap 3: Status setting UI

- `web/src/features/profile/useUserStatus.ts` — add `setUserStatus(status: string, statusText?: string)` that publishes kind:30315 d:"general", content: `"${emoji} ${statusText}"`
- `web/src/features/profiles/ui/ProfilePopover.tsx` — add status row with 4 preset buttons (🟢 Online / 🌙 Away / ⛔ DND / ⭕ Offline) + optional free-text field; calls `setUserStatus()`
- Desktop: verify `resolveAutomaticPresenceStatus` + check if manual override UI exists; add if missing

### Modified files
`TypingIndicator.tsx` (web), `TypingIndicatorRow.tsx` (desktop), `MemberCard.tsx` (web), `useUserStatus.ts` (web — add setter), `ProfilePopover.tsx` (web)

### New files
`PresenceBadge.tsx` (web)

---

## File count summary

| Feature | New files | Modified files | Relay |
|---|---|---|---|
| 1. Thread Summaries | 5 | 2 | `thread_summary.rs` + route + `LENGROWTH_API_URL` env |
| 2. Message Pinning | 6 | 3 | — |
| 3. Read Receipts | 4 | 4 | — |
| 4. Channel Templates | 1 | 2 | — |
| 5. Slash Commands | 10 | 2 | `giphy.rs` + route + `GIPHY_API_KEY` env |
| 6. Presence & Typing | 1 | 5 | — |
| **Total** | **27** | **18** | **2 new handlers** |

---

## Kind registry additions

All constants added to both `web/src/shared/constants/kinds.ts` and `desktop/src/shared/constants/kinds.ts`:

```typescript
// Already defined — no change needed:
// KIND_READ_STATE = 30078   d:"read-state:{slotId}"
// KIND_SCHEDULED_MESSAGE = 30078   d:"scheduled-{uuid}"

// New d-tag usage of 30078 (no new constant needed, same kind):
// pins:{channelId}       — Message Pinning
// read:{channelId}       — Read Receipts
// channel-templates      — already referenced
// poll-{uuid}            — Slash /poll

// No new kind numbers introduced
```

No new numeric kind constants. All new features reuse kind:30078 with distinct d-tags.

---

## Migration

No new DB migrations needed. All state is Nostr events (kind:30078). Relay endpoints are stateless proxy/auth handlers.
