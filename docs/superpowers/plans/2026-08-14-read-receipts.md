# Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show small avatar stacks on messages indicating which members have read past that point; publish read receipts when the user scrolls to the bottom of a channel (debounced, guarded against spam).

**Architecture:** Each user publishes kind:30078 d:`"read:{channelId}"` with `{ last_read_event_id, last_read_at }`. A `useReadReceipts(channelId)` hook subscribes to these events from all channel members and returns a `Map<pubkey, ReadReceipt>`. `MessageRow` renders a `ReadAvatarStack` showing up to 3 avatars of members who have read at or past that message. Publish is debounced 2 s and guarded by `last_read_at > existingPublishedValue + 10_000`.

**Tech Stack:** TypeScript/React, Nostr kind:30078, `useMembers` (web) / `relayClient.subscribe` (desktop)

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 3

## Global Constraints

- Web + desktop parity.
- kind:30078 d-tag: `"read:{channelId}"` — distinct from existing `"read-state:{slotId}"`.
- Only publish if `last_read_at > existingPublishedValue + 10_000` ms (10 s guard).
- Debounce publish 2 000 ms after scroll-to-bottom.
- Show at most 3 avatars; overflow as `+N`.

---

### Task 1: Types

**Files:**
- Create: `web/src/features/messages/readReceipts/types.ts`
- Create: `desktop/src/features/messages/readReceipts/types.ts`

**Interfaces:**
- Produces: `ReadReceipt` used by all subsequent tasks

- [ ] **Step 1: Create web types**

```typescript
// web/src/features/messages/readReceipts/types.ts
export interface ReadReceipt {
  pubkey: string;
  last_read_event_id: string;
  last_read_at: number;  // unix ms
}
```

- [ ] **Step 2: Create desktop types** (identical)

```typescript
// desktop/src/features/messages/readReceipts/types.ts
export interface ReadReceipt {
  pubkey: string;
  last_read_event_id: string;
  last_read_at: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/features/messages/readReceipts/types.ts \
        desktop/src/features/messages/readReceipts/types.ts
git commit -m "feat: add ReadReceipt type for read receipts feature"
```

---

### Task 2: Web — `useReadReceipts` hook

**Files:**
- Create: `web/src/features/messages/readReceipts/useReadReceipts.ts`

**Interfaces:**
- Consumes: `useMembers(channelId)` from `@/features/channels/useMembers`
- Produces: `useReadReceipts(channelId)` → `Map<pubkey, ReadReceipt>`

- [ ] **Step 1: Write hook**

```typescript
// web/src/features/messages/readReceipts/useReadReceipts.ts
import { useEffect, useState, useRef } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useMembers } from "@/features/channels/useMembers";
import type { ReadReceipt } from "./types";

export function useReadReceipts(channelId: string): Map<string, ReadReceipt> {
  const members = useMembers(channelId);
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());
  const memberPubkeysRef = useRef<string[]>([]);

  useEffect(() => {
    memberPubkeysRef.current = members.map((m) => m.pubkey);
  }, [members]);

  useEffect(() => {
    if (!channelId || members.length === 0) return;
    const dTag = `read:${channelId}`;
    const authors = members.map((m) => m.pubkey);
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: `read-receipts-${channelId}`,
      filter: { kinds: [30078], "#d": [dTag], authors },
      onEvent: (raw) => {
        try {
          const content = JSON.parse(raw.content as string) as {
            last_read_event_id: string;
            last_read_at: number;
          };
          setReceipts((prev) => {
            const next = new Map(prev);
            next.set(raw.pubkey as string, {
              pubkey: raw.pubkey as string,
              last_read_event_id: content.last_read_event_id,
              last_read_at: content.last_read_at,
            });
            return next;
          });
        } catch {
          // malformed event — ignore
        }
      },
    });

    return () => {
      unsub();
      setReceipts(new Map());
    };
  }, [channelId, members]);

  return receipts;
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/features/messages/readReceipts/useReadReceipts.ts
git commit -m "feat(web): add useReadReceipts hook"
```

---

### Task 3: Web — `usePublishReadReceipt` hook

