# Web Workspace UI — Implementation Plan

**Goal:** Replace the repos-only page at `slug.lengrowth.com` with a Slack-like workspace UI (channels sidebar + message timeline + composer), served as a Cloudflare Pages static app. Repos tab stays as one nav item, not the default landing.

**Stack:** React 19 + TanStack Router + TanStack Query + Vite + Tailwind 4 + nostr-tools 2.x. All already present in `web/`.

**Auth model:** NIP-07 browser extension (Alby, nos2x) to sign events. Ephemeral key for read-only browsing. No server session needed — the relay WebSocket is the only backend.

**Relay connection model:** Persistent WebSocket (not close-on-EOSE like the current `queryEvents`). The existing `nostr-client.ts` `queryEvents` is for one-shot reads; a live channels UI needs a persistent subscription with reconnect.

---

## What exists today (don't touch unless noted)

| Path | What it is |
|------|-----------|
| `web/src/shared/lib/nostr-signer.ts` | NIP-07 + ephemeral key signing — **reuse as-is** |
| `web/src/shared/lib/nostr-client.ts` | One-shot `queryEvents` — **keep, extend** |
| `web/src/shared/lib/workspace.ts` | `extractSlug()` + `fetchWorkspace()` — **reuse** |
| `web/src/shared/lib/workspace-context.tsx` | `WorkspaceProvider` + `useWorkspace()` — **reuse** |
| `web/src/shared/lib/relay-url.ts` | `relayWsUrl()` from env/hostname — **reuse** |
| `web/src/app/routes/repos.tsx` | Repos tab — **keep, move to /repos route** |
| `web/src/features/repos/` | Entire repos feature — **keep** |
| `web/wrangler.jsonc` | Cloudflare Pages config — **keep** |
| `desktop/src/shared/constants/kinds.ts` | Event kind constants — **copy verbatim** |
| `desktop/src/shared/api/relayChannelFilters.ts` | REQ filter builders — **copy and adapt** |

## What needs to be built

| Phase | What | Files to create |
|-------|------|-----------------|
| 0 | Pre-work: inspect relay NIP-11 + update fetchWorkspace | `web/src/shared/lib/workspace.ts` (update) |
| 1 | Persistent relay client (WebSocket + reconnect + subscriptions) | `web/src/shared/lib/relay-live-client.ts` |
| 2 | Copy event kind constants | `web/src/shared/constants/kinds.ts` |
| 3 | Channel list hook (NIP-29 group list from relay) | `web/src/features/channels/use-channels.ts` |
| 4 | Message timeline hook (live + history) | `web/src/features/messages/use-messages.ts` |
| 5 | Workspace shell layout | `web/src/features/workspace/ui/WorkspaceShell.tsx` |
| 6 | Channels sidebar UI | `web/src/features/channels/ui/ChannelsSidebar.tsx` |
| 7 | Message timeline UI | `web/src/features/messages/ui/MessageTimeline.tsx` |
| 8 | Message composer UI | `web/src/features/messages/ui/MessageComposer.tsx` |
| 9 | Auth / error states | `web/src/features/auth/ui/AuthGate.tsx` |
| 10 | Routing restructure | `web/src/app/routes/` (multiple files) |
| 11 | Wire everything + test | Integration |
| 12 | Profile names (optional) | `web/src/features/profiles/use-profile.ts` |

---

## Phase 0 — Pre-work: Bootstrap Source for community_id

**ALREADY INVESTIGATED — do not repeat this research.**

### What was discovered

`acmen-teste.lengrowth.com` returns Cloudflare Pages HTML — it is NOT proxied to the relay.

`relay.lengrowth.com` NIP-11 response (confirmed):
```json
{
  "name": "LenOS Relay",
  "description": "LenOS — private team communication relay",
  "supported_nips": [1,2,10,11,16,17,23,25,29,33,38,42,50,56],
  "limitation": { "auth_required": true, "restricted_writes": true },
  "self": "f4d614f87e7b222110f671dc05c5a691549c1789941f4536e30e848c94d2d15b"
}
```

