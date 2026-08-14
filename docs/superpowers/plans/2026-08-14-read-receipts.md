# Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which members have read each message, via kind:30078 `d:"read:{channelId}"` events, with avatar stacks on each MessageRow.

**Architecture:** Each user publishes their own read receipt (kind:30078) when they reach the bottom of the channel. All members subscribe to all receipts. MessageRow shows avatars of users whose last_read_event_id matches the event or whose last_read_at >= event.created_at.

**Tech Stack:** TypeScript/React, Nostr kind:30078, shadcn/ui (desktop), Tailwind (web)

**Spec:** docs/superpowers/specs/2026-08-14-phase3-design.md (Feature 3)

## Global Constraints

- Web + Desktop parity: every feature ships on BOTH platforms
- Web publish: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Desktop publish: `signRelayEvent` + `relayClient.publishEvent(event, timeoutMsg, errorMsg)`
- Desktop subscribe: `relayClient.subscribeLive(filter, onEvent)` — public API (NOT `relayClient.subscribe`)
- Desktop `RelaySubscriptionFilter` requires `limit` field — include `limit: 1` for parameterized replaceable events
- Web admin check: `useMembers(channelId)` → member.role === "admin"
- Desktop admin check: `useMyRelayMembershipQuery()` → `role === "admin" || role === "owner"`
- shadcn/ui components on desktop (Button, Avatar, etc.), Tailwind-only on web
- KIND_READ_RECEIPTS = 30078 (same kind as pinning, different d-tag)
- d-tag: `"read:{channelId}"` — distinct from `"read-state:{slotId}"` (no conflict)
- Pre-existing compile error in `crates/lenos-relay/src/api/webhooks.rs:239` — do NOT touch webhooks.rs

---

### Task 1: Web — useReadReceipts hook

**Files:**
- Create: `web/src/features/messages/read-receipts/useReadReceipts.ts`
- Create: `web/src/features/messages/read-receipts/types.ts`

**Interfaces:**
- Produces: `useReadReceipts(channelId: string | null): Map<string, ReadReceipt>`
- Produces type: `ReadReceipt { last_read_event_id: string; last_read_at: number; pubkey: string }`

- [ ] **Step 1: Write types.ts**

```typescript
// web/src/features/messages/read-receipts/types.ts
export interface ReadReceipt {
  pubkey: string;
  last_read_event_id: string;
  last_read_at: number;
}
```

- [ ] **Step 2: Write useReadReceipts.ts**

Get the list of relay websocket URL from `relayWsUrl()` (from `@/shared/lib/relay`). Get members via `useMembers(channelId)`. Subscribe to kind:30078 with `#d: ["read:" + channelId]` and `authors: memberPubkeys`.

```typescript
import { useState, useEffect } from "react";
import { useMembers } from "@/features/channels/hooks/useMembers";
import { getRelayClient, relayWsUrl } from "@/shared/lib/relay";
import { ReadReceipt } from "./types";

export function useReadReceipts(channelId: string | null): Map<string, ReadReceipt> {
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const members = useMembers(channelId ?? "");
  const memberPubkeys = members.map((m) => m.pubkey);

  useEffect(() => {
    if (!channelId || memberPubkeys.length === 0) return;
    const client = getRelayClient(relayWsUrl());
    const sub = client.subscribe(
      [{ kinds: [30078], "#d": [`read:${channelId}`], authors: memberPubkeys }],
      (event) => {
        try {
          const data = JSON.parse(event.content) as {
            last_read_event_id: string;
            last_read_at: number;
          };
          setReceipts((prev) => {
            const next = new Map(prev);
            next.set(event.pubkey, { pubkey: event.pubkey, ...data });
            return next;
          });
        } catch {
          // ignore malformed events
        }
      }
    );
    return () => sub.close();
  }, [channelId, memberPubkeys.join(",")]);

  return receipts;
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/read-receipts/
git commit -m "feat(web): add useReadReceipts hook and ReadReceipt types"
```

---

### Task 2: Web — ReadAvatarStack component

**Files:**
- Create: `web/src/features/messages/read-receipts/ReadAvatarStack.tsx`

**Interfaces:**
- Consumes: `ReadReceipt` from `./types`
- Produces: `<ReadAvatarStack receipts={ReadReceipt[]} maxVisible={3} />` — renders overlapping avatars

