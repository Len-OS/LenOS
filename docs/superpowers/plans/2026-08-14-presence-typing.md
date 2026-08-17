# Presence & Typing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing typing indicator to show avatars and names (not just text); bring web presence dot to parity with desktop's `PresenceBadge`; add a status-setter to web `ProfilePopover`.

**Architecture:** The core presence infrastructure (kind:20002 typing, kind:20010/20001 presence, kind:30315 status, `PresenceDot`/`PresenceBadge` desktop components, 90s TTL) already exists. This plan fills three gaps: (1) typing indicator avatar display on both platforms, (2) web `PresenceBadge` component mirroring desktop, (3) status-setter in web `ProfilePopover` using kind:30315.

**Tech Stack:** TypeScript/React, existing kind:20002/20010/30315 infrastructure

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 6

## Global Constraints

- Web + desktop parity for avatar display in typing indicator and for PresenceDot.
- Do NOT change typing kind (stays 20002) or presence kind (stays 20010/20001).
- Do NOT change status kind (stays 30315, d:"general").
- Typing indicator: show max 3 avatars + "X, Y are typing…" text.
- Web PresenceDot: green (online <90s), amber (away), gray (offline).
- `usePresence()` at `web/src/features/presence/usePresence.ts:50` already exists with 90s TTL.
- `useUserStatus` at `web/src/features/profile/useUserStatus.ts:25` reads kind:30315.

---

### Task 1: Web — extend `TypingIndicator` to show avatars + names

**Files:**
- Modify: `web/src/features/messages/ui/TypingIndicator.tsx`

**Interfaces:**
- Consumes: `useProfile(pubkey)` from `@/features/profiles/use-profile`; `Avatar` from `@/shared/ui/Avatar`

- [ ] **Step 1: Read current `TypingIndicator.tsx`**

The component at `web/src/features/messages/ui/TypingIndicator.tsx:13` receives `pubkeys: string[]`. Find the exact display text and component structure.

- [ ] **Step 2: Add profile resolution and avatar rendering**

Replace the current implementation with one that resolves profiles:

```tsx
// web/src/features/messages/ui/TypingIndicator.tsx
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";

const MAX_AVATARS = 3;

function TyperName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{profile?.name || truncatePubkey(pubkey)}</>;
}

function TyperAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return <Avatar src={profile?.picture} name={name} size={20} />;
}

function typingText(pubkeys: string[], profiles: Array<{ name?: string } | null>): string {
  const names = pubkeys
    .slice(0, MAX_AVATARS)
    .map((pk, i) => profiles[i]?.name || truncatePubkey(pk));

  if (pubkeys.length === 1) return `${names[0]} is typing…`;
  if (pubkeys.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  if (pubkeys.length <= MAX_AVATARS) return `${names.join(", ")} are typing…`;
  return `${names.slice(0, MAX_AVATARS - 1).join(", ")} and ${pubkeys.length - MAX_AVATARS + 1} others are typing…`;
}

interface Props {
  pubkeys: string[];
}

export function TypingIndicator({ pubkeys }: Props) {
  // Resolve profiles for display text (using hooks — render one per pubkey)
  const p0 = useProfile(pubkeys[0] ?? "");
  const p1 = useProfile(pubkeys[1] ?? "");
  const p2 = useProfile(pubkeys[2] ?? "");
  const profiles = [p0, p1, p2];

  if (pubkeys.length === 0) return null;

  const visible = pubkeys.slice(0, MAX_AVATARS);

  return (
    <div className="flex h-6 items-center gap-1.5 px-4 py-1">
      <div className="flex items-center">
        {visible.map((pk) => (
          <div key={pk} className="-ml-1 first:ml-0">
            <TyperAvatar pubkey={pk} />
          </div>
        ))}
      </div>
      <span className="text-xs text-black/50 dark:text-white/50">
        {typingText(pubkeys, profiles)}
      </span>
    </div>
  );
}
```

Note: Using three fixed hook calls (`useProfile` called unconditionally for indices 0-2) to avoid rules-of-hooks issues with variable-length arrays. Pass empty string for unused slots — `useProfile("")` should no-op gracefully.

- [ ] **Step 3: Verify `useProfile("")` is safe**

```bash
grep -n "useProfile\|export function useProfile" web/src/features/profiles/use-profile.ts | head -5
```