**No `community_id` in NIP-11.** The relay is shared across all communities — community identity is not in relay metadata.

The `relay_community_id` UUID lives in LenGrowth MongoDB (`lenos_workspaces` collection). The existing `GET /workspace` endpoint returns it but requires a Supabase JWT. A visitor to `slug.lengrowth.com` does not have one.

### Solution already implemented

A public unauthenticated endpoint was added to the LenGrowth backend (`LenGrowth/backend/routes/lenos_workspace.py`, already committed and deployed):

```
GET https://growth-api.lenquant.com/public/workspace/{slug}
```

Response 200:
```json
{
  "slug": "acmen-teste",
  "relay_community_id": "<uuid>",
  "relay_url": "wss://relay.lengrowth.com"
}
```

Response 404 when slug unknown: `{ "detail": "Workspace not found" }`

### Update `web/src/shared/lib/workspace.ts`

Replace the entire `fetchWorkspace` function. Current version calls relay NIP-11 and returns `communityId: ""`. Replace with:

```typescript
const LENGROWTH_API = "https://growth-api.lenquant.com";

export async function fetchWorkspace(slug: string): Promise<WorkspaceInfo> {
  const response = await fetch(
    `${LENGROWTH_API}/public/workspace/${encodeURIComponent(slug)}`,
    { signal: AbortSignal.timeout(8_000) },
  );

  if (response.status === 404) throw new WorkspaceNotFoundError(slug);
  if (!response.ok) throw new WorkspaceNotFoundError(slug);

  const data = await response.json() as {
    slug: string;
    relay_community_id: string;
    relay_url: string;
  };

  return { slug: data.slug, communityId: data.relay_community_id };
}
```

Also remove the `relayHttpBaseUrl` import from the top of `workspace.ts` if it's no longer used after this change.

### Fix `web/src/shared/lib/relay-url.ts`

Current `relayWsUrl()` derives the relay URL from `window.location.host` — which is `acmen-teste.lengrowth.com` (the Cloudflare Pages app), NOT the relay. Fix it to always use the known relay URL:

```typescript
export function relayWsUrl(): string {
  return import.meta.env.VITE_RELAY_URL ?? "wss://relay.lengrowth.com";
}
```

Verify `web/.env.production` already contains:
```
VITE_RELAY_URL=wss://relay.lengrowth.com
```

**Phase 0 is complete. Proceed to Phase 1.**

---

## Phase 1 — Persistent Relay Client

**File to create:** `web/src/shared/lib/relay-live-client.ts`

**Why a new file:** The existing `nostr-client.ts` `queryEvents` opens a WebSocket, collects events until EOSE, then closes. That is fine for one-shot reads (repos list). A channels UI needs a WebSocket that stays open, delivers events as they arrive, and reconnects when dropped. This is a fundamentally different pattern — do not modify `queryEvents`, create a separate module.

**Reference from desktop:** `desktop/src/shared/api/relayClientSession.ts` lines 547–561 show the NIP-42 AUTH challenge/response pattern. The desktop version uses `invoke("plugin:websocket|connect")` — that is Tauri-only. Replace it with `new WebSocket(url)` for the browser.

**Create the file with this exact content:**

