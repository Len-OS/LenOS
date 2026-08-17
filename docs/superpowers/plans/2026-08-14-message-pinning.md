# Message Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to pin/unpin messages in a channel; show a collapsible `PinnedMessagesBar` above the message timeline on both web and desktop.

**Architecture:** Pins stored as kind:30078 d:`"pins:{channelId}"` — admin replaces the full JSON array on each pin/unpin. A `usePinnedMessages` hook subscribes to this event. `PinnedMessagesBar` shows count + expandable list with jump-to and unpin. Admin check via `useMembers` (web) and `useMyRelayMembershipQuery` (desktop).

**Tech Stack:** TypeScript/React, Nostr kind:30078, existing web pub pattern, existing desktop pub pattern

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 2

## Global Constraints

- Web + desktop parity.
- Web publish pattern: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Desktop publish pattern: `signRelayEvent` + `relayClient.publishEvent()`
- Admin check web: `useMembers(channelId)` → member.role === "admin" matching currentPubkey
- Admin check desktop: `useMyRelayMembershipQuery()` → role === "admin" || "owner"
- kind:30078 d-tag: `"pins:{channelId}"`; content: `JSON.stringify({ pins: [...] })`

---

### Task 1: Shared types + kind constant

**Files:**
- Modify: `web/src/shared/constants/kinds.ts`
- Modify: `desktop/src/shared/constants/kinds.ts`
- Create: `web/src/features/messages/pinning/types.ts`
- Create: `desktop/src/features/messages/pinning/types.ts`

**Interfaces:**
- Produces: `PinnedMessage` type used by all subsequent tasks

- [ ] **Step 1: Add kind alias in web `kinds.ts`**

At end of `web/src/shared/constants/kinds.ts` add:

```typescript
// NIP-78 pinned messages. d-tag: "pins:{channelId}"; content: { pins: PinnedMessage[] }.
export const KIND_PINNED_MESSAGES = 30078;
```

- [ ] **Step 2: Add kind alias in desktop `kinds.ts`**

Same line in `desktop/src/shared/constants/kinds.ts`.

- [ ] **Step 3: Create web `types.ts`**

```typescript
// web/src/features/messages/pinning/types.ts
export interface PinnedMessage {
  eventId: string;
  pinnedBy: string;  // pubkey
  pinnedAt: number;  // unix seconds
  content?: string;  // message preview — populated client-side by looking up the event
}
```

- [ ] **Step 4: Create desktop `types.ts`**

Identical content at `desktop/src/features/messages/pinning/types.ts`.

- [ ] **Step 5: Type-check both**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
cd ../desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 6: Commit**

```bash
git add web/src/shared/constants/kinds.ts desktop/src/shared/constants/kinds.ts \
        web/src/features/messages/pinning/types.ts \
        desktop/src/features/messages/pinning/types.ts
git commit -m "feat: add PinnedMessage types and KIND_PINNED_MESSAGES constant"
```

---

### Task 2: Web — `usePinnedMessages` hook

**Files:**
- Create: `web/src/features/messages/pinning/usePinnedMessages.ts`

**Interfaces:**
- Produces: `usePinnedMessages(channelId)` → `PinnedMessage[]`

- [ ] **Step 1: Write the hook**

```typescript
// web/src/features/messages/pinning/usePinnedMessages.ts
import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { PinnedMessage } from "./types";

export function usePinnedMessages(channelId: string): PinnedMessage[] {
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());
    const dTag = `pins:${channelId}`;
    const unsub = client.subscribe({
      id: `pins-${channelId}`,
      filter: { kinds: [30078], "#d": [dTag] },
      onEvent: (raw) => {
        try {
          const parsed = JSON.parse(raw.content as string) as { pins: PinnedMessage[] };
          setPins(parsed.pins ?? []);
        } catch {
          setPins([]);
        }
      },
    });
    return () => {
      unsub();
      setPins([]);
    };
  }, [channelId]);

  return pins;
}
```

- [ ] **Step 2: Write test for pin parsing**

Create `web/src/features/messages/pinning/usePinnedMessages.test.ts` — note: web has no unit runner, so this is a type-level check only. Skip and rely on integration.

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/pinning/usePinnedMessages.ts
git commit -m "feat(web): add usePinnedMessages hook"
```

---

### Task 3: Web — `usePinMessage` mutation hook

**Files:**
- Create: `web/src/features/messages/pinning/usePinMessage.ts`

**Interfaces:**
- Consumes: `PinnedMessage` from Task 1; `usePinnedMessages` result as parameter
- Produces: `{ pin(eventId, pinnedBy, content?): Promise<void>, unpin(eventId): Promise<void> }`

- [ ] **Step 1: Write the hook**

```typescript
// web/src/features/messages/pinning/usePinMessage.ts
import { useCallback } from "react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { PinnedMessage } from "./types";