- [ ] **Step 1: Find Avatar component usage in web codebase**

```bash
grep -rn "Avatar\|avatar" web/src/shared/ui/ --include="*.tsx" | head -10
grep -rn "useProfile\|getDisplayName" web/src/features/profiles/ --include="*.ts" | head -5
```

- [ ] **Step 2: Write ReadAvatarStack.tsx**

Show at most 3 avatars. If more readers, show "+N". Use `useProfile(pubkey)` to get display name and picture.

```tsx
import { useProfile } from "@/features/profiles/hooks/useProfile";
import { ReadReceipt } from "./types";

interface Props {
  receipts: ReadReceipt[];
  maxVisible?: number;
}

function AvatarPip({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.displayName ?? profile?.name ?? pubkey.slice(0, 8);
  const src = profile?.picture;
  return (
    <div
      className="w-5 h-5 rounded-full border border-background overflow-hidden bg-muted -ml-1 first:ml-0"
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] font-medium bg-primary/20 text-primary">
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function ReadAvatarStack({ receipts, maxVisible = 3 }: Props) {
  if (receipts.length === 0) return null;
  const visible = receipts.slice(0, maxVisible);
  const overflow = receipts.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((r) => (
        <AvatarPip key={r.pubkey} pubkey={r.pubkey} />
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full border border-background bg-muted -ml-1 flex items-center justify-center text-[9px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify useProfile hook path**

```bash
grep -rn "export.*useProfile" web/src/features/profiles/ --include="*.ts" | head -5
```

Adjust the import path in ReadAvatarStack.tsx if needed.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/messages/read-receipts/ReadAvatarStack.tsx
git commit -m "feat(web): add ReadAvatarStack component"
```

---

### Task 3: Web — publish read receipts + wire into MessageRow

**Files:**
- Modify: `web/src/features/channels/ui/ChannelView.tsx`
- Modify: `web/src/features/messages/ui/MessageRow.tsx`
- Modify: `web/src/features/messages/ui/MessageTimeline.tsx`

**Interfaces:**
- Consumes: `useReadReceipts(channelId)` from `../read-receipts/useReadReceipts`
- Consumes: `ReadAvatarStack` from `../read-receipts/ReadAvatarStack`
- Publish receipt: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`

**Steps:**

- [ ] **Step 1: Read ChannelView.tsx to understand current bottomRef / scroll detection**

```bash
grep -n "bottomRef\|isAtBottom\|lastMessage\|publishAndWait\|signNostrEvent" web/src/features/channels/ui/ChannelView.tsx | head -20
```

- [ ] **Step 2: Add publish-read-receipt logic to ChannelView.tsx**

Find the bottomRef useEffect (or create one). Add debounced receipt publish. Add `useReadReceipts` hook call.

Pattern for the publish (inside a useCallback with 2000ms debounce):
```typescript
// debounced receipt publisher — call when isAtBottom and messages exist
const publishReadReceipt = useCallback(
  debounce(async (latestMessage: { id: string; created_at: number }) => {
    const url = relayHttpBaseUrl() + "/api/nostr";  // direct publish via relay ws
    const content = JSON.stringify({
      last_read_event_id: latestMessage.id,
      last_read_at: latestMessage.created_at,
    });
    const event = await signNostrEvent({
      kind: 30078,
      content,
      tags: [["d", `read:${channelId}`]],
      created_at: Math.floor(Date.now() / 1000),
    });
    await getRelayClient(relayWsUrl()).publishAndWait(event);
  }, 2000),
  [channelId]
);
```

Call `publishReadReceipt(latestMessage)` inside an effect that watches `isAtBottom` (or bottomRef intersection).

Also add:
```typescript
const readReceipts = useReadReceipts(channelId);
```

Pass `readReceipts` as a prop to `<MessageTimeline>`.

- [ ] **Step 3: Read MessageRow.tsx to find correct prop addition location**

```bash
grep -n "interface.*Props\|onPin\|isAdmin\|isPinned" web/src/features/messages/ui/MessageRow.tsx | head -20
```

- [ ] **Step 4: Add readReceipts prop to MessageRow**

Add to Props:
```typescript
readReceipts?: Map<string, ReadReceipt>;
```

At the right edge of the message row JSX (after the main content), add:
```tsx
{readReceipts && (() => {
  const readers = Array.from(readReceipts.values()).filter(
    (r) => r.last_read_event_id === msg.id || r.last_read_at >= msg.created_at
  );
  return readers.length > 0 ? <ReadAvatarStack receipts={readers} /> : null;
})()}
```

- [ ] **Step 5: Forward readReceipts through MessageTimeline**

```bash
grep -n "interface.*Props\|onPin\|pinnedMessageIds" web/src/features/messages/ui/MessageTimeline.tsx | head -20
```

Add `readReceipts?: Map<string, ReadReceipt>` to MessageTimeline props and forward to MessageRow.

- [ ] **Step 6: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -30
```