```typescript
// web/src/shared/lib/relay-live-client.ts

import { signNostrEvent } from "./nostr-signer";
import { makeAuthEvent } from "nostr-tools/nip42";

export interface Subscription {
  id: string;
  filter: Record<string, unknown>;
  onEvent: (event: Record<string, unknown>) => void;
  onEose?: () => void;
}

class RelayLiveClient {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Subscription>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private destroyed = false;
  private authenticated = false;

  constructor(private readonly relayUrl: string) {}

  connect(): void {
    if (this.ws) return;
    this.authenticated = false;
    const ws = new WebSocket(this.relayUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 1_000;
      // Re-subscribe after reconnect (AUTH will re-trigger sendAllSubs)
    });

    ws.addEventListener("message", async (evt) => {
      let msg: unknown;
      try { msg = JSON.parse(String(evt.data)); } catch { return; }
      if (!Array.isArray(msg)) return;

      const [type] = msg as [string, ...unknown[]];

      if (type === "AUTH" && typeof msg[1] === "string") {
        const challenge = msg[1] as string;
        const template = makeAuthEvent(this.relayUrl, challenge);
        try {
          const signed = await signNostrEvent(template);
          ws.send(JSON.stringify(["AUTH", signed]));
        } catch {
          // No NIP-07 — continue as read-only
          this.sendAllSubs(ws);
        }
        return;
      }

      if (type === "OK" && !this.authenticated) {
        // AUTH response — now send all pending subscriptions
        this.authenticated = true;
        this.sendAllSubs(ws);
        return;
      }

      if (type === "EVENT" && typeof msg[1] === "string") {
        const subId = msg[1] as string;
        const sub = this.subs.get(subId);
        if (sub && msg[2]) sub.onEvent(msg[2] as Record<string, unknown>);
        return;
      }

      if (type === "EOSE" && typeof msg[1] === "string") {
        const sub = this.subs.get(msg[1] as string);
        sub?.onEose?.();
        return;
      }
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.authenticated = false;
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => ws.close());
  }

  subscribe(sub: Subscription): () => void {
    this.subs.set(sub.id, sub);
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(JSON.stringify(["REQ", sub.id, sub.filter]));
    }
    return () => this.unsubscribe(sub.id);
  }

  unsubscribe(id: string): void {
    this.subs.delete(id);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(["CLOSE", id]));
    }
  }

  publish(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(["EVENT", event]));
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private sendAllSubs(ws: WebSocket): void {
    for (const sub of this.subs.values()) {
      ws.send(JSON.stringify(["REQ", sub.id, sub.filter]));
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    }, this.reconnectDelay);
  }
}

const clients = new Map<string, RelayLiveClient>();

export function getRelayClient(relayUrl: string): RelayLiveClient {
  let client = clients.get(relayUrl);
  if (!client) {
    client = new RelayLiveClient(relayUrl);
    client.connect();
    clients.set(relayUrl, client);
  }
  return client;
}
```

**Verify Phase 1 works** before continuing. Open browser DevTools at `acmen-teste.lengrowth.com`, paste in console:

```js
// Only works after running pnpm dev and opening the app
// Check WebSocket tab in Network — you should see wss://relay.lengrowth.com upgrade + messages
```

Or add a temporary `console.log` inside `onEvent` in a test component.

---

## Phase 2 — Copy Event Kind Constants

**File to copy:** `desktop/src/shared/constants/kinds.ts`  
**Destination:** `web/src/shared/constants/kinds.ts`

Copy the file verbatim. It has zero imports, is pure TypeScript constants, and is 100% browser-compatible.

Do not modify it. If kinds change in the future, update both files.

---

## Phase 3 — Channel List Hook

**File to create:** `web/src/features/channels/use-channels.ts`

**How channels work in LenOS:** Channels are NIP-29 groups. Each group has a metadata event of kind `39000`. The relay stores one per channel. The `d` tag value is the channel's unique id. The `name` tag (or `n` tag) is the display name. All groups in a community are tagged with `#h: [communityId]`.

**Reference:** `desktop/src/shared/api/relayChannelFilters.ts` — look at how `#h` filter is used. `desktop/src/features/channels/ui/ChannelPane.tsx` — shows how channel id flows into the message subscription.

**Create the file:**