**Files:**
- Create: `web/src/features/messages/readReceipts/usePublishReadReceipt.ts`

**Interfaces:**
- Produces: `usePublishReadReceipt(channelId)` → `{ markRead(eventId: string): void }`

- [ ] **Step 1: Write test (Node-runnable pure-logic part)**

Since web has no unit runner, verify the guard logic manually:
- Guard: only publish if `Date.now() > lastPublishedAt + 10_000`
- Debounce: 2 000 ms

- [ ] **Step 2: Write hook**

```typescript
// web/src/features/messages/readReceipts/usePublishReadReceipt.ts
import { useCallback, useRef } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

const GUARD_MS = 10_000;
const DEBOUNCE_MS = 2_000;

export function usePublishReadReceipt(channelId: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishedAtRef = useRef<number>(0);

  const markRead = useCallback(
    (eventId: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const now = Date.now();
        if (now - lastPublishedAtRef.current < GUARD_MS) return;
        lastPublishedAtRef.current = now;
        try {
          const signed = await signNostrEvent(
            {
              kind: 30078,
              content: JSON.stringify({
                last_read_event_id: eventId,
                last_read_at: now,
              }),
              tags: [["d", `read:${channelId}`]],
            },
            { requireNip07: false },
          );
          await getRelayClient(relayWsUrl()).publishAndWait(
            signed as Record<string, unknown>,
          );
        } catch {
          // non-critical
        }
      }, DEBOUNCE_MS);
    },
    [channelId],
  );

  return { markRead };
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/readReceipts/usePublishReadReceipt.ts
git commit -m "feat(web): add usePublishReadReceipt hook"
```

---

### Task 4: Web — `ReadAvatarStack` component

**Files:**
- Create: `web/src/features/messages/readReceipts/ReadAvatarStack.tsx`

**Interfaces:**
- Consumes: list of pubkeys who have read at/past this message
- Produces: `<ReadAvatarStack pubkeys={[...]} />` — 3-avatar stack or `+N` overflow

- [ ] **Step 1: Write component**

```tsx
// web/src/features/messages/readReceipts/ReadAvatarStack.tsx
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";

const MAX_VISIBLE = 3;

function AvatarItem({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <div title={name} className="-ml-1.5 first:ml-0">
      <Avatar src={profile?.picture} name={name} size={16} />
    </div>
  );
}

interface Props {
  pubkeys: string[];
}

export function ReadAvatarStack({ pubkeys }: Props) {
  if (pubkeys.length === 0) return null;
  const visible = pubkeys.slice(0, MAX_VISIBLE);
  const overflow = pubkeys.length - visible.length;

  return (
    <div className="flex items-center" aria-label={`Read by ${pubkeys.length}`}>
      {visible.map((pk) => (
        <AvatarItem key={pk} pubkey={pk} />
      ))}
      {overflow > 0 && (
        <span className="-ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-[9px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/features/messages/readReceipts/ReadAvatarStack.tsx
git commit -m "feat(web): add ReadAvatarStack component"
```

---

### Task 5: Web — wire into `ChannelView` + `MessageRow`

**Files:**
- Modify: `web/src/features/channels/ui/ChannelView.tsx`
- Modify: `web/src/features/messages/ui/MessageRow.tsx`
- Modify: `web/src/features/messages/ui/MessageTimeline.tsx`

**Interfaces:**
- Consumes: `useReadReceipts`, `usePublishReadReceipt`, `ReadAvatarStack` from prior tasks

- [ ] **Step 1: Add read receipt hooks to `ChannelView`**

Add imports:

```typescript
import { useReadReceipts } from "@/features/messages/readReceipts/useReadReceipts";
import { usePublishReadReceipt } from "@/features/messages/readReceipts/usePublishReadReceipt";
```

Inside `ChannelView()`:

```typescript
  const readReceipts = useReadReceipts(channelId);
  const { markRead } = usePublishReadReceipt(channelId);
```

- [ ] **Step 2: Trigger `markRead` on scroll-to-bottom**

The existing `useEffect` (line ~85) already calls `markRead(last.createdAt)` from read-state. After it, add a scroll-to-bottom detector:

```typescript
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    // Existing read-state mark:
    markReadState(last.createdAt);
    // New: read receipt mark — bottom of scroll triggers this via MessageTimeline's onAtBottom
  }, [messages, markReadState]);
```

Pass `onAtBottom` to `MessageTimeline`:

```tsx
<MessageTimeline
  ...
  readReceipts={readReceipts}
  onAtBottom={() => {
    const last = visibleMessages[visibleMessages.length - 1];
    if (last) markRead(last.id);
  }}
/>
```

- [ ] **Step 3: Add `readReceipts` + `onAtBottom` to `MessageTimeline`**

In `MessageTimeline.tsx`, add to props interface:

```typescript
  readReceipts?: Map<string, ReadReceipt>;
  onAtBottom?: () => void;
```

Import `ReadReceipt` from `@/features/messages/readReceipts/types`.

In the existing `bottomRef` `useEffect`, call `onAtBottom?.()`:

```typescript
  useEffect(() => {
    // existing scroll logic...
    onAtBottom?.();
  }, [messages, onAtBottom]);
```

Pass `readReceipts` down to each `MessageRow`:

```tsx
<MessageRow
  ...
  readReceipts={readReceipts}
/>
```

- [ ] **Step 4: Add `ReadAvatarStack` to `MessageRow`**

In `MessageRow.tsx`, add to props:

```typescript
  readReceipts?: Map<string, ReadReceipt>;
```

Import `ReadAvatarStack` and compute which pubkeys have read at/past this message:

```typescript
import { ReadAvatarStack } from "@/features/messages/readReceipts/ReadAvatarStack";
import type { ReadReceipt } from "@/features/messages/readReceipts/types";

// Inside component:
const readByPubkeys = readReceipts
  ? Array.from(readReceipts.values())
      .filter(
        (r) =>
          r.last_read_event_id === msg.id ||
          r.last_read_at >= msg.createdAt * 1000,
      )
      .map((r) => r.pubkey)
  : [];
```

Render at the bottom-right of the message row, inside the existing row container:

```tsx
{readByPubkeys.length > 0 && (
  <div className="absolute bottom-0.5 right-2">
    <ReadAvatarStack pubkeys={readByPubkeys} />
  </div>
)}
```

Ensure the row's container has `relative` positioning.

- [ ] **Step 5: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/features/channels/ui/ChannelView.tsx \
        web/src/features/messages/ui/MessageTimeline.tsx \
        web/src/features/messages/ui/MessageRow.tsx