If `useProfile("")` could throw, add guard: `const p0 = useProfile(pubkeys[0] ?? "")`.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/messages/ui/TypingIndicator.tsx
git commit -m "feat(web): show avatars + names in TypingIndicator"
```

---

### Task 2: Desktop — extend `TypingIndicatorRow` to show avatars

**Files:**
- Modify: `desktop/src/features/messages/ui/TypingIndicatorRow.tsx`

**Interfaces:**
- Consumes: `useProfileQuery(pubkey)` from `@/features/profiles/hooks`; desktop Avatar component

- [ ] **Step 1: Read current `TypingIndicatorRow.tsx`**

The component at `desktop/src/features/messages/ui/TypingIndicatorRow.tsx:54` receives `typingPubkeys` and `channel`. Find current display and avatar usage.

- [ ] **Step 2: Add avatar stack**

Find where the "X is typing…" text is rendered. Add an avatar stack before the text using desktop's `Avatar` / `AvatarImage` / `AvatarFallback` components:

```tsx
import { useProfileQuery } from "@/features/profiles/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";

// Render before the typing text:
function TypingAvatar({ pubkey }: { pubkey: string }) {
  const { data: profile } = useProfileQuery(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <div title={name} className="-ml-1.5 first:ml-0">
      <Avatar className="h-5 w-5 ring-1 ring-background">
        <AvatarImage src={profile?.picture} />
        <AvatarFallback className="text-[9px]">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
    </div>
  );
}
```

In the render of `TypingIndicatorRow`, insert before the typing text:

```tsx
<div className="flex items-center mr-1.5">
  {typingPubkeys.slice(0, 3).map((pk) => (
    <TypingAvatar key={pk} pubkey={pk} />
  ))}
</div>
```

- [ ] **Step 3: Build display name for typing text**

The existing typing text likely shows "X is typing…" with a generic placeholder or pubkey. Extend it to use profile names. Find the text construction in the file and replace with a helper that resolves names from `useProfileQuery`.

Note: Since hooks must be called unconditionally, use the same pattern as web — call `useProfileQuery` for indices 0-2 unconditionally.

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/messages/ui/TypingIndicatorRow.tsx
git commit -m "feat(desktop): show avatars + names in TypingIndicatorRow"
```

---

### Task 3: Web — `PresenceBadge` component

**Files:**
- Create: `web/src/features/presence/ui/PresenceBadge.tsx`

**Interfaces:**
- Consumes: `usePresence()` from `@/features/presence/usePresence`
- Produces: `<PresenceDot pubkey status />` and `<PresenceBadge pubkey />` — dot + label

- [ ] **Step 1: Read desktop `PresenceBadge.tsx` for reference**

```bash
cat "C:\Users\smikl\Desktop\Work\LenOS\desktop\src\features\presence\ui\PresenceBadge.tsx"
```

Note the exact color scheme: green = online, amber = away, gray = offline/DND.

- [ ] **Step 2: Create web `PresenceBadge.tsx`**

```tsx
// web/src/features/presence/ui/PresenceBadge.tsx

export type PresenceStatus = "online" | "away" | "offline" | "dnd";

function statusColor(status: PresenceStatus): string {
  switch (status) {
    case "online": return "bg-green-500";
    case "away":   return "bg-amber-400";
    case "dnd":    return "bg-red-500";
    default:       return "bg-black/20 dark:bg-white/20";
  }
}

function statusLabel(status: PresenceStatus): string {
  switch (status) {
    case "online": return "Online";
    case "away":   return "Away";
    case "dnd":    return "Do Not Disturb";
    default:       return "Offline";
  }
}

interface DotProps {
  status: PresenceStatus;
  size?: "sm" | "md";
}

export function PresenceDot({ status, size = "sm" }: DotProps) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim} ${statusColor(status)}`}
      aria-label={statusLabel(status)}
    />
  );
}

interface BadgeProps {
  status: PresenceStatus;
}

export function PresenceBadge({ status }: BadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <PresenceDot status={status} />
      <span className="text-xs text-black/60 dark:text-white/60">{statusLabel(status)}</span>
    </div>
  );
}
```

- [ ] **Step 3: Update web `MemberCard` to use `PresenceDot`**

In `web/src/features/channels/ui/MemberCard.tsx`, find the current `online` boolean prop usage (around line 42). Replace with `PresenceDot`:

```typescript
import { usePresence } from "@/features/presence/usePresence";
import { PresenceDot } from "@/features/presence/ui/PresenceBadge";

// Inside MemberCard component, get presence from hook:
const presenceMap = usePresence(/* communityId — find how it's passed */);
const lastSeen = presenceMap.get(member.pubkey)?.lastSeen ?? 0;
const isOnline = Date.now() - lastSeen < 90_000;
const status = isOnline ? "online" : "offline";
```

Replace the existing `online` prop rendering with:

```tsx
<div className="absolute -bottom-0.5 -right-0.5">
  <PresenceDot status={status} size="sm" />