```typescript
// web/src/features/channels/use-channels.ts

import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface Channel {
  id: string;        // NIP-29 group id = d-tag value
  name: string;
  description: string;
  picture?: string;
  createdAt: number;
}

export function useChannels(communityId: string | null): Channel[] {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!communityId) return;

    const client = getRelayClient(relayWsUrl());
    const subId = `channels-${communityId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: [39000],
        "#h": [communityId],
        limit: 200,
      },
      onEvent: (raw) => {
        const event = raw as {
          id: string;
          created_at: number;
          tags: string[][];
        };
        const tags = event.tags ?? [];
        const dTag = tags.find(t => t[0] === "d")?.[1] ?? "";
        if (!dTag) return;
        const name =
          tags.find(t => t[0] === "name")?.[1] ??
          tags.find(t => t[0] === "n")?.[1] ??
          dTag;
        const description = tags.find(t => t[0] === "about")?.[1] ?? "";
        const picture = tags.find(t => t[0] === "picture")?.[1];

        setChannels(prev => {
          const filtered = prev.filter(c => c.id !== dTag);
          return [...filtered, {
            id: dTag,
            name,
            description,
            picture,
            createdAt: event.created_at,
          }].sort((a, b) => a.name.localeCompare(b.name));
        });
      },
    });

    return () => {
      unsub();
      setChannels([]);
    };
  }, [communityId]);

  return channels;
}
```

**Debug tip:** If `channels` is empty, check:
1. Is `communityId` a non-empty string? (Phase 0 must be done first)
2. Does the relay return kind 39000 events? Run `queryEvents` in console with `{ kinds: [39000], limit: 10 }` to verify.

---

## Phase 4 — Message Timeline Hook

**File to create:** `web/src/features/messages/use-messages.ts`

**How messages work:** Channel messages use kinds 9 (stream message) and 40002 (stream message v2). Both are tagged with `#h: [channelId]` where `channelId` is the NIP-29 group id from Phase 3. History is fetched via the existing `queryEvents` (one-shot, closes after EOSE). Live messages come via `relay-live-client` persistent subscription. Both are merged and deduplicated by event id.

**The `channelId` here is the NIP-29 group `d` tag value** — same as `Channel.id` from Phase 3. It is NOT the `communityId`.

**Create the file:**

```typescript
// web/src/features/messages/use-messages.ts

import { useEffect, useState, useRef, useCallback } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryEvents } from "@/shared/lib/nostr-client";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";

export interface Message {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  kind: number;
  tags: string[][];
}

const HISTORY_KINDS = [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2, KIND_SYSTEM_MESSAGE];
const HISTORY_LIMIT = 50;

export function useMessages(channelId: string | null): {
  messages: Message[];
  isLoading: boolean;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const seen = useRef(new Set<string>());

  const addEvent = useCallback((raw: Record<string, unknown>) => {
    const id = raw.id as string;
    if (!id || seen.current.has(id)) return;
    seen.current.add(id);
    const msg: Message = {
      id,
      pubkey: raw.pubkey as string ?? "",
      content: raw.content as string ?? "",
      createdAt: raw.created_at as number ?? 0,
      kind: raw.kind as number ?? 9,
      tags: raw.tags as string[][] ?? [],
    };
    setMessages(prev =>
      [...prev, msg].sort((a, b) => a.createdAt - b.createdAt)
    );
  }, []);

  // History (one-shot fetch)
  useEffect(() => {
    if (!channelId) return;
    seen.current.clear();
    setMessages([]);
    setIsLoading(true);

    queryEvents(relayWsUrl(), {
      kinds: HISTORY_KINDS,
      "#h": [channelId],
      limit: HISTORY_LIMIT,
    })
      .then(events => { for (const e of events) addEvent(e as Record<string, unknown>); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [channelId, addEvent]);

  // Live subscription (persistent)
  useEffect(() => {
    if (!channelId) return;
    const since = Math.floor(Date.now() / 1000) - 10; // 10s overlap with history
    const subId = `msgs-${channelId}`;
    const client = getRelayClient(relayWsUrl());

    const unsub = client.subscribe({
      id: subId,
      filter: {
        kinds: HISTORY_KINDS,
        "#h": [channelId],
        since,
      },
      onEvent: addEvent,
    });

    return unsub;
  }, [channelId, addEvent]);

  return { messages, isLoading };
}
```

---

## Phase 5 — Workspace Shell Layout

**File to create:** `web/src/features/workspace/ui/WorkspaceShell.tsx`

**What it does:** 2-column layout. Left = 240px fixed sidebar (channels list). Right = flexible main pane (message timeline + composer). Dark mode aware.