Fix any errors before committing.

- [ ] **Step 7: Commit**

```bash
git add web/src/features/channels/ui/ChannelView.tsx web/src/features/messages/ui/MessageRow.tsx web/src/features/messages/ui/MessageTimeline.tsx
git commit -m "feat(web): publish read receipts and show ReadAvatarStack on MessageRow"
```

---

### Task 4: Desktop — useReadReceipts hook

**Files:**
- Create: `desktop/src/features/messages/read-receipts/types.ts`
- Create: `desktop/src/features/messages/read-receipts/useReadReceipts.ts`

**Interfaces:**
- Produces: `useReadReceipts(channelId: string | null): Map<string, ReadReceipt>`
- Same ReadReceipt type as web

- [ ] **Step 1: Find desktop relay client and member query patterns**

```bash
grep -rn "subscribeLive\|relayClient\." desktop/src/features/messages/pinning/usePinnedMessages.ts | head -10
grep -rn "useRelayMembersQuery\|memberPubkeys\|authors" desktop/src/features/community-members/ --include="*.ts" | head -10
```

- [ ] **Step 2: Write types.ts** (identical to web)

```typescript
export interface ReadReceipt {
  pubkey: string;
  last_read_event_id: string;
  last_read_at: number;
}
```

- [ ] **Step 3: Write useReadReceipts.ts**

Mirror the pattern from `desktop/src/features/messages/pinning/usePinnedMessages.ts` (uses `relayClient.subscribeLive`, disposed-flag async pattern, `limit: 1` in filter).

```typescript
import { useState, useEffect } from "react";
import { useRelayClient } from "@/shared/api/relay-client";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { ReadReceipt } from "./types";

export function useReadReceipts(channelId: string | null): Map<string, ReadReceipt> {
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const relayClient = useRelayClient();
  const { data: members } = useRelayMembersQuery();
  const memberPubkeys = (members ?? []).map((m) => m.pubkey);

  useEffect(() => {
    if (!channelId || !relayClient || memberPubkeys.length === 0) return;
    let disposed = false;
    const unsub = relayClient.subscribeLive(
      {
        kinds: [30078],
        "#d": [`read:${channelId}`],
        authors: memberPubkeys,
        limit: 1,
      },
      (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.content) as {
            last_read_event_id: string;
            last_read_at: number;
          };
          setReceipts((prev) => {
            const next = new Map(prev);
            next.set(event.pubkey, { pubkey: event.pubkey, ...data });
            return next;
          });
        } catch {
          // ignore malformed
        }
      }
    );
    return () => {
      disposed = true;
      unsub();
    };
  }, [channelId, relayClient, memberPubkeys.join(",")]);

  return receipts;
}
```

