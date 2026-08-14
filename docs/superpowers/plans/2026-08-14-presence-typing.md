# Presence & Typing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve typing indicators (avatars + names) on both platforms, add web PresenceBadge component, and add status setter UI to web ProfilePopover.

**Architecture:** All changes are additive UI improvements to existing presence/typing infrastructure. No new Nostr events or relay changes.

**Tech Stack:** TypeScript/React, shadcn/ui (desktop), Tailwind (web)

**Spec:** docs/superpowers/specs/2026-08-14-phase3-design.md (Feature 6)

## Global Constraints

- Web + Desktop parity for typing improvements; web-only for PresenceBadge and status setter
- Do NOT re-implement existing presence/typing infrastructure (kind:20002, kind:20010/20001, kind:30315 — all exist)
- Typing indicator changes: add avatar + display name per typer; max 3 shown; text "Alice, Bob are typing…"
- Web PresenceBadge: green/amber/gray dot + label; mirrors desktop `PresenceBadge.tsx`
- Status setter: publishes kind:30315 d:"general", content: `"${emoji} ${statusText}"`
- Pre-existing compile error in `crates/lenos-relay/src/api/webhooks.rs:239` — do NOT touch

---

### Task 1: Web — improve TypingIndicator with avatars and names

**Files:**
- Modify: `web/src/features/messages/ui/TypingIndicator.tsx`

**Interfaces:**
- Consumes: `useProfile(pubkey)` from profiles hooks
- No prop changes (still receives `pubkeys: string[]`)

- [ ] **Step 1: Read current TypingIndicator.tsx**

```bash
cat web/src/features/messages/ui/TypingIndicator.tsx
```

- [ ] **Step 2: Find useProfile hook for web**

```bash
grep -rn "export.*useProfile\|export.*useDisplayName" web/src/features/profiles/ --include="*.ts" | head -10
```

- [ ] **Step 3: Update TypingIndicator to show avatar + name per typer**

The current implementation renders dots or just "X is typing". Extend it to show avatars and a name list:

```tsx
function TyperAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.displayName ?? profile?.name ?? pubkey.slice(0, 8);
  return (
    <div className="w-5 h-5 rounded-full border border-background overflow-hidden bg-muted flex-shrink-0" title={name}>
      {profile?.picture ? (
        <img src={profile.picture} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] font-medium">{name[0]?.toUpperCase()}</div>
      )}
    </div>
  );
}
```

For the text: collect names of all typers (max 3), format as "Alice, Bob are typing…" or "Alice is typing…" or "Alice, Bob, and 2 others are typing…".

Show up to 3 `<TyperAvatar>` components inline, then the text.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/messages/ui/TypingIndicator.tsx
git commit -m "feat(web): show avatars and names in TypingIndicator"
```

---

### Task 2: Desktop — improve TypingIndicatorRow with avatars and names

**Files:**
- Modify: `desktop/src/features/messages/ui/TypingIndicatorRow.tsx`

**Interfaces:**
- No prop changes (still receives `pubkeys: string[]`)
- Uses shadcn/ui `Avatar`, `AvatarImage`, `AvatarFallback`

- [ ] **Step 1: Read current TypingIndicatorRow.tsx**

```bash
cat desktop/src/features/messages/ui/TypingIndicatorRow.tsx
```

- [ ] **Step 2: Find useProfile or equivalent in desktop**

```bash
grep -rn "export.*useProfile\|export.*useDisplayName" desktop/src/features/profiles/ --include="*.ts" | head -10
```

- [ ] **Step 3: Update TypingIndicatorRow**

Use shadcn/ui `Avatar` components. Show avatar stack (same pattern as ReadAvatarStack but inline). Format text as "Alice, Bob are typing…".

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { useProfile } from "@/features/profiles/hooks/useProfile";

function TyperAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.displayName ?? profile?.name ?? pubkey.slice(0, 8);
  return (
    <Avatar className="w-5 h-5 border border-background">
      <AvatarImage src={profile?.picture} alt={name} />
      <AvatarFallback className="text-[9px]">{name[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
```