```tsx
// web/src/features/workspace/ui/WorkspaceShell.tsx

interface Props {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function WorkspaceShell({ sidebar, children }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1a1a1a]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-black/10 dark:border-white/10 overflow-hidden">
        {sidebar}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

---

## Phase 6 — Channels Sidebar UI

**File to create:** `web/src/features/channels/ui/ChannelsSidebar.tsx`

**Reference:** `desktop/src/features/sidebar/ui/SidebarSection.tsx` and `AppSidebar.tsx`. Web version is simpler: flat list, no drag-and-drop, no sections management.

**This component receives `activeChannelId` and `onSelectChannel` as props** — active channel is owned by the route (URL param), not by this component.

```tsx
// web/src/features/channels/ui/ChannelsSidebar.tsx

import { Hash } from "lucide-react";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";

interface Props {
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelsSidebar({ activeChannelId, onSelectChannel }: Props) {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const workspace = useWorkspace();

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <div className="flex h-full flex-col">
      {/* Workspace name header */}
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="truncate font-semibold text-black dark:text-white">
          {workspaceName}
        </span>
      </div>

      {/* Channels section */}
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-1 px-4 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          Channels
        </div>

        {channels.length === 0 && (
          <div className="px-4 py-2 text-sm text-black/40 dark:text-white/40">
            No channels yet
          </div>
        )}

        {channels.map(ch => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onSelectChannel(ch.id)}
            className={[
              "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
              activeChannelId === ch.id
                ? "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white"
                : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5",
            ].join(" ")}
          >
            <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
```

---

## Phase 7 — Message Timeline UI

**File to create:** `web/src/features/messages/ui/MessageTimeline.tsx`

**Reference:** `desktop/src/features/messages/ui/MessageTimeline.tsx` and `MessageRow.tsx`. The desktop version uses Virtua for virtualized scrolling. For web v1 use plain `overflow-y-auto` — virtualization can be added later once the rest works.

**Key behaviors:**
- Group consecutive messages from the same author within 5 minutes (don't repeat avatar/name)
- Auto-scroll to bottom when new messages arrive
- `truncatePubkey` already in `web/src/shared/lib/pubkey.ts` — import and use it
- `relativeTime` already in `web/src/shared/lib/relative-time.ts` — import and use it
- Skip rendering `kind: 40099` system messages as normal text rows (render differently or skip for v1)

```tsx
// web/src/features/messages/ui/MessageTimeline.tsx

import { useEffect, useRef } from "react";
import type { Message } from "@/features/messages/use-messages";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import { KIND_SYSTEM_MESSAGE } from "@/shared/constants/kinds";

interface Props {
  messages: Message[];
  isLoading: boolean;
  channelName: string;
}

const GROUP_GAP_SECONDS = 300; // 5 minutes

export function MessageTimeline({ messages, isLoading, channelName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="space-y-3 w-full max-w-2xl px-6">
          {[1,2,3].map(i => (
            <div key={i} className="animate-pulse space-y-1">
              <div className="h-4 w-32 rounded bg-black/10 dark:bg-white/10" />
              <div className="h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-black dark:text-white">
            # {channelName}
          </p>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            No messages yet. Be the first to say something.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
      {messages.map((msg, i) => {
        // System messages (join/leave/channel-created)
        if (msg.kind === KIND_SYSTEM_MESSAGE) {
          return (
            <div key={msg.id} className="my-1 text-center text-xs text-black/40 dark:text-white/30">
              {msg.content}
            </div>
          );
        }

        const prev = messages[i - 1];
        const isGrouped =
          prev &&
          prev.pubkey === msg.pubkey &&
          prev.kind !== KIND_SYSTEM_MESSAGE &&
          msg.createdAt - prev.createdAt < GROUP_GAP_SECONDS;

        return (
          <div key={msg.id} className={isGrouped ? "pl-0" : "mt-4"}>
            {!isGrouped && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-semibold text-sm text-black dark:text-white">
                  {truncatePubkey(msg.pubkey)}
                </span>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {relativeTime(msg.createdAt * 1000)}
                </span>
              </div>
            )}
            <p className="text-sm leading-relaxed text-black/90 dark:text-white/85 whitespace-pre-wrap break-words">
              {msg.content}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

---

## Phase 8 — Message Composer

**File to create:** `web/src/features/messages/ui/MessageComposer.tsx`

**Sending a message:** Publish a kind 9 event with `content = text` and `tags: [["h", channelId]]`. Sign with `signNostrEvent({ requireNip07: true })`. Publish via `getRelayClient(relayWsUrl()).publish(signed)`.

**Shift+Enter = newline. Enter = send.**

```tsx
// web/src/features/messages/ui/MessageComposer.tsx

import { useState, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import {
  signNostrEvent,
  Nip07UnavailableError,
  hasNip07Provider,
} from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_STREAM_MESSAGE } from "@/shared/constants/kinds";

interface Props {
  channelId: string;
  channelName: string;
}

export function MessageComposer({ channelId, channelName }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    try {
      const signed = await signNostrEvent(
        {
          kind: KIND_STREAM_MESSAGE,
          content: trimmed,
          tags: [["h", channelId]],
        },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      setText("");
      textareaRef.current?.focus();
    } catch (err) {
      if (err instanceof Nip07UnavailableError) {
        setError(
          "Install a Nostr browser extension (Alby or nos2x) to send messages.",
        );
      } else {
        setError("Failed to send. Try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
      {error && (
        <p className="mb-2 text-xs text-red-500">{error}</p>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 dark:border-white/15 dark:bg-white/5 focus-within:border-black/30 dark:focus-within:border-white/30">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message #${channelName}`}
          disabled={sending}
          className="flex-1 resize-none bg-transparent text-sm text-black outline-none dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 disabled:opacity-50"
          style={{ maxHeight: "200px", overflowY: "auto" }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-md p-1.5 text-black/60 hover:bg-black/5 hover:text-black disabled:opacity-30 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      {!hasNip07Provider() && (
        <p className="mt-1 text-xs text-black/40 dark:text-white/40">
          Read-only mode — install{" "}
          <a href="https://getalby.com" target="_blank" rel="noreferrer" className="underline">
            Alby
          </a>{" "}
          or{" "}
          <a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noreferrer" className="underline">
            nos2x
          </a>{" "}
          to send messages
        </p>
      )}
    </div>
  );
}
```

---

## Phase 9 — Auth / Error States

**File to create:** `web/src/features/auth/ui/WorkspaceErrorView.tsx`

**Handles:** workspace not found, relay error, loading state.

```tsx
// web/src/features/auth/ui/WorkspaceErrorView.tsx

interface NotFoundProps { slug: string; }
interface ErrorProps { message: string; }

export function WorkspaceNotFound({ slug }: NotFoundProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="text-center max-w-sm px-6">
        <h1 className="text-xl font-semibold text-black dark:text-white">
          Workspace not found
        </h1>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          No workspace at <strong>{slug}.lengrowth.com</strong>.
        </p>
        <a
          href="https://lengrowth.com"
          className="mt-4 inline-block text-sm text-black underline dark:text-white"
        >
          Go to LenGrowth
        </a>
      </div>
    </div>
  );
}

export function WorkspaceLoadError({ message }: ErrorProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="text-center max-w-sm px-6">
        <h1 className="text-xl font-semibold text-black dark:text-white">
          Could not load workspace
        </h1>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">{message}</p>
      </div>
    </div>
  );
}

export function WorkspaceLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/20 border-t-black dark:border-white/20 dark:border-t-white" />
    </div>
  );
}
```

---

## Phase 10 — Routing Restructure

**Overview:** TanStack Router file-based routing. A file named `_layout.tsx` creates a pathless layout route — children render inside it without adding a path segment. All files prefixed `_layout.` are children of that layout.

**Target file tree for `web/src/app/routes/`:**

```
routes/
  __root.tsx                          ← minimal, renders <Outlet />
  _workspace.tsx                      ← NEW: layout route — renders WorkspaceShell when on subdomain
  _workspace.channels.tsx             ← NEW: /channels (index — redirects to first channel)
  _workspace.channels.$channelId.tsx  ← NEW: /channels/:channelId
  _workspace.repos.tsx                ← NEW: /repos inside workspace layout
  index.tsx                           ← UPDATE: redirect to /channels on subdomain
  invite.$code.tsx                    ← existing, no change
  repos.$repoId.tsx                   ← existing, no change
  repos.$repoId.blob.$.tsx            ← existing, no change
```

**Step 10a — Update `web/src/app/routes/index.tsx`:**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { extractSlug } from "@/shared/lib/workspace";
import { ReposPage } from "@/features/repos/ui/ReposPage";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (extractSlug()) {
      throw redirect({ to: "/channels" });
    }
  },
  component: ReposPage,
});
```

**Step 10b — Create `web/src/app/routes/_workspace.tsx` (pathless layout):**

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { WorkspaceShell } from "@/features/workspace/ui/WorkspaceShell";
import { ChannelsSidebar } from "@/features/channels/ui/ChannelsSidebar";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useWorkspace } from "@/shared/lib/workspace-context";
import { WorkspaceNotFound, WorkspaceLoadError, WorkspaceLoading } from "@/features/auth/ui/WorkspaceErrorView";

function WorkspaceLayout() {
  const workspace = useWorkspace();
  const navigate = useNavigate();

  // Try to get channelId from URL params (will be undefined on /channels index)
  const params = useParams({ strict: false }) as { channelId?: string };
  const activeChannelId = params.channelId ?? null;

  if (workspace.status === "loading") return <WorkspaceLoading />;
  if (workspace.status === "not_found") return <WorkspaceNotFound slug={workspace.slug} />;
  if (workspace.status === "error") return <WorkspaceLoadError message={workspace.error.message} />;
  if (workspace.status === "no_subdomain") return <Outlet />; // root domain, no shell

  return (
    <WorkspaceShell
      sidebar={
        <ChannelsSidebar
          activeChannelId={activeChannelId}
          onSelectChannel={id => void navigate({ to: "/channels/$channelId", params: { channelId: id } })}
        />
      }
    >
      <Outlet />
    </WorkspaceShell>
  );
}

export const Route = createFileRoute("/_workspace")({
  component: WorkspaceLayout,
});
```

**Step 10c — Create `web/src/app/routes/_workspace.channels.tsx`:**

```tsx
import { createFileRoute } from "@tanstack/react-router";

function ChannelsIndex() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-black/40 dark:text-white/40">
      Select a channel to start messaging
    </div>
  );
}

export const Route = createFileRoute("/_workspace/channels")({
  component: ChannelsIndex,
});
```

**Step 10d — Create `web/src/features/channels/ui/ChannelView.tsx`:**

```tsx
// web/src/features/channels/ui/ChannelView.tsx

import { useParams } from "@tanstack/react-router";
import { useMessages } from "@/features/messages/use-messages";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";

export function ChannelView() {
  const { channelId } = useParams({ from: "/_workspace/channels/$channelId" });
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const { messages, isLoading } = useMessages(channelId);

  const channel = channels.find(c => c.id === channelId);
  const channelName = channel?.name ?? channelId;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Channel header */}
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          # {channelName}
        </span>
        {channel?.description && (
          <span className="ml-3 text-sm text-black/50 dark:text-white/40 truncate">
            {channel.description}
          </span>
        )}
      </div>

      {/* Messages */}
      <MessageTimeline
        messages={messages}
        isLoading={isLoading}
        channelName={channelName}
      />

      {/* Composer */}
      <MessageComposer channelId={channelId} channelName={channelName} />
    </div>
  );
}
```

**Step 10e — Create `web/src/app/routes/_workspace.channels.$channelId.tsx`:**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ChannelView } from "@/features/channels/ui/ChannelView";

export const Route = createFileRoute("/_workspace/channels/$channelId")({
  component: ChannelView,
});
```