git commit -m "feat(web): wire read receipts into ChannelView and MessageRow"
```

---

### Task 6: Desktop — read receipts hooks + MessageRow integration

**Files:**
- Create: `desktop/src/features/messages/readReceipts/useReadReceipts.ts`
- Create: `desktop/src/features/messages/readReceipts/usePublishReadReceipt.ts`
- Create: `desktop/src/features/messages/readReceipts/ReadAvatarStack.tsx`
- Modify: `desktop/src/features/messages/ui/MessageRow.tsx`
- Modify: desktop channel view file (found in Task 2 Step 1 of pinning plan)

**Interfaces:**
- Consumes: `relayClient.subscribe`, `signRelayEvent`, `relayClient.publishEvent`, `useAnchoredScroll.isAtBottom`

- [ ] **Step 1: Create `useReadReceipts.ts`**

```typescript
// desktop/src/features/messages/readReceipts/useReadReceipts.ts
import { useEffect, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import type { ChannelMember } from "@/shared/api/types";
import type { ReadReceipt } from "./types";

export function useReadReceipts(
  channelId: string | null,
  members: ChannelMember[],
): Map<string, ReadReceipt> {
  const [receipts, setReceipts] = useState<Map<string, ReadReceipt>>(new Map());

  useEffect(() => {
    if (!channelId || members.length === 0) return;
    const authors = members.map((m) => m.pubkey);
    const unsub = relayClient.subscribe(
      { kinds: [30078], "#d": [`read:${channelId}`], authors },
      (raw) => {
        try {
          const content = JSON.parse(raw.content as string) as {
            last_read_event_id: string;
            last_read_at: number;
          };
          setReceipts((prev) => {
            const next = new Map(prev);
            next.set(raw.pubkey as string, {
              pubkey: raw.pubkey as string,
              ...content,
            });
            return next;
          });
        } catch {
          // ignore
        }
      },
    );
    return () => {
      unsub();
      setReceipts(new Map());
    };
  }, [channelId, members]);

  return receipts;
}
```

- [ ] **Step 2: Create `usePublishReadReceipt.ts`**

```typescript
// desktop/src/features/messages/readReceipts/usePublishReadReceipt.ts
import { useCallback, useRef } from "react";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";

const GUARD_MS = 10_000;
const DEBOUNCE_MS = 2_000;

export function usePublishReadReceipt(channelId: string | null) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishedAtRef = useRef<number>(0);

  const markRead = useCallback(
    (eventId: string) => {
      if (!channelId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const now = Date.now();
        if (now - lastPublishedAtRef.current < GUARD_MS) return;
        lastPublishedAtRef.current = now;
        try {
          const event = await signRelayEvent({
            kind: 30078,
            content: JSON.stringify({ last_read_event_id: eventId, last_read_at: now }),
            tags: [["d", `read:${channelId}`]],
          });
          await relayClient.publishEvent(event, "Timed out publishing read receipt.", "Failed to publish read receipt.");
        } catch {
          // non-critical
        }
      }, DEBOUNCE_MS);
    },
    [channelId],
  );

  return { markRead };
}
```

- [ ] **Step 3: Create `ReadAvatarStack.tsx`**

```tsx
// desktop/src/features/messages/readReceipts/ReadAvatarStack.tsx
import { useProfileQuery } from "@/features/profiles/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";

const MAX_VISIBLE = 3;

function AvatarItem({ pubkey }: { pubkey: string }) {
  const { data: profile } = useProfileQuery(pubkey);
  const name = profile?.name || truncatePubkey(pubkey);
  return (
    <div title={name} className="-ml-1.5 first:ml-0">
      <Avatar className="h-4 w-4 ring-1 ring-background">
        <AvatarImage src={profile?.picture} />
        <AvatarFallback className="text-[8px]">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
    </div>
  );
}

interface Props {
  pubkeys: string[];
}

export function ReadAvatarStack({ pubkeys }: Props) {
  if (pubkeys.length === 0) return null;
  const visible = pubkeys.slice(0, MAX_VISIBLE);
  const overflow = pubkeys.length - visible.length;

  return (
    <div className="flex items-center" aria-label={`Read by ${pubkeys.length}`}>
      {visible.map((pk) => (
        <AvatarItem key={pk} pubkey={pk} />
      ))}
      {overflow > 0 && (
        <span className="-ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add `ReadAvatarStack` to desktop `MessageRow`**

Add to desktop `MessageRow` props:

```typescript
  readReceipts?: Map<string, ReadReceipt>;
```

Compute `readByPubkeys` (same logic as web Task 5 Step 4) and render `<ReadAvatarStack>` at bottom-right of the row.

- [ ] **Step 5: Wire `useReadReceipts` + `usePublishReadReceipt` in channel view**

In the desktop channel view, add:

```typescript
import { useReadReceipts } from "@/features/messages/readReceipts/useReadReceipts";
import { usePublishReadReceipt } from "@/features/messages/readReceipts/usePublishReadReceipt";

// Needs members — find existing rawMembers usage or add its own useMembers query
const { markRead } = usePublishReadReceipt(channelId);
const readReceipts = useReadReceipts(channelId, rawMembers);
```

Hook into `useAnchoredScroll`'s `isAtBottom` to trigger `markRead`. Find where `isAtBottom` is read from `useAnchoredScroll` and add:

```typescript
useEffect(() => {
  if (!isAtBottom) return;
  const last = messages[messages.length - 1];
  if (last) markRead(last.id);
}, [isAtBottom, messages, markRead]);
```

Pass `readReceipts` down to the message list component.

- [ ] **Step 6: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add desktop/src/features/messages/readReceipts/
git commit -m "feat(desktop): wire read receipts — hooks, ReadAvatarStack, MessageRow, channel view"
```