Modify the existing render to show avatars + the formatted name string.

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/messages/ui/TypingIndicatorRow.tsx
git commit -m "feat(desktop): show avatars and names in TypingIndicatorRow"
```

---

### Task 3: Web — add PresenceBadge component and update MemberCard

**Files:**
- Create: `web/src/features/presence/ui/PresenceBadge.tsx`
- Modify: `web/src/features/channels/ui/MemberCard.tsx`

**Interfaces:**
- Produces: `<PresenceBadge pubkey={string} size="sm" />` — green/amber/gray dot + label
- Consumes: `usePresence()` from `@/features/presence/hooks` (already exists)

- [ ] **Step 1: Read desktop PresenceBadge.tsx to understand the pattern**

```bash
cat desktop/src/features/presence/ui/PresenceBadge.tsx
```

- [ ] **Step 2: Find web usePresence hook**

```bash
grep -rn "export.*usePresence\|PresenceStatus\|isOnline" web/src/features/presence/ --include="*.ts" --include="*.tsx" | head -15
```

- [ ] **Step 3: Write web PresenceBadge.tsx**

Port the desktop version to Tailwind CSS (no shadcn/ui components).

```tsx
import { usePresence } from "@/features/presence/hooks/usePresence";

type PresenceSize = "xs" | "sm" | "md";

interface Props {
  pubkey: string;
  size?: PresenceSize;
  showLabel?: boolean;
}

const SIZE_CLASSES: Record<PresenceSize, string> = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
};