**Step 10f — Create `web/src/app/routes/_workspace.repos.tsx`:**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ReposPage } from "@/features/repos/ui/ReposPage";

export const Route = createFileRoute("/_workspace/repos")({
  component: ReposPage,
});
```

---

## Phase 11 — Wire and Test

After all phases complete, run:

```bash
cd web
pnpm dev
```

Open `localhost:5173` (or the port Vite assigns). To test workspace mode locally, either:
- Set `VITE_RELAY_URL=wss://relay.lengrowth.com` in `web/.env.local`
- Navigate to `http://acmen-teste.lengrowth.com` in production after deploy

**Local dev testing without a real subdomain:** Add to `web/src/shared/lib/workspace.ts` `extractSlug()` a dev override:

```typescript
// Temporary: allow ?slug=xxx in dev for local testing
if (import.meta.env.DEV) {
  const devSlug = new URLSearchParams(window.location.search).get("slug");
  if (devSlug) return devSlug;
}
```

Then open `http://localhost:5173?slug=acmen-teste` to test workspace mode locally.

**Checklist before deploying:**
- [ ] WebSocket connects to relay (check Network tab, WS frame)
- [ ] Channel list renders (at least one channel visible in sidebar)
- [ ] Clicking a channel loads messages
- [ ] Message composer visible at bottom
- [ ] Sending a message (with Alby/nos2x) adds it to timeline
- [ ] Refresh preserves active channel (URL-based routing)
- [ ] Repos tab still works at `/repos`