export function usePinMessage(channelId: string, currentPins: PinnedMessage[]) {
  const publish = useCallback(
    async (newPins: PinnedMessage[]) => {
      const signed = await signNostrEvent(
        {
          kind: 30078,
          content: JSON.stringify({ pins: newPins }),
          tags: [["d", `pins:${channelId}`]],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        signed as Record<string, unknown>,
      );
    },
    [channelId],
  );

  const pin = useCallback(
    async (eventId: string, pinnedBy: string, content?: string) => {
      if (currentPins.some((p) => p.eventId === eventId)) return; // already pinned
      const newPins: PinnedMessage[] = [
        ...currentPins,
        { eventId, pinnedBy, pinnedAt: Math.floor(Date.now() / 1000), content },
      ];
      await publish(newPins);
    },
    [currentPins, publish],
  );

  const unpin = useCallback(
    async (eventId: string) => {
      const newPins = currentPins.filter((p) => p.eventId !== eventId);
      await publish(newPins);
    },
    [currentPins, publish],
  );

  return { pin, unpin };
}
```

- [ ] **Step 2: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/features/messages/pinning/usePinMessage.ts
git commit -m "feat(web): add usePinMessage mutation hook"
```

---

### Task 4: Web — `PinnedMessagesBar` component

**Files:**
- Create: `web/src/features/messages/pinning/PinnedMessagesBar.tsx`

**Interfaces:**
- Consumes: `PinnedMessage[]`, `isAdmin`, `onJumpTo(eventId)`, `onUnpin(eventId)`

- [ ] **Step 1: Write the component**

```tsx
// web/src/features/messages/pinning/PinnedMessagesBar.tsx
import { useState } from "react";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import type { PinnedMessage } from "./types";

interface Props {
  pins: PinnedMessage[];
  isAdmin: boolean;
  onJumpTo: (eventId: string) => void;
  onUnpin: (eventId: string) => void;
}

export function PinnedMessagesBar({ pins, isAdmin, onJumpTo, onUnpin }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (pins.length === 0) return null;

  return (
    <div className="border-b border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Pin className="h-3.5 w-3.5 shrink-0 text-black/50 dark:text-white/50" />
        <span className="text-xs font-medium text-black/70 dark:text-white/70">
          {pins.length} pinned {pins.length === 1 ? "message" : "messages"}
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-black/40 dark:text-white/40" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {pins.map((pin) => (
            <div key={pin.eventId} className="flex items-center gap-2 px-4 py-2">
              <p className="min-w-0 flex-1 truncate text-xs text-black/70 dark:text-white/70">
                {pin.content ?? "Message"}
              </p>
              <button
                type="button"
                onClick={() => onJumpTo(pin.eventId)}
                className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Jump
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onUnpin(pin.eventId)}
                  className="shrink-0 text-xs text-red-500 hover:underline"
                >
                  Unpin
                </button>
              )}
            </div>
          ))}
        </div>
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
git add web/src/features/messages/pinning/PinnedMessagesBar.tsx
git commit -m "feat(web): add PinnedMessagesBar component"
```

---

### Task 5: Web — wire `MessageContextMenu` + `ChannelView`

**Files:**
- Modify: `web/src/features/messages/ui/MessageContextMenu.tsx`
- Modify: `web/src/features/messages/ui/MessageRow.tsx` (add isAdmin + onPin props)
- Modify: `web/src/features/messages/ui/MessageTimeline.tsx` (pass isAdmin + onPin)
- Modify: `web/src/features/channels/ui/ChannelView.tsx`

**Interfaces:**
- Consumes: `usePinnedMessages`, `usePinMessage`, `useMembers`, `PinnedMessagesBar` from previous tasks

- [ ] **Step 1: Add `isAdmin` + `onPin` to `MessageContextMenu` props**

In `MessageContextMenu.tsx`, extend `Props`:

```typescript
interface Props {
  msg: Message;
  channelId: string;
  currentPubkey: string | null;
  isAdmin?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
  onSave?: () => void;
  onBookmark?: () => void;
}
```

Add to the button list (after `onReply` block, before `isOwn` check):

```tsx
        {isAdmin && !isPinned && onPin && (
          <button
            type="button"
            onClick={onPin}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Pin
          </button>
        )}
        {isAdmin && isPinned && onUnpin && (
          <button
            type="button"
            onClick={onUnpin}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Unpin
          </button>
        )}
```

- [ ] **Step 2: Pass `isAdmin`/`onPin`/`onUnpin`/`isPinned` through `MessageRow`**

In `MessageRow.tsx`, add to the props interface:

```typescript
  isAdmin?: boolean;
  pinnedMessageIds?: Set<string>;
  onPin?: (msg: Message) => void;
  onUnpin?: (eventId: string) => void;
```

Pass them into the `MessageContextMenu` call inside MessageRow:

```tsx
<MessageContextMenu
  msg={msg}
  channelId={channelId}
  currentPubkey={currentPubkey}
  isAdmin={isAdmin}
  isPinned={pinnedMessageIds?.has(msg.id)}
  onPin={onPin ? () => onPin(msg) : undefined}
  onUnpin={onUnpin ? () => onUnpin(msg.id) : undefined}
  onEdit={...}
  // ... rest unchanged
/>
```

- [ ] **Step 3: Pass through `MessageTimeline`**

In `MessageTimeline.tsx`, add the same four props to its own interface, then forward them to each `MessageRow`.

- [ ] **Step 4: Wire everything in `ChannelView.tsx`**

Add imports:

```typescript
import { useMembers } from "@/features/channels/useMembers";
import { usePinnedMessages } from "@/features/messages/pinning/usePinnedMessages";
import { usePinMessage } from "@/features/messages/pinning/usePinMessage";
import { PinnedMessagesBar } from "@/features/messages/pinning/PinnedMessagesBar";
```

Inside `ChannelView()`, add:

```typescript
  const members = useMembers(channelId);
  const isCurrentUserAdmin =
    currentPubkey !== null &&
    members.some((m) => m.pubkey === currentPubkey && m.role === "admin");

  const pins = usePinnedMessages(channelId);
  const { pin, unpin } = usePinMessage(channelId, pins);
  const pinnedMessageIds = new Set(pins.map((p) => p.eventId));

  const [highlightId, setHighlightId] = useState<string | null>(null);
```

Add a `handleJumpTo` callback:

```typescript
  const handleJumpTo = useCallback((eventId: string) => {
    setHighlightId(eventId);
    // Scroll to the message — the timeline renders a ref per message keyed by id.
    // Use a data attribute to find and scroll into view.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-message-id="${eventId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);
```

In the JSX, mount `PinnedMessagesBar` just above `<MessageTimeline>`:

```tsx
            <PinnedMessagesBar
              pins={pins}
              isAdmin={isCurrentUserAdmin}
              onJumpTo={handleJumpTo}
              onUnpin={(id) => void unpin(id)}
            />
            <MessageTimeline
              ...
              isAdmin={isCurrentUserAdmin}
              pinnedMessageIds={pinnedMessageIds}
              onPin={(msg) => void pin(msg.id, currentPubkey ?? "", msg.content)}
              onUnpin={(id) => void unpin(id)}
            />
```

- [ ] **Step 5: Add `data-message-id` attribute to MessageRow**

In `MessageRow.tsx`, add to the outermost div:

```tsx
data-message-id={msg.id}
```

- [ ] **Step 6: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add web/src/features/messages/ui/MessageContextMenu.tsx \
        web/src/features/messages/ui/MessageRow.tsx \
        web/src/features/messages/ui/MessageTimeline.tsx \
        web/src/features/channels/ui/ChannelView.tsx
git commit -m "feat(web): wire message pinning — context menu, PinnedMessagesBar, ChannelView"
```

---

### Task 6: Desktop — pinning hooks + `PinnedMessagesBar`

**Files:**
- Create: `desktop/src/features/messages/pinning/usePinnedMessages.ts`
- Create: `desktop/src/features/messages/pinning/usePinMessage.ts`
- Create: `desktop/src/features/messages/pinning/PinnedMessagesBar.tsx`

**Interfaces:**
- Consumes: `relayClient.subscribe`, `signRelayEvent`, `relayClient.publishEvent`
- Produces: same public API as web equivalents

- [ ] **Step 1: Create `usePinnedMessages.ts`**

```typescript
// desktop/src/features/messages/pinning/usePinnedMessages.ts
import { useEffect, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import type { PinnedMessage } from "./types";

export function usePinnedMessages(channelId: string | null): PinnedMessage[] {
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  useEffect(() => {
    if (!channelId) return;
    const unsub = relayClient.subscribe(
      { kinds: [30078], "#d": [`pins:${channelId}`] },
      (raw) => {
        try {
          const parsed = JSON.parse(raw.content as string) as { pins: PinnedMessage[] };
          setPins(parsed.pins ?? []);
        } catch {
          setPins([]);
        }
      },
    );
    return () => {
      unsub();
      setPins([]);
    };
  }, [channelId]);

  return pins;
}
```

- [ ] **Step 2: Create `usePinMessage.ts`**

```typescript
// desktop/src/features/messages/pinning/usePinMessage.ts
import { useCallback } from "react";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";
import type { PinnedMessage } from "./types";

export function usePinMessage(channelId: string | null, currentPins: PinnedMessage[]) {
  const publish = useCallback(
    async (newPins: PinnedMessage[]) => {
      if (!channelId) return;
      const event = await signRelayEvent({
        kind: 30078,
        content: JSON.stringify({ pins: newPins }),
        tags: [["d", `pins:${channelId}`]],
      });
      await relayClient.publishEvent(event, "Timed out pinning message.", "Failed to pin message.");
    },
    [channelId],
  );

  const pin = useCallback(
    async (eventId: string, pinnedBy: string, content?: string) => {
      if (currentPins.some((p) => p.eventId === eventId)) return;
      const newPins: PinnedMessage[] = [
        ...currentPins,
        { eventId, pinnedBy, pinnedAt: Math.floor(Date.now() / 1000), content },
      ];
      await publish(newPins);
    },
    [currentPins, publish],
  );

  const unpin = useCallback(
    async (eventId: string) => {
      await publish(currentPins.filter((p) => p.eventId !== eventId));
    },
    [currentPins, publish],
  );

  return { pin, unpin };
}
```

- [ ] **Step 3: Create `PinnedMessagesBar.tsx`**

```tsx
// desktop/src/features/messages/pinning/PinnedMessagesBar.tsx
import { useState } from "react";
import { Pin, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { PinnedMessage } from "./types";

interface Props {
  pins: PinnedMessage[];
  isAdmin: boolean;
  onJumpTo: (eventId: string) => void;
  onUnpin: (eventId: string) => void;
}

export function PinnedMessagesBar({ pins, isAdmin, onJumpTo, onUnpin }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (pins.length === 0) return null;

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
      >
        <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {pins.length} pinned {pins.length === 1 ? "message" : "messages"}
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-border/50">
          {pins.map((pin) => (
            <div key={pin.eventId} className="flex items-center gap-2 px-3 py-1.5">
              <p className="min-w-0 flex-1 truncate text-xs text-foreground/70">
                {pin.content ?? "Message"}
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onJumpTo(pin.eventId)}>
                Jump
              </Button>
              {isAdmin && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={() => onUnpin(pin.eventId)}>
                  Unpin
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/messages/pinning/
git commit -m "feat(desktop): add usePinnedMessages, usePinMessage, PinnedMessagesBar"
```

---

### Task 7: Desktop — wire into channel view + message action bar

**Files:**
- Modify: desktop ChannelView equivalent (search for where `MessageTimeline` or `MessageList` is rendered in desktop)
- Modify: desktop `MessageRow.tsx` (add pin action to action bar)

- [ ] **Step 1: Find desktop channel view**

```bash
grep -rn "MessageTimeline\|MessageList\|usePinnedMessages" desktop/src/features/channels --include="*.tsx" | head -10
```

- [ ] **Step 2: Wire hooks and bar**

In the found channel view file, add the same pattern as web Task 5 Step 4:

```typescript
import { useMyRelayMembershipQuery } from "@/features/community-members/hooks";
import { usePinnedMessages } from "@/features/messages/pinning/usePinnedMessages";
import { usePinMessage } from "@/features/messages/pinning/usePinMessage";
import { PinnedMessagesBar } from "@/features/messages/pinning/PinnedMessagesBar";

// inside component:
const { data: membership } = useMyRelayMembershipQuery();
const isAdmin = membership?.role === "admin" || membership?.role === "owner";
const pins = usePinnedMessages(channelId);
const { pin, unpin } = usePinMessage(channelId, pins);
const pinnedMessageIds = new Set(pins.map((p) => p.eventId));
```

Mount `<PinnedMessagesBar>` above the message list; pass `handleJumpTo` that scrolls by `data-message-id` attribute (same pattern as web Task 5 Step 4).

- [ ] **Step 3: Add pin action to desktop MessageRow**

In `desktop/src/features/messages/ui/MessageRow.tsx`, find the `MessageActionBar` usage (around line 496). Add pin/unpin to the action bar's actions prop:

```typescript
// Add to MessageRow props:
isAdmin?: boolean;
isPinned?: boolean;
onPin?: () => void;
onUnpin?: () => void;
```

Pass them into the action bar or context menu displayed on hover.

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/
git commit -m "feat(desktop): wire message pinning into channel view and MessageRow"
```