export function PresenceBadge({ pubkey, size = "sm", showLabel = false }: Props) {
  const presence = usePresence(pubkey);
  const status = presence?.status ?? "offline";

  const dotColor =
    status === "online" ? "bg-green-500" :
    status === "away" ? "bg-amber-400" :
    "bg-muted-foreground/40";

  const label =
    status === "online" ? "Online" :
    status === "away" ? "Away" :
    "Offline";

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full flex-shrink-0 ${SIZE_CLASSES[size]} ${dotColor}`} />
      {showLabel && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
```

Adjust `usePresence` import and `presence.status` field name based on what the actual hook returns.

- [ ] **Step 4: Update MemberCard.tsx**

```bash
grep -n "online\|presence\|boolean" web/src/features/channels/ui/MemberCard.tsx | head -20
```

Replace the boolean `online` prop or hardcoded dot with `<PresenceBadge pubkey={member.pubkey} size="xs" />`.

- [ ] **Step 5: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/features/presence/ui/PresenceBadge.tsx web/src/features/channels/ui/MemberCard.tsx
git commit -m "feat(web): add PresenceBadge component, update MemberCard to show live presence"
```

---

### Task 4: Web — status setter in ProfilePopover

**Files:**
- Modify: `web/src/features/profiles/hooks/useUserStatus.ts` (add setter)
- Modify: `web/src/features/profiles/ui/ProfilePopover.tsx`

**Interfaces:**
- Consumes: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Produces: `setUserStatus(status: string, statusText?: string): Promise<void>`
- Status is published as kind:30315, d:"general", content: `"${emoji} ${statusText}"`

- [ ] **Step 1: Read existing useUserStatus.ts**

```bash
cat web/src/features/profiles/hooks/useUserStatus.ts 2>/dev/null || find web/src -name "useUserStatus*" | head -5
```

- [ ] **Step 2: Add setUserStatus to useUserStatus.ts**

```typescript
export function useSetUserStatus() {
  return useCallback(async (status: "online" | "away" | "dnd" | "offline", statusText?: string) => {
    const emojiMap: Record<string, string> = {
      online: "🟢",
      away: "🌙",
      dnd: "⛔",
      offline: "⭕",
    };
    const content = statusText
      ? `${emojiMap[status]} ${statusText}`
      : emojiMap[status];
    const event = await signNostrEvent({
      kind: 30315,
      content,
      tags: [["d", "general"]],
      created_at: Math.floor(Date.now() / 1000),
    });
    await getRelayClient(relayWsUrl()).publishAndWait(event);
  }, []);
}
```

If useUserStatus.ts already exports a getter (returns current status), add the setter as a separate exported hook `useSetUserStatus` to avoid breaking existing callers.

- [ ] **Step 3: Read ProfilePopover.tsx**

```bash
cat web/src/features/profiles/ui/ProfilePopover.tsx | head -100
```

- [ ] **Step 4: Add status row to ProfilePopover**

Add four preset status buttons after the profile name/bio section:

```tsx
const setUserStatus = useSetUserStatus();
const [customText, setCustomText] = useState("");

// Status buttons row
<div className="space-y-2 border-t border-border pt-2 mt-2">
  <p className="text-xs font-medium text-muted-foreground">Status</p>
  <div className="flex gap-1.5 flex-wrap">
    {[
      { status: "online", emoji: "🟢", label: "Online" },
      { status: "away", emoji: "🌙", label: "Away" },
      { status: "dnd", emoji: "⛔", label: "DND" },
      { status: "offline", emoji: "⭕", label: "Offline" },
    ].map(({ status, emoji, label }) => (
      <button
        key={status}
        onClick={() => setUserStatus(status as any, customText || undefined)}
        className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent"
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </button>
    ))}
  </div>
  <input
    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
    placeholder="Add a status message…"
    value={customText}
    onChange={(e) => setCustomText(e.target.value)}
  />
</div>
```

- [ ] **Step 5: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/features/profiles/hooks/useUserStatus.ts web/src/features/profiles/ui/ProfilePopover.tsx
git commit -m "feat(web): add status setter to ProfilePopover"
```

---

### Task 5: Desktop — verify/add manual status override UI

**Files:**
- Read: `desktop/src/features/presence/` — discover existing status UI
- Modify if missing: desktop ProfilePopover or UserPanel equivalent

**Interfaces:**
- Produces: desktop equivalent of web ProfilePopover status setter
- Uses `signRelayEvent` + `relayClient.publishEvent` for kind:30315

- [ ] **Step 1: Discover what desktop presence/status UI exists**

```bash
grep -rn "resolveAutomaticPresenceStatus\|setUserStatus\|kind.*30315\|UserStatus" desktop/src/ --include="*.tsx" --include="*.ts" | head -20
grep -rn "ProfilePopover\|UserPanel\|status.*set\|StatusPicker" desktop/src/features/ --include="*.tsx" | head -15
```

- [ ] **Step 2: Decision — add or verify**

If desktop already has a manual status UI that covers the 4 presets: record "already implemented" in commit message, commit a no-op change (or just mark step as verified, skip to commit).

If missing: find the desktop user profile popover (likely near the sidebar bottom where the current user avatar is) and add the same 4 status buttons pattern as web Task 4, using `signRelayEvent` + `relayClient.publishEvent` instead of `signNostrEvent` + `publishAndWait`.

- [ ] **Step 3: If missing — add status setter helper**

```typescript
// In desktop useUserStatus.ts or wherever status is managed
export function useSetUserStatus() {
  const relayClient = useRelayClient();
  return useCallback(async (status: "online" | "away" | "dnd" | "offline", statusText?: string) => {
    const emojiMap = { online: "🟢", away: "🌙", dnd: "⛔", offline: "⭕" };
    const content = statusText ? `${emojiMap[status]} ${statusText}` : emojiMap[status];
    const event = await signRelayEvent({
      kind: 30315,
      content,
      tags: [["d", "general"]],
      created_at: Math.floor(Date.now() / 1000),
    });
    relayClient?.publishEvent(event, "setting status", "status set failed");
  }, [relayClient]);
}
```

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
# If already implemented:
git commit --allow-empty -m "chore(desktop): verified manual status UI already implemented"
# If added:
git add desktop/src/features/presence/ desktop/src/features/profiles/
git commit -m "feat(desktop): add manual status setter to profile popover"
```