**Deploy:**

```bash
cd web
pnpm build
npx wrangler pages deploy dist --project-name lenos
```

---

## Phase 12 — Profile Display (optional, do after v1 ships)

**File to create:** `web/src/features/profiles/use-profile.ts`

Nostr profile = kind 0 event. Fetch per pubkey, cache in module-level Map.

```typescript
// web/src/features/profiles/use-profile.ts

import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useEffect, useState } from "react";

interface Profile {
  name: string;
  picture?: string;
  about?: string;
}

const cache = new Map<string, Profile | null>();
const pending = new Set<string>();

export function useProfile(pubkey: string): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(cache.get(pubkey) ?? null);

  useEffect(() => {
    if (cache.has(pubkey) || pending.has(pubkey)) return;
    pending.add(pubkey);

    queryEvents(relayWsUrl(), { kinds: [0], authors: [pubkey], limit: 1 })
      .then(events => {
        if (events.length > 0) {
          try {
            const data = JSON.parse(events[0].content);
            const p: Profile = { name: data.name ?? data.display_name ?? "", picture: data.picture };
            cache.set(pubkey, p);
            setProfile(p);
          } catch {
            cache.set(pubkey, null);
          }
        } else {
          cache.set(pubkey, null);
        }
      })
      .catch(() => cache.set(pubkey, null))
      .finally(() => pending.delete(pubkey));
  }, [pubkey]);

  return profile;
}
```