Check the actual import paths for `useRelayClient` and `useRelayMembersQuery` by looking at how `usePinnedMessages.ts` imports them, then adjust.

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/messages/read-receipts/
git commit -m "feat(desktop): add useReadReceipts hook and types"
```

---

### Task 5: Desktop — ReadAvatarStack component

**Files:**
- Create: `desktop/src/features/messages/read-receipts/ReadAvatarStack.tsx`

**Interfaces:**
- Produces: `<ReadAvatarStack receipts={ReadReceipt[]} maxVisible={3} />`
- Uses shadcn/ui `Avatar`, `AvatarImage`, `AvatarFallback` components

- [ ] **Step 1: Find Avatar and useProfile patterns in desktop**

```bash
grep -rn "Avatar\|AvatarImage\|AvatarFallback" desktop/src/features/messages/ui/ --include="*.tsx" | head -10
grep -rn "useProfile\|displayName\|picture" desktop/src/features/profiles/ --include="*.ts" | head -5
```

- [ ] **Step 2: Write ReadAvatarStack.tsx using shadcn Avatar**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { useProfile } from "@/features/profiles/hooks/useProfile";
import { ReadReceipt } from "./types";

interface Props {
  receipts: ReadReceipt[];
  maxVisible?: number;
}

function AvatarPip({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.displayName ?? profile?.name ?? pubkey.slice(0, 8);
  return (
    <Avatar className="w-5 h-5 -ml-1 first:ml-0 border border-background">
      <AvatarImage src={profile?.picture} alt={name} />
      <AvatarFallback className="text-[9px]">{name[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function ReadAvatarStack({ receipts, maxVisible = 3 }: Props) {
  if (receipts.length === 0) return null;
  const visible = receipts.slice(0, maxVisible);
  const overflow = receipts.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((r) => (
        <AvatarPip key={r.pubkey} pubkey={r.pubkey} />
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full border border-background bg-muted -ml-1 flex items-center justify-center text-[9px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  );
}
```

Adjust Avatar import path based on findings from Step 1.

- [ ] **Step 3: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/features/messages/read-receipts/ReadAvatarStack.tsx
git commit -m "feat(desktop): add ReadAvatarStack component"
```

---

### Task 6: Desktop — wire read receipts into channel view + MessageRow

**Files:**
- Modify: desktop channel view (discover via grep)
- Modify: `desktop/src/features/messages/ui/MessageRow.tsx`
- Modify: `desktop/src/features/messages/ui/MessageTimeline.tsx`
- Modify: `desktop/src/features/messages/ui/TimelineMessageList.tsx`

**Interfaces:**
- Consumes: `useReadReceipts` from `../read-receipts/useReadReceipts`
- Consumes: `ReadAvatarStack` from `../read-receipts/ReadAvatarStack`
- Consumes: `ReadReceipt` from `../read-receipts/types`
- Publish receipt: `signRelayEvent` + `relayClient.publishEvent`

- [ ] **Step 1: Discover desktop channel view and isAtBottom pattern**

```bash
grep -rn "isAtBottom\|useAnchoredScroll\|MessageTimeline" desktop/src/features/channels/ --include="*.tsx" | head -15
grep -rn "publishEvent\|signRelayEvent" desktop/src/features/messages/pinning/usePinMessage.ts | head -10
```

- [ ] **Step 2: Wire useReadReceipts in desktop channel view**

Add `useReadReceipts(channelId)` call. Add a `useEffect` that watches `isAtBottom` — when true and `lastMessage` exists, call debounced publish:

```typescript
const publishReadReceipt = useCallback(
  debounce(async (latestEventId: string, latestAt: number) => {
    const content = JSON.stringify({
      last_read_event_id: latestEventId,
      last_read_at: latestAt,
    });
    const event = await signRelayEvent({
      kind: 30078,
      content,
      tags: [["d", `read:${channelId}`]],
      created_at: Math.floor(Date.now() / 1000),
    });
    relayClient.publishEvent(event, "publishing read receipt", "failed to publish read receipt");
  }, 2000),
  [channelId, relayClient]
);
```

Call when `isAtBottom` and messages available.

Pass `readReceipts` to `<MessageTimeline>`.

- [ ] **Step 3: Add readReceipts prop to desktop MessageRow**

Find the existing Props interface (it already has `isAdmin?`, `isPinned?`, `onPin?`, `onUnpin?` from Plan 2 Task 7). Add:
```typescript
readReceipts?: Map<string, ReadReceipt>;
```

At right edge of row JSX, add ReadAvatarStack rendering (same logic as web: filter by `last_read_event_id === msg.id || last_read_at >= msg.created_at`).

- [ ] **Step 4: Forward through MessageTimeline and TimelineMessageList**

Same chain as Plan 2: add `readReceipts` prop to MessageTimeline → TimelineMessageList → MessageRow. Check memo comparator in MessageRow also compares readReceipts (by reference is fine).

- [ ] **Step 5: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/features/channels/ui/ desktop/src/features/messages/ui/MessageRow.tsx desktop/src/features/messages/ui/MessageTimeline.tsx desktop/src/features/messages/ui/TimelineMessageList.tsx
git commit -m "feat(desktop): wire read receipts into channel view and MessageRow"
```