</div>
```

Note: Read `web/src/features/presence/usePresence.ts` to understand the return type and how to get the community ID before making changes.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/presence/ui/PresenceBadge.tsx \
        web/src/features/channels/ui/MemberCard.tsx
git commit -m "feat(web): add PresenceBadge component and update MemberCard"
```

---

### Task 4: Web — status setter in `useUserStatus` + `ProfilePopover`

**Files:**
- Modify: `web/src/features/profile/useUserStatus.ts`
- Modify: `web/src/features/profiles/ui/ProfilePopover.tsx`

**Interfaces:**
- Consumes: kind:30315 d:"general" publish via web publish pattern
- Produces: `setUserStatus(status, statusText?)` function; status picker UI in ProfilePopover

- [ ] **Step 1: Add `setUserStatus` to `useUserStatus`**

Read `web/src/features/profile/useUserStatus.ts` to understand the current structure. Then add a setter:

```typescript
// Add to useUserStatus.ts exports:
export function useSetUserStatus() {
  const setStatus = useCallback(
    async (status: "online" | "away" | "dnd" | "offline", statusText?: string) => {
      const emoji =
        status === "online" ? "🟢" :
        status === "away"   ? "🌙" :
        status === "dnd"    ? "⛔" : "⭕";
      const content = statusText ? `${emoji} ${statusText}` : emoji;
      const signed = await signNostrEvent(
        {
          kind: 30315,
          content,
          tags: [["d", "general"]],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [],
  );
  return setStatus;
}
```

Add the required imports at top of file if not already present:
```typescript
import { useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
```

- [ ] **Step 2: Add status picker to `ProfilePopover`**

Read `web/src/features/profiles/ui/ProfilePopover.tsx` to understand current structure. Add:

```typescript
import { useSetUserStatus } from "@/features/profile/useUserStatus";
```

Inside the popover component, add:

```typescript
const setStatus = useSetUserStatus();
const [settingStatus, setSettingStatus] = useState(false);
```

Add a status row at the bottom of the popover (after existing profile info):

```tsx
<div className="border-t border-black/10 px-3 py-2 dark:border-white/10">
  <p className="mb-1.5 text-xs font-medium text-black/50 dark:text-white/50">Set Status</p>
  <div className="flex flex-wrap gap-1.5">
    {(["online", "away", "dnd", "offline"] as const).map((s) => {
      const icons = { online: "🟢", away: "🌙", dnd: "⛔", offline: "⭕" } as const;
      const labels = { online: "Online", away: "Away", dnd: "DND", offline: "Offline" } as const;
      return (
        <button
          key={s}
          type="button"
          disabled={settingStatus}
          onClick={async () => {
            setSettingStatus(true);
            try { await setStatus(s); } finally { setSettingStatus(false); }
          }}
          className="flex items-center gap-1 rounded-full border border-black/15 px-2 py-0.5 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
        >
          <span>{icons[s]}</span>
          <span className="text-black/70 dark:text-white/70">{labels[s]}</span>
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/profile/useUserStatus.ts \
        web/src/features/profiles/ui/ProfilePopover.tsx
git commit -m "feat(web): add status setter to useUserStatus and ProfilePopover"
```

---

### Task 5: Desktop — verify status setting UI exists

**Files:**
- Read-only investigation; modify if missing

- [ ] **Step 1: Check if desktop has a manual status setter**

```bash
grep -rn "setStatus\|set_status\|StatusPicker\|status.*setter" desktop/src/features --include="*.tsx" --include="*.ts" | grep -v ".test\." | head -10
```

- [ ] **Step 2: If missing, add it**

If desktop has no manual status UI, add a status picker to the desktop `UserProfilePanel` or equivalent profile popover:

Follow the same pattern as web Task 4 Step 2, using desktop shadcn/ui:

```tsx
// Status buttons using shadcn Button
import { useSetUserStatus } from "@/features/profile/useUserStatus"; // or equivalent desktop hook
```

Create `useSetUserStatus` for desktop if it doesn't exist:

```typescript
// desktop/src/features/profile/useSetUserStatus.ts
import { useCallback } from "react";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";

export function useSetUserStatus() {
  return useCallback(async (status: "online" | "away" | "dnd" | "offline", statusText?: string) => {
    const emoji = { online: "🟢", away: "🌙", dnd: "⛔", offline: "⭕" }[status];
    const content = statusText ? `${emoji} ${statusText}` : emoji;
    const event = await signRelayEvent({
      kind: 30315,
      content,
      tags: [["d", "general"]],
    });
    await relayClient.publishEvent(event, "Timeout setting status.", "Failed to set status.");
  }, []);
}
```

- [ ] **Step 3: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/features/profile/
git commit -m "feat(desktop): add useSetUserStatus and status picker if missing"
```