Replace `truncatePubkey(msg.pubkey)` in `MessageTimeline.tsx` with:

```tsx
const profile = useProfile(msg.pubkey);
// ...
<span>{profile?.name || truncatePubkey(msg.pubkey)}</span>
```

---

## Summary

| Phase | Output | Blocking next? |
|-------|--------|---------------|
| 0 | Real communityId from NIP-11 | Yes — blocks 3,4,5 |
| 1 | `relay-live-client.ts` | Yes — blocks 3,4 |
| 2 | `kinds.ts` | Yes — blocks 3,4 |
| 3 | `use-channels.ts` | Yes — blocks 6 |
| 4 | `use-messages.ts` | Yes — blocks 7,8 |
| 5 | `WorkspaceShell.tsx` | Yes — blocks 10 |
| 6 | `ChannelsSidebar.tsx` | Yes — blocks 10 |
| 7 | `MessageTimeline.tsx` | Yes — blocks 10 |
| 8 | `MessageComposer.tsx` | Yes — blocks 10 |
| 9 | `WorkspaceErrorView.tsx` | Yes — blocks 10 |
| 10 | Routing restructure | Yes — final wiring |
| 11 | Test + deploy | No |
| 12 | Profile names | No — optional |

**Total new files:** 13 new files, 3 files updated (`workspace.ts`, `index.tsx`, `__root.tsx`). No deletions. Repos feature untouched.
