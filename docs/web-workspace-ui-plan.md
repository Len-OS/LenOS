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

## ✅ Phase 0 — Pre-work: Bootstrap Source for community_id

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

**Deviations:** Also fixed pre-existing lint error in `workspace-context.tsx` (`slug!` → `slug as string`) required by `pnpm check`. Pre-existing format issues in `lenos-download.ts` and `tests/e2e/smoke.spec.ts` auto-fixed by biome formatter.

---

## ✅ Phase 1 — Persistent Relay Client

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

## ✅ Phase 2 — Copy Event Kind Constants

**File to copy:** `desktop/src/shared/constants/kinds.ts`  
**Destination:** `web/src/shared/constants/kinds.ts`

Copy the file verbatim. It has zero imports, is pure TypeScript constants, and is 100% browser-compatible.

Do not modify it. If kinds change in the future, update both files.

---

## ✅ Phase 3 — Channel List Hook

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

## ✅ Phase 4 — Message Timeline Hook

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

## ✅ Phase 5 — Workspace Shell Layout

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

## ✅ Phase 6 — Channels Sidebar UI

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

## ✅ Phase 7 — Message Timeline UI

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

## ✅ Phase 8 — Message Composer

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

## ✅ Phase 9 — Auth / Error States

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

## ✅ Phase 10 — Routing Restructure

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

**Deviations:**
- Project uses **virtual file routes** (`routes.ts` + `routeTree.gen.ts`), not auto-discovery. Added `layout()` import and a `layout("_workspace.tsx", [...])` block in `routes.ts`. Route files use `createFileRoute("/_workspace/...")` paths matching the virtual config ids.
- Old `repos.tsx` (redirect to `/`) deleted — replaced by `_workspace.repos.tsx` which renders `ReposPage` inside the workspace shell.
- `routeTree.gen.ts` regenerated by running `vite build` before `tsc` (plugin updates the gen file during vite transform phase; running `tsc` alone before vite would error on stale types).
- `relativeTime(msg.createdAt * 1000)` in plan was wrong — function takes seconds, not ms. Used `relativeTime(msg.createdAt)` directly.
- `useEffect([messages.length])` flagged by biome `useExhaustiveDependencies`; used `[messages]` with a `biome-ignore` comment since the scroll trigger is intentional.

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

## ✅ Phase 13 — Avatar Component + Profile Integration

**Goal:** Show real names and avatars in the message timeline instead of truncated pubkeys.

**Desktop references:**
- `desktop/src/shared/ui/Avatar.tsx` — avatar with fallback initials
- `desktop/src/features/messages/ui/MessageRow.tsx` — how profile is wired in

### Files to create

**`web/src/shared/ui/Avatar.tsx`**

```tsx
interface Props {
  src?: string;
  name: string;
  size?: number;
}

export function Avatar({ src, name, size = 32 }: Props) {
  const initial = name.charAt(0).toUpperCase() || "?";
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-xs font-semibold text-black/60 dark:text-white/60"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        initial
      )}
    </div>
  );
}
```

### Update `MessageTimeline.tsx`

Import `useProfile` (Phase 12) and `Avatar`. Replace the author header section:

```tsx
// In the per-message render, for non-grouped messages:
const profile = useProfile(msg.pubkey);
const displayName = profile?.name || truncatePubkey(msg.pubkey);

{!isGrouped && (
  <div className="flex items-start gap-2.5 mb-0.5">
    <Avatar src={profile?.picture} name={displayName} size={32} />
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-sm text-black dark:text-white">{displayName}</span>
        <span className="text-xs text-black/40 dark:text-white/40">{relativeTime(msg.createdAt)}</span>
      </div>
      <p className="text-sm leading-relaxed text-black/90 dark:text-white/85 whitespace-pre-wrap break-words">
        {msg.content}
      </p>
    </div>
  </div>
)}
{isGrouped && (
  <p className="pl-[44px] text-sm leading-relaxed text-black/90 dark:text-white/85 whitespace-pre-wrap break-words">
    {msg.content}
  </p>
)}
```

**Note:** `useProfile` at the top of `MessageTimeline` won't work because hooks can't be called inside `.map()`. Extract a `MessageRow` component instead, so each row can call `useProfile(msg.pubkey)` at its own top level.

**`web/src/features/messages/ui/MessageRow.tsx`**

```tsx
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Message } from "@/features/messages/use-messages";

interface Props {
  msg: Message;
  isGrouped: boolean;
}

export function MessageRow({ msg, isGrouped }: Props) {
  const profile = useProfile(msg.pubkey);
  const displayName = profile?.name || truncatePubkey(msg.pubkey);

  return (
    <div className={isGrouped ? "pl-[44px]" : "mt-4 flex items-start gap-2.5"}>
      {!isGrouped && <Avatar src={profile?.picture} name={displayName} size={32} />}
      <div className={isGrouped ? "" : "min-w-0 flex-1"}>
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-semibold text-sm text-black dark:text-white">{displayName}</span>
            <span className="text-xs text-black/40 dark:text-white/40">{relativeTime(msg.createdAt)}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed text-black/90 dark:text-white/85 whitespace-pre-wrap break-words">
          {msg.content}
        </p>
      </div>
    </div>
  );
}
```

Replace the per-message render in `MessageTimeline.tsx` with `<MessageRow msg={msg} isGrouped={isGrouped} />`.

**Deviations:** Phase 12 was marked ✅ in the summary but `use-profile.ts` was never created; created it here as part of Phase 13. `isGrouped` ternary guarded with `!!prev` to satisfy strict boolean lint.

---

## ✅ Phase 14 — Read State + Unread Badges

**Goal:** Track which messages the user has read per channel; show unread dot badge in sidebar.

**Desktop references:**
- `desktop/src/features/channels/readState/readStateStorage.ts` — localStorage persistence
- `desktop/src/features/channels/readState/readStateManager.ts` — core read state logic
- `desktop/src/features/channels/readState/useReadState.ts` — React hook
- `desktop/src/features/channels/unreadChannelCounts.ts` — per-channel count

### Files to create

**`web/src/features/channels/readState/readStateStorage.ts`**

Stores `{ [channelId]: lastReadTimestamp }` in `localStorage` under key `"lenos_read_state"`.

```typescript
const STORAGE_KEY = "lenos_read_state";

type ReadStateMap = Record<string, number>; // channelId → unix timestamp

function load(): ReadStateMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as ReadStateMap;
  } catch {
    return {};
  }
}

function save(map: ReadStateMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getLastRead(channelId: string): number {
  return load()[channelId] ?? 0;
}

export function setLastRead(channelId: string, timestamp: number): void {
  const map = load();
  map[channelId] = timestamp;
  save(map);
}
```

**`web/src/features/channels/readState/useReadState.ts`**

```typescript
import { useState, useCallback } from "react";
import { getLastRead, setLastRead } from "./readStateStorage";

export function useReadState(channelId: string | null) {
  const [lastRead, setLastReadState] = useState<number>(
    channelId ? getLastRead(channelId) : 0,
  );

  const markRead = useCallback(
    (timestamp: number) => {
      if (!channelId) return;
      setLastRead(channelId, timestamp);
      setLastReadState(timestamp);
    },
    [channelId],
  );

  return { lastRead, markRead };
}
```

**`web/src/features/channels/unreadChannelCounts.ts`**

```typescript
import { getLastRead } from "./readState/readStateStorage";
import type { Message } from "@/features/messages/use-messages";

export function getUnreadCount(channelId: string, messages: Message[]): number {
  const lastRead = getLastRead(channelId);
  return messages.filter(m => m.createdAt > lastRead).length;
}
```

### Update `ChannelsSidebar.tsx`

- Accept `messagesByChannel: Record<string, Message[]>` prop, or fetch per-channel last message timestamp separately.
- Simpler approach: track only whether `lastMessageTimestamp > lastReadTimestamp` (boolean unread flag).
- Show a small dot badge: `{isUnread && <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />}`

### Auto-mark read

In `ChannelView.tsx`, call `markRead(messages[messages.length - 1]?.createdAt)` when the channel is open and messages change. Use a `useEffect` with `[messages, channelId]`.

**Deviations:** `ChannelsSidebar` uses a single `sidebar-unread` subscription (filter `#h: all channel ids`) rather than per-channel subscriptions, to avoid N WebSocket subscriptions. Biome correctly flagged the dep-array suppression as unused — removed it (deps are exhaustive).

---

## ✅ Phase 15 — Message Reactions

**Goal:** Display emoji reactions on messages; allow adding/removing reactions via kind 7 events.

**Desktop references:**
- `desktop/src/features/messages/ui/MessageReactions.tsx`
- `desktop/src/features/messages/lib/reactions.ts`
- `desktop/src/shared/api/relayReactions.ts`

### How reactions work in Nostr

Kind 7 event. `content` = the emoji character (or `"+"` for like). Tags: `["e", targetEventId]`, `["p", targetPubkey]`, `["h", channelId]` (LenOS extension). To remove: publish kind 5 (delete) referencing the kind 7 event id.

### Files to create

**`web/src/features/messages/use-reactions.ts`**

```typescript
import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface Reaction {
  id: string;
  pubkey: string;
  content: string; // the emoji
  targetId: string; // message event id
}

export function useReactions(channelId: string | null, messageIds: string[]) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    if (!channelId || messageIds.length === 0) return;
    const client = getRelayClient(relayWsUrl());
    const subId = `reactions-${channelId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: { kinds: [7], "#e": messageIds, "#h": [channelId] },
      onEvent: (raw) => {
        const id = raw.id as string;
        const pubkey = raw.pubkey as string;
        const content = (raw.content as string) || "+";
        const tags = (raw.tags as string[][]) ?? [];
        const targetId = tags.find(t => t[0] === "e")?.[1];
        if (!targetId) return;
        setReactions(prev => {
          if (prev.some(r => r.id === id)) return prev;
          return [...prev, { id, pubkey, content, targetId }];
        });
      },
    });

    return unsub;
  }, [channelId, messageIds]);

  return reactions;
}
```

**`web/src/features/messages/ui/MessageReactions.tsx`**

Groups reactions by emoji, shows count, highlights if current user reacted.

```tsx
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import type { Reaction } from "@/features/messages/use-reactions";

interface Props {
  messageId: string;
  channelId: string;
  reactions: Reaction[];
  currentPubkey: string | null;
}

export function MessageReactions({ messageId, channelId, reactions, currentPubkey }: Props) {
  const grouped = reactions.reduce<Record<string, Reaction[]>>((acc, r) => {
    if (r.targetId !== messageId) return acc;
    (acc[r.content] ??= []).push(r);
    return acc;
  }, {});

  const addReaction = async (emoji: string) => {
    try {
      const signed = await signNostrEvent({
        kind: 7,
        content: emoji,
        tags: [["e", messageId], ["h", channelId]],
      }, { requireNip07: true });
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
    } catch { /* no NIP-07 */ }
  };

  if (Object.keys(grouped).length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(grouped).map(([emoji, rs]) => {
        const reacted = currentPubkey ? rs.some(r => r.pubkey === currentPubkey) : false;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void addReaction(emoji)}
            className={[
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              reacted
                ? "border-blue-400/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20",
            ].join(" ")}
          >
            <span>{emoji}</span>
            <span className="text-black/50 dark:text-white/50">{rs.length}</span>
          </button>
        );
      })}
    </div>
  );
}
```

Update `MessageRow.tsx` to accept and render `<MessageReactions />`. Pass reactions from the parent; parent calls `useReactions(channelId, messageIds)` once and passes the full array down.

**Deviations:** Added `getCurrentPubkey()` to `nostr-signer.ts` (not in plan) — needed to source `currentPubkey` for the reaction highlight. Biome `noAssignInExpressions` rejected `??=` inside `.reduce` — replaced with explicit `if (!acc[r.content]) acc[r.content] = []`.

---

## ✅ Phase 16 — Message Edit & Delete

**Goal:** Allow editing and deleting own messages via hover context menu.

**Desktop references:**
- `desktop/src/features/messages/ui/MessageContextMenu.tsx`
- `desktop/src/features/messages/useMessageActions.ts`
- `desktop/src/shared/api/relayMessages.ts` — how delete/edit events are published

### How edit/delete work in Nostr

**Delete:** Publish kind 5 with `tags: [["e", targetEventId]]`. Relay should suppress the original. Client must also hide the message locally.

**Edit:** Publish a new kind 9 with `tags: [["e", originalEventId, "", "edit"]]`. The relay stores both; client shows the latest edit. (LenOS may use a replaceable event pattern — check `desktop/src/features/messages/lib/messageEdit.ts` for exact implementation.)

### Files to create

**`web/src/features/messages/ui/MessageContextMenu.tsx`**

Show on hover (`group` + `opacity-0 group-hover:opacity-100` pattern). Only show Edit/Delete for own messages (compare `msg.pubkey === currentPubkey`).

```tsx
interface Props {
  msg: Message;
  currentPubkey: string | null;
  channelId: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageContextMenu({ msg, currentPubkey, onEdit, onDelete }: Props) {
  const isOwn = msg.pubkey === currentPubkey;
  return (
    <div className="absolute right-2 top-0 hidden rounded-md border border-black/10 bg-white shadow-sm group-hover:flex dark:border-white/10 dark:bg-[#2a2a2a]">
      <button type="button" onClick={() => void navigator.clipboard.writeText(msg.content)} className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5">Copy</button>
      {isOwn && <button type="button" onClick={onEdit} className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5">Edit</button>}
      {isOwn && <button type="button" onClick={onDelete} className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/5">Delete</button>}
    </div>
  );
}
```

**`web/src/features/messages/useMessageActions.ts`**

```typescript
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function useMessageActions() {
  const deleteMessage = async (messageId: string) => {
    const signed = await signNostrEvent(
      { kind: 5, content: "", tags: [["e", messageId]] },
      { requireNip07: true },
    );
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  const editMessage = async (originalId: string, channelId: string, newContent: string) => {
    const signed = await signNostrEvent(
      {
        kind: 9,
        content: newContent,
        tags: [["h", channelId], ["e", originalId, "", "edit"]],
      },
      { requireNip07: true },
    );
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  return { deleteMessage, editMessage };
}
```

Update `MessageRow.tsx` to be a `relative group` container, render `<MessageContextMenu />`, and handle inline edit mode (replace `<p>` with `<textarea>` when editing).

Update `use-messages.ts` to handle kind 5 delete events: when a delete event arrives for a known message id, remove it from state.

**Deviations:** `deleteMessage` takes `channelId` as second arg (not in plan) so the kind-5 event carries `["h", channelId]` — needed for the relay's channel-scoped subscription to deliver it. Live subscription extended to `LIVE_KINDS` = history kinds + `KIND_DELETION` so arriving kind-5 events are processed in real-time.

---

## ✅ Phase 17 — Thread / Reply System

**Goal:** Replies to a message shown in a right-side thread panel; click "X replies" summary row to open it.

**Desktop references:**
- `desktop/src/features/messages/ui/MessageThreadPanel.tsx`
- `desktop/src/features/messages/useThreadReplies.ts`
- `desktop/src/features/messages/lib/threading.ts`
- `desktop/src/features/channels/ui/FocusThreadDrawer.tsx`

### How threads work in Nostr/LenOS

Thread replies use kind `1111` (NIP-22 comment) or kind 9 with `["e", rootId, "", "reply"]` tag. LenOS uses `KIND_THREAD_REPLY` from `kinds.ts`. Subscribe with filter `{ kinds: [KIND_THREAD_REPLY], "#e": [rootMessageId], "#h": [channelId] }`.

### Files to create

**`web/src/features/messages/useThreadReplies.ts`**

```typescript
import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_THREAD_REPLY } from "@/shared/constants/kinds";
import type { Message } from "./use-messages";

export function useThreadReplies(rootId: string | null, channelId: string | null) {
  const [replies, setReplies] = useState<Message[]>([]);

  useEffect(() => {
    if (!rootId || !channelId) return;
    const client = getRelayClient(relayWsUrl());
    const subId = `thread-${rootId}`;

    const unsub = client.subscribe({
      id: subId,
      filter: { kinds: [KIND_THREAD_REPLY], "#e": [rootId], "#h": [channelId] },
      onEvent: (raw) => {
        setReplies(prev => {
          const id = raw.id as string;
          if (prev.some(r => r.id === id)) return prev;
          return [...prev, {
            id,
            pubkey: raw.pubkey as string,
            content: raw.content as string,
            createdAt: raw.created_at as number,
            kind: raw.kind as number,
            tags: raw.tags as string[][],
          }].sort((a, b) => a.createdAt - b.createdAt);
        });
      },
    });

    return () => { unsub(); setReplies([]); };
  }, [rootId, channelId]);

  return replies;
}
```

**`web/src/features/messages/ui/ThreadPanel.tsx`**

Slide-in panel from the right (fixed width 360px, absolute or flex sibling). Shows root message at top, replies below, composer at bottom. Reply composer publishes `KIND_THREAD_REPLY` with `["e", rootId, "", "reply"]` tag.

**`web/src/features/messages/ui/MessageThreadSummaryRow.tsx`**

Below each root message that has replies, show: `"3 replies  last reply 2m ago"`. Clicking opens the thread panel.

### Update `ChannelView.tsx`

Add `threadRootId` state. Render `<ThreadPanel>` as a sibling to `<MessageTimeline>` in a `flex flex-row` container. Pass `onOpenThread={id => setThreadRootId(id)}` to MessageTimeline.

**Deviations:** `KIND_THREAD_REPLY` not in kinds.ts — LenOS uses `KIND_FORUM_COMMENT` (45003) for thread replies. `MessageThreadSummaryRow` subscribes independently via `useThreadReplies` rather than receiving reply counts as props (avoids threading count data through two layers). Summary row only shown for root (non-grouped) messages.

---

## Phase 18 — Rich Text Composer (ProseMirror)

**Goal:** Replace the plain `<textarea>` in `MessageComposer` with a ProseMirror editor supporting markdown-style formatting, `@mentions`, and emoji autocomplete.

**Desktop references:**
- `desktop/src/features/messages/ui/MessageComposer.tsx` — uses ProseMirror with custom schema
- `desktop/src/features/messages/lib/prosemirror/` — schema, plugins, serializer

### Dependencies to add

```bash
cd web
pnpm add prosemirror-state prosemirror-view prosemirror-model prosemirror-schema-basic prosemirror-history prosemirror-commands prosemirror-keymap prosemirror-inputrules
```

### Files to create

**`web/src/features/messages/lib/editorSchema.ts`**

Define a simple schema: `doc > paragraph+ > (text | bold | italic | code | mention)`. Copy closely from `desktop/src/features/messages/lib/prosemirror/schema.ts`.

**`web/src/features/messages/lib/editorPlugins.ts`**

Compose keymap (Enter=submit, Shift+Enter=newline, Mod+B=bold, Mod+I=italic), history, inputrules (e.g. `**text**` → bold), placeholder, and mention autocomplete.

**`web/src/features/messages/lib/mentionPlugin.ts`**

Watches for `@` typed in editor, debounce-queries relay for kind 0 profile names matching the text after `@`, shows dropdown. On select, inserts a mention node `<span data-mention="pubkey">@name</span>` which serializes as `nostr:npub...` in the event content.

**`web/src/features/messages/ui/RichComposer.tsx`**

ProseMirror-based composer component. Replaces `<textarea>` in `MessageComposer.tsx`. Exports the same interface: `{ channelId, channelName }` props plus an optional `onSend` callback.

**`web/src/features/messages/ui/FormattingToolbar.tsx`**

Small toolbar above composer (only visible on focus or when text is selected). Buttons: Bold, Italic, Code, Link. Each dispatches a ProseMirror transaction.

---

## Phase 19 — Typing Indicators

**Goal:** Show "Alice is typing…" below the composer when someone else is typing.

**Desktop references:**
- `desktop/src/features/messages/ui/TypingIndicator.tsx`
- `desktop/src/features/messages/useTypingState.ts`

### How typing works in LenOS

LenOS uses kind `10096` (or `KIND_TYPING` from kinds.ts) ephemeral events. Event content is empty. Tags: `["h", channelId]`. Events have `created_at = now`. A user is considered "typing" if their last typing event was within 5 seconds. Publish a typing event every ~3 seconds while the user is actively typing (debounced).

### Files to create

**`web/src/features/messages/useTypingState.ts`**

```typescript
import { useEffect, useState, useRef } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent, hasNip07Provider } from "@/shared/lib/nostr-signer";
import { KIND_TYPING } from "@/shared/constants/kinds";

const TYPING_TTL = 5_000; // ms before "is typing" expires
const TYPING_INTERVAL = 3_000; // ms between publish calls while typing

export function useTypingState(channelId: string | null, currentPubkey: string | null) {
  const [typingPubkeys, setTypingPubkeys] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to incoming typing events
  useEffect(() => {
    if (!channelId) return;
    const client = getRelayClient(relayWsUrl());
    const since = Math.floor(Date.now() / 1000) - 5;
    const unsub = client.subscribe({
      id: `typing-${channelId}`,
      filter: { kinds: [KIND_TYPING], "#h": [channelId], since },
      onEvent: (raw) => {
        const pubkey = raw.pubkey as string;
        if (pubkey === currentPubkey) return;
        setTypingPubkeys(prev => new Set([...prev, pubkey]));
        if (timers.current.has(pubkey)) clearTimeout(timers.current.get(pubkey));
        timers.current.set(pubkey, setTimeout(() => {
          setTypingPubkeys(prev => { const n = new Set(prev); n.delete(pubkey); return n; });
          timers.current.delete(pubkey);
        }, TYPING_TTL));
      },
    });
    return unsub;
  }, [channelId, currentPubkey]);

  // Publish typing event
  const notifyTyping = () => {
    if (!channelId || !hasNip07Provider() || publishTimer.current) return;
    publishTimer.current = setTimeout(async () => {
      publishTimer.current = null;
      try {
        const signed = await signNostrEvent(
          { kind: KIND_TYPING, content: "", tags: [["h", channelId]] },
          { requireNip07: true },
        );
        getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      } catch { /* ignore */ }
    }, TYPING_INTERVAL);
  };

  return { typingPubkeys, notifyTyping };
}
```

**`web/src/features/messages/ui/TypingIndicator.tsx`**

```tsx
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface Props { pubkeys: string[]; }

function TypingName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{profile?.name || truncatePubkey(pubkey)}</>;
}

export function TypingIndicator({ pubkeys }: Props) {
  if (pubkeys.length === 0) return <div className="h-5" />;
  return (
    <div className="h-5 px-4 text-xs text-black/40 dark:text-white/40 animate-pulse">
      {pubkeys.length === 1 && <><TypingName pubkey={pubkeys[0]} /> is typing…</>}
      {pubkeys.length === 2 && <><TypingName pubkey={pubkeys[0]} /> and <TypingName pubkey={pubkeys[1]} /> are typing…</>}
      {pubkeys.length > 2 && "Several people are typing…"}
    </div>
  );
}
```

Add `<TypingIndicator>` above the composer in `ChannelView.tsx`. Pass `notifyTyping` to the composer's `onChange` handler.

---

## Phase 20 — Search (Global + In-Channel)

**Goal:** Cmd+K global search modal; Ctrl+F in-channel find bar.

**Desktop references:**
- `desktop/src/features/search/ui/TopbarSearch.tsx`
- `desktop/src/features/search/useSearchResults.ts`
- `desktop/src/features/search/lib/parseSearchOperators.ts`
- `desktop/src/features/search/ui/ChannelFindBar.tsx`

### Files to create

**`web/src/features/search/useSearchResults.ts`**

Query relay with `{ kinds: [9, 40002], "#h": [communityId], search: query, limit: 20 }` — NIP-50 full-text search. The LenOS relay supports NIP-50 (`"search"` filter field). Return results with event id, content snippet, pubkey, createdAt, channelId (from `#h` tag).

```typescript
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useState, useEffect } from "react";
import { KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2 } from "@/shared/constants/kinds";

export interface SearchResult {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  channelId: string;
}

export function useSearchResults(query: string, communityId: string | null) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim() || !communityId) { setResults([]); return; }
    setLoading(true);
    const trimmed = query.trim();
    queryEvents(relayWsUrl(), {
      kinds: [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2],
      "#h": [communityId],
      search: trimmed,
      limit: 30,
    })
      .then(events => {
        setResults(events.map(e => ({
          id: e.id as string,
          pubkey: e.pubkey as string,
          content: e.content as string,
          createdAt: e.created_at as number,
          channelId: ((e.tags as string[][])?.find(t => t[0] === "h")?.[1]) ?? "",
        })));
      })
      .finally(() => setLoading(false));
  }, [query, communityId]);

  return { results, loading };
}
```

**`web/src/features/search/ui/SearchModal.tsx`**

Full-screen modal overlay triggered by Cmd+K (or Ctrl+K on Windows). Contains a text input, debounced to 300ms. Renders `<SearchResultItem>` rows. Clicking a result navigates to `/channels/${channelId}` and closes the modal.

**`web/src/features/search/ui/SearchResultItem.tsx`**

Shows channel name, author, timestamp, and content snippet (with query terms highlighted).

**`web/src/features/search/ui/ChannelFindBar.tsx`**

Fixed bar at the top of `MessageTimeline` triggered by Ctrl+F. Filters the already-loaded `messages` array client-side (no relay query). Shows match count, up/down navigation buttons.

### Keyboard hook

Add a `useEffect` in `WorkspaceShell.tsx` (or `_workspace.tsx`) that listens for `keydown` and opens the search modal on Cmd+K / Ctrl+K.

---

## Phase 21 — Settings Screen

**Goal:** Settings modal (accessible via gear icon in sidebar footer) covering all web-relevant config sections.

**Desktop references:**
- `desktop/src/features/settings/ui/SettingsView.tsx` — main shell
- `desktop/src/features/settings/ui/` — all section panels
- Desktop has 17 sections; web omits Tauri-only ones (mesh compute, mobile pairing, OS notifications via Tauri, app updates)

### Web settings sections

| Section | Description | Desktop equivalent |
|---------|-------------|-------------------|
| Profile | Edit name, picture, about via kind 0 | `ProfileSettingsPanel.tsx` |
| Identity | Show/copy public key, import new nsec | `IdentitySettingsPanel.tsx` |
| Appearance | Theme (light/dark/system), font size | `AppearanceSettingsPanel.tsx` |
| Notifications | Browser notification permission; per-channel mutes | `NotificationsSettingsPanel.tsx` |
| Relay | Current relay URL, connection status | `RelaySettingsPanel.tsx` |
| Keyboard shortcuts | Display keybinding cheatsheet | `KeybindingsPanel.tsx` |
| About | App version, links | `AboutPanel.tsx` |

### Files to create

**`web/src/features/settings/ui/SettingsModal.tsx`**

Full-screen modal. Left column = section list. Right = active section content. Opened by gear icon at sidebar bottom.

```tsx
// SettingsModal accepts isOpen + onClose props
// Sections list: Profile, Identity, Appearance, Notifications, Relay, Shortcuts, About
// Each section rendered in a right pane with a <Suspense> boundary
```

**`web/src/features/settings/ui/ProfileSettingsPanel.tsx`**

Load current user's kind 0. Form with name, about, picture URL fields. On save: publish a new kind 0 event via `signNostrEvent`.

**`web/src/features/settings/ui/IdentitySettingsPanel.tsx`**

Show current public key (hex + npub encoded via `nostr-tools/nip19`). Option to "Switch identity" — paste nsec → derive pubkey → save to `localStorage` under `"lenos_nsec"`. The existing `nostr-signer.ts` ephemeral key fallback should read from this storage key.

**`web/src/features/settings/ui/AppearanceSettingsPanel.tsx`**

Three-way theme toggle (Light / Dark / System). Writes to `localStorage["lenos_theme"]`. The root `ThemeProvider` reads this on mount and applies the appropriate `dark` class to `<html>`. (Copy the non-Tauri parts from `desktop/src/shared/theme/ThemeProvider.tsx`.)

**`web/src/features/settings/ui/NotificationsSettingsPanel.tsx`**

"Enable desktop notifications" toggle. Calls `Notification.requestPermission()` on enable. Shows current permission state. Per-channel mute list (from Phase 29).

**`web/src/features/settings/ui/RelaySettingsPanel.tsx`**

Show current relay URL and WebSocket connection status (connected / reconnecting / disconnected). "Disconnect / Reconnect" button. Advanced: custom relay URL field (writes to `localStorage["lenos_relay_url"]`; `relayWsUrl()` reads from there if set).

### Sidebar footer

Add a gear icon button at the bottom of `ChannelsSidebar.tsx` that opens `SettingsModal`.

---

## Phase 22 — Auth / Onboarding Flow (Web)

**Goal:** Web-specific onboarding: import Nostr identity, set up profile, join workspace via invite.

**Desktop references:**
- `desktop/src/features/onboarding/ui/SetupStep.tsx`
- `desktop/src/features/onboarding/ui/RecoveryScreen.tsx`
- The desktop uses Tauri keychain; web uses localStorage

### Files to create

**`web/src/features/onboarding/ui/OnboardingGate.tsx`**

Wraps the entire workspace UI. If no identity is found in `localStorage["lenos_nsec"]` AND `window.nostr` is unavailable, render the onboarding flow instead of the workspace.

**`web/src/features/onboarding/ui/IdentityStep.tsx`**

Two options:
1. "Connect browser extension" — opens Alby/nos2x install link
2. "Import key" — paste nsec field; validate with `nostr-tools/nip19 nip19.decode`; save decoded hex to `localStorage["lenos_privkey"]`

**`web/src/features/onboarding/ui/ProfileSetupStep.tsx`**

After identity is set: form for display name and optional picture URL. On save: publish kind 0 event.

**`web/src/features/onboarding/ui/InviteRedemptionStep.tsx`**

If the URL is `/invite/:code`, automatically apply the invite (kind 9002 or workspace-specific join event). Enhance the existing `web/src/app/routes/invite.$code.tsx` — it currently may just display the code; add actual redemption logic that publishes a join request event.

**Update `web/src/shared/lib/nostr-signer.ts`**

The ephemeral key fallback should first check `localStorage["lenos_privkey"]` before generating a random key. This lets imported nsec keys persist across sessions.

---

## Phase 23 — Members Sidebar

**Goal:** Right-side panel listing all members in the current channel/community.

**Desktop references:**
- `desktop/src/features/channels/ui/MembersSidebar.tsx`
- `desktop/src/features/channels/ui/MembersSidebarMemberCard.tsx`
- `desktop/src/shared/api/relayMembers.ts`

### How members work in NIP-29

Kind 39002 event = group members list for a group. Tags: one `["p", pubkey, relay, role]` per member. The relay publishes one replaceable kind 39002 per group.

### Files to create

**`web/src/features/channels/useMembers.ts`**

Subscribe to kind 39002 for the current channel id. Parse `p` tags into `{ pubkey, role }` pairs.

```typescript
export interface Member {
  pubkey: string;
  role: "admin" | "member" | string;
}

export function useMembers(channelId: string | null): Member[] {
  // Subscribe to kind 39002 with filter: { kinds: [39002], "#d": [channelId] }
  // Parse tags
}
```

**`web/src/features/channels/ui/MembersSidebar.tsx`**

Right panel (240px, toggled by a "Members" button in the channel header). Lists members grouped by role (admins first). Each row: `<Avatar>` + display name (via `useProfile`) + online dot (Phase 28).

**`web/src/features/channels/ui/MemberCard.tsx`**

Single member row. On click: show popover with options (Send DM, View profile, Copy pubkey).

### Update `ChannelView.tsx`

Add `showMembers` state (boolean). Toggle via button in channel header. Render `<MembersSidebar>` as a right sibling in the flex row.

---

## Phase 24 — Channel Management

**Goal:** Create, edit, and delete channels. Admin-only.

**Desktop references:**
- `desktop/src/features/channels/ui/CreateChannelDialog.tsx`
- `desktop/src/features/channels/ui/ChannelSettingsPanel.tsx`
- `desktop/src/shared/api/relayChannelMutations.ts`

### How channel creation works in NIP-29

Create: publish kind 9007 (group create request) with `d` tag = desired group id, `name` tag = display name. The relay creates the group and publishes kind 39000.

Edit: publish kind 9002 (group metadata edit) with updated `name`, `about` tags.

Delete: publish kind 9008 (group delete request).

### Files to create

**`web/src/features/channels/useChannelMutations.ts`**

```typescript
export function useChannelMutations() {
  const createChannel = async (id: string, name: string, description: string, communityId: string) => {
    const signed = await signNostrEvent({
      kind: 9007,
      content: "",
      tags: [["d", id], ["name", name], ["about", description], ["h", communityId]],
    }, { requireNip07: true });
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  const editChannel = async (channelId: string, name: string, description: string) => {
    const signed = await signNostrEvent({
      kind: 9002,
      content: "",
      tags: [["h", channelId], ["name", name], ["about", description]],
    }, { requireNip07: true });
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  return { createChannel, editChannel };
}
```

**`web/src/features/channels/ui/CreateChannelModal.tsx`**

Modal form: channel name, channel id (auto-derived from name, editable), description, type (chat vs forum). "Create" button calls `createChannel`.

**`web/src/features/channels/ui/ChannelSettingsModal.tsx`**

Accessible via gear icon on channel header hover. Edit name/description. Danger zone: delete channel (admin only).

### Update `ChannelsSidebar.tsx`

Add `+` button next to the "Channels" section header. Click opens `<CreateChannelModal>`.

---

## Phase 25 — Moderation

**Goal:** Members can report messages; admins can mute or ban users.

**Desktop references:**
- `desktop/src/features/moderation/ui/ReportDialog.tsx`
- `desktop/src/features/moderation/useModerationActions.ts`
- NIP-29 kinds: 9000 (add user), 9001 (remove user), 9004 (mute user), 9005 (unmute)

### Files to create

**`web/src/features/moderation/ui/ReportDialog.tsx`**

Modal: "Why are you reporting this?" dropdown (spam, harassment, off-topic). On submit: publish kind 1984 (NIP-56 report) with `["e", targetEventId]` and `["p", targetPubkey]` tags.

**`web/src/features/moderation/useModerationActions.ts`**

```typescript
export function useModerationActions() {
  const muteUser = async (pubkey: string, channelId: string) => {
    // kind 9004 per NIP-29
    const signed = await signNostrEvent({ kind: 9004, content: "", tags: [["p", pubkey], ["h", channelId]] }, { requireNip07: true });
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  const banUser = async (pubkey: string, channelId: string) => {
    // kind 9001 = remove user from group
    const signed = await signNostrEvent({ kind: 9001, content: "", tags: [["p", pubkey], ["h", channelId]] }, { requireNip07: true });
    getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
  };

  return { muteUser, banUser };
}
```

Add "Report" to `MessageContextMenu.tsx`. Add "Mute" and "Ban" to the `MemberCard` popover for admins.

---

## Phase 26 — Direct Messages (DMs)

**Goal:** Private encrypted 1:1 and group DMs between workspace members.

**Desktop references:**
- `desktop/src/features/messages/ui/NewMessageScreen.tsx`
- `desktop/src/features/channels/lib/dmParticipantDisplay.ts`
- `desktop/src/features/sidebar/lib/dmSidebarSort.ts`
- `desktop/src/app/routes/messages.new.tsx`

### How DMs work in LenOS

LenOS DMs are NIP-29 private groups with a special channel kind flag. Alternatively, they may use NIP-17 (sealed gift-wraps). Check `desktop/src/features/channels/isDmNotifiableKind.ts` and `usePrepareDmSendChannel.ts` for exact kind. The `#h` tag community id is scoped to the DM.

### Routes to add

```
/messages                → DM list
/messages/new            → New DM (search for recipient)
/messages/:channelId     → DM conversation view
```

Add these to `web/src/app/routes.ts`:

```typescript
route("/messages", "_workspace.messages.tsx"),
route("/messages/new", "_workspace.messages.new.tsx"),
route("/messages/$channelId", "_workspace.messages.$channelId.tsx"),
```

### Files to create

**`web/src/features/messages/ui/DmList.tsx`**

Lists existing DM conversations. Each row: avatar stack of participants, last message preview, timestamp. Click navigates to `/messages/${channelId}`.

**`web/src/features/messages/ui/NewMessageScreen.tsx`**

Search field to find workspace members (query kind 0 profiles matching search term). Select one or more recipients. On "Open" button: call `usePrepareDmSendChannel` equivalent to create (or find) the DM channel, then navigate to the DM view.

**`web/src/features/channels/lib/dmParticipantDisplay.ts`**

Copy from desktop. Given a list of pubkeys and the current user's pubkey, return the display string (the other participant's name, or "Alice, Bob" for group DMs).

**`web/src/features/channels/usePrepareDmSendChannel.ts`**

If a DM channel already exists between these participants, return its id. Otherwise, publish a kind 9007 create event with `private: true` flag (per NIP-29) and return the new channel id.

### Sidebar section

Add a "Direct Messages" section below "Channels" in `ChannelsSidebar.tsx`. Show top DM conversations. `+` button navigates to `/messages/new`.

---

## Phase 27 — Browser Notifications

**Goal:** Show OS browser notifications for mentions and DMs when the tab is not focused.

**Desktop references:**
- `desktop/src/features/notifications/lib/desktop.ts` — replace Tauri with `Notification` API
- `desktop/src/features/notifications/lib/shouldNotify.ts` — reuse logic
- `desktop/src/features/notifications/lib/notificationFormat.ts` — reuse
- `desktop/src/features/notifications/use-feed-desktop-notifications.ts` — adapt

### Files to create

**`web/src/features/notifications/lib/browser.ts`**

```typescript
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(title: string, body: string, icon?: string): void {
  if (Notification.permission !== "granted" || document.visibilityState === "visible") return;
  new Notification(title, { body, icon });
}
```

**`web/src/features/notifications/useFeedBrowserNotifications.ts`**

Subscribes to all channels' messages. For each new message: checks if content contains `@npub...` matching current user's pubkey (mention detection). If yes, calls `showNotification`. Also fires for DM messages.

Copy `shouldNotify.ts` from desktop (no Tauri dependencies). Copy `notificationFormat.ts` from desktop.

---

## Phase 28 — User Status + Presence

**Goal:** Let users set a custom status (emoji + text). Show online/idle dots on member avatars.

**Desktop references:**
- `desktop/src/features/profile/ui/StatusPicker.tsx`
- NIP-38: kind 30315 user status event. Tags: `["d", "general"]`, optional `["expiration", timestamp]`. Content = `"emoji status text"`.

### Files to create

**`web/src/features/profile/useUserStatus.ts`**

Subscribe to kind 30315 for a set of pubkeys. Cache in a module-level Map.

```typescript
export interface UserStatus { emoji: string; text: string; expiresAt?: number; }

export function useUserStatus(pubkey: string): UserStatus | null {
  // Subscribe to: { kinds: [30315], authors: [pubkey], "#d": ["general"] }
  // Parse content as "emoji text"
}
```

**`web/src/features/profile/ui/StatusPicker.tsx`**

Emoji grid + text input. Expiry options (30min, 1h, 4h, "until I clear it"). On save: publish kind 30315. Add status display in `ChannelsSidebar.tsx` footer (click on current user's name opens status picker).

**Presence / online dots**

Simple heuristic: a user is "online" if they published any event within the last 5 minutes. Check `use-messages.ts` events cache. Show a green dot on `Avatar` when online.

---

## Phase 29 — Sidebar Enhancements

**Goal:** Mute channels, star/favorite channels, collapsible sections, unread-only filter, notification dot refinement.

**Desktop references:**
- `desktop/src/features/sidebar/lib/` — all sidebar lib files
- `desktop/src/features/channels/ui/` — sidebar integration

### Files to create

**`web/src/features/sidebar/lib/mutedChannels.ts`**

localStorage-backed set of muted channel ids. `isMuted(channelId)`, `toggleMute(channelId)`.

**`web/src/features/sidebar/lib/starredChannels.ts`**

localStorage-backed ordered array of starred channel ids. `isStarred(channelId)`, `toggleStar(channelId)`, `getStarredOrder()`.

**`web/src/features/sidebar/lib/sidebarSections.ts`**

Derive sidebar sections from channels list:
1. "Starred" — starred channels (if any)
2. "Channels" — all non-DM, non-muted channels, sorted alphabetically
3. "Muted" — muted channels, collapsed by default

**`web/src/features/sidebar/useSidebarState.ts`**

Combines channels list, starred, muted, unread counts into a sorted, sectioned structure for the sidebar to render.

### Update `ChannelsSidebar.tsx`

- Render sections from `useSidebarState`
- Each section has a collapse toggle (chevron icon)
- Channel row: right-click (or `...` hover button) context menu with "Mute" / "Star" / "Mark as read" actions
- Filter toggle in sidebar header: "All" / "Unread only"

---

## Phase 30 — Forum Channels

**Goal:** Support forum-style channels where content is threaded posts rather than live chat.

**Desktop references:**
- `desktop/src/features/forum/ui/ForumView.tsx`
- `desktop/src/features/forum/ui/ForumPostCard.tsx`
- `desktop/src/features/forum/ui/ForumComposer.tsx`
- `desktop/src/shared/api/forum.ts`
- `desktop/src/features/channels/ui/ForumChannelContent.tsx`
- Route: `channels.$channelId.posts.$postId.tsx`

### How forum channels differ

Forum channels use `KIND_FORUM_POST` (check kinds.ts) instead of `KIND_STREAM_MESSAGE`. Posts are NIP-29 group messages with a `subject` tag. Replies are threaded below each post (using the thread reply system from Phase 17).

### Files to create

**`web/src/features/forum/hooks.ts`**

`useForumPosts(channelId)` — subscribes to `KIND_FORUM_POST` events, returns sorted post list.

**`web/src/features/forum/ui/ForumView.tsx`**

List of post cards. "New Post" button at top. Click post → navigate to `/channels/${channelId}/posts/${postId}`.

**`web/src/features/forum/ui/ForumPostCard.tsx`**

Card with: title (from `subject` tag), author avatar + name, timestamp, reply count, reaction count, first N characters of content.

**`web/src/features/forum/ui/ForumComposer.tsx`**

Creates a new forum post. Fields: Title (subject tag), Body (content). Submit publishes `KIND_FORUM_POST` with `["h", channelId]`, `["subject", title]`.

**`web/src/features/forum/ui/ForumPostDetail.tsx`**

Full post view with all threaded replies (using Phase 17 thread system).

### Routes to add

```
/channels/:channelId/posts/:postId  → ForumPostDetail
```

### Update `ChannelView.tsx`

Check channel metadata's `type` tag. If `type === "forum"`, render `<ForumView>` instead of `<MessageTimeline>` + `<MessageComposer>`.

---

## Phase 31 — Workflows

**Goal:** View and trigger workspace automation workflows.

**Desktop references:**
- `desktop/src/features/workflows/` — full workflows feature
- `desktop/src/shared/api/tauriWorkflows.ts` — Tauri IPC calls; web equivalent: relay events

### How workflows work

Workflows are stored as kind `30090` (or workspace-specific kind — check kinds.ts `KIND_WORKFLOW`) replaceable events. Each workflow has a `name` tag, `description` tag, and `trigger` tag. Triggering a workflow publishes a kind `9090` (or `KIND_WORKFLOW_RUN`) event.

### Files to create

**`web/src/features/workflows/useWorkflows.ts`**

```typescript
export function useWorkflows(communityId: string | null) {
  // Subscribe to KIND_WORKFLOW events with "#h": [communityId]
  // Return list of { id, name, description, trigger }
}
```

**`web/src/features/workflows/ui/WorkflowsPage.tsx`**

Grid/list of workflow cards. Each card: name, description, trigger type, last run time. "Run" button triggers the workflow.

**`web/src/features/workflows/ui/WorkflowCard.tsx`**

Card with "Run" button that publishes `KIND_WORKFLOW_RUN` with `["e", workflowId]` tag.

**`web/src/features/workflows/ui/WorkflowRunHistory.tsx`**

List of recent run events for a workflow (subscribe to `KIND_WORKFLOW_RUN` events with `"#e": [workflowId]`).

### Route to add

```
/workflows  → WorkflowsPage
```

Add "Workflows" nav item to sidebar (below Channels section).

---

## Phase 32 — Projects / Git (Enhanced)

**Goal:** Enhance the existing repos page with PR list, branch view, commit history, and diff view.

**Desktop references:**
- `desktop/src/features/projects/ui/ProjectRepositoryPanel.tsx`
- `desktop/src/features/projects/ui/ProjectPullRequestsPanel.tsx`
- `desktop/src/features/projects/ui/ProjectCommitDetailPanel.tsx`
- `desktop/src/features/projects/pullRequestMutations.ts`
- `desktop/src/shared/api/projectGit.ts` — **ALL Tauri; web needs REST equivalent**

### Web-specific constraint

The desktop git operations (clone, fetch, commit, push) use Tauri native file system. The web can only show read-only data from relay events. Interactive git operations (create branch, merge PR) should call the LenGrowth backend API if available, or display as read-only with a "Clone to use locally" prompt.

### Files to create

**`web/src/features/projects/ui/ProjectPullRequestsPanel.tsx`**

Copy from desktop. Fetch PRs from relay (kind = `KIND_PULL_REQUEST` from kinds.ts). Remove Tauri merge/close buttons; replace with read-only status badges or link to open in desktop client.

**`web/src/features/projects/ui/ProjectCommitHistory.tsx`**

List of commits from relay events (kind = `KIND_COMMIT`). Each row: hash (short), message, author, timestamp.

**`web/src/features/projects/ui/ProjectBranchSelector.tsx`**

Dropdown to switch between branches. Reads branch list from relay events.

**`web/src/features/projects/ui/ProjectReadOnlyBanner.tsx`**

Banner shown at top of project views: "Full git operations available in the LenOS desktop app." with a download link.

### Update existing `ReposPage.tsx`

Add tabs: "Files" (existing), "Commits", "Pull Requests", "Branches". Render the new panels per tab.

---

## Phase 33 — Pulse / Activity Feed

**Goal:** Chronological feed of all activity across all channels in the workspace.

**Desktop references:**
- `desktop/src/features/pulse/` — all pulse files

### Files to create

**`web/src/features/pulse/usePulseFeed.ts`**

Subscribe to all message kinds (`[KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2, KIND_FORUM_POST, KIND_THREAD_REPLY]`) with `"#h": [communityId]` and no channel filter. Merge into a single sorted feed.

**`web/src/features/pulse/ui/PulsePage.tsx`**

Infinite-scroll feed of activity cards. Each card shows: channel name, author, message preview, timestamp. Click navigates to the message in its channel.

**`web/src/features/pulse/ui/ActivityCard.tsx`**

Card component. Distinguishes message types visually (chat message, forum post, thread reply, reaction).

### Route to add

```
/pulse  → PulsePage
```

Add "Pulse" nav item to sidebar.

---

## Phase 34 — Agents (Read-Only View)

**Goal:** View deployed AI agents and their session transcripts. No agent management (Tauri-only).

**Desktop references:**
- `desktop/src/features/agents/ui/AgentsSection.tsx`
- `desktop/src/features/agents/ui/AgentCard.tsx`
- `desktop/src/features/agents/ui/ManagedAgentSessionPanel.tsx`
- `desktop/src/features/agents/ui/AgentSessionTranscriptList.tsx`
- Agents are stored as relay events: `KIND_AGENT_DEFINITION`, `KIND_AGENT_SESSION`, `KIND_OBSERVER_NOTE`

### Files to create

**`web/src/features/agents/useAgents.ts`**

Subscribe to `KIND_AGENT_DEFINITION` events with `"#h": [communityId]`. Return list of agents with name, description, status.

**`web/src/features/agents/useAgentSessions.ts`**

Subscribe to `KIND_AGENT_SESSION` events for a specific agent pubkey. Return session list.

**`web/src/features/agents/ui/AgentsPage.tsx`**

Grid of agent cards. Read-only — no start/stop buttons (those require Tauri). Show last active time, total sessions, model name.

**`web/src/features/agents/ui/AgentCard.tsx`**

Card: avatar, name, description, last seen badge. Click opens session transcript panel.

**`web/src/features/agents/ui/AgentSessionPanel.tsx`**

Side panel showing session transcript. Reads `KIND_OBSERVER_NOTE` events for the session. Renders conversation turns.

### Route to add

```
/agents  → AgentsPage
```

Add "Agents" nav item to sidebar.

---

## Phase 35 — Home / Inbox

**Goal:** All-in-one view of unread mentions, DM messages, and thread replies addressing the current user.

**Desktop references:**
- `desktop/src/features/home/` — home feature
- `desktop/src/features/home/useHomeInboxReadState.ts`

### Files to create

**`web/src/features/home/useHomeInbox.ts`**

Scan the message feed for events that mention the current user's pubkey (via `p` tag). Also include unread DMs. Return a sorted list of `InboxItem`.

```typescript
export interface InboxItem {
  type: "mention" | "dm" | "thread_reply";
  messageId: string;
  channelId: string;
  from: string; // pubkey
  content: string;
  createdAt: number;
  isRead: boolean;
}
```

**`web/src/features/home/ui/HomePage.tsx`**

List of inbox items grouped by date. "Mark all read" button. Click an item: navigate to the message in its channel and mark the item read.

**`web/src/features/home/ui/InboxItem.tsx`**

Single inbox row: type icon (mention/DM/reply), author name, channel name, content preview, timestamp, unread dot.

### Route to add

```
/home  → HomePage (or make it the default `/` when on workspace subdomain)
```

Update `index.tsx` redirect: redirect to `/home` instead of `/channels` on workspace subdomain.

---

## Phase 36 — Reminders

**Goal:** Set reminders on messages; view scheduled reminders.

**Desktop references:**
- `desktop/src/features/reminders/` — all reminder files
- `desktop/src/features/reminders/useReminderNotifications.ts`

### How reminders work

Reminders are stored as kind `9735` (or `KIND_REMINDER` from kinds.ts) replaceable events authored by the current user, with `["e", targetMessageId]` and `["expiration", unixTimestamp]` tags.

### Files to create

**`web/src/features/reminders/useReminders.ts`**

Query own kind 9735 events from relay. Return upcoming (not yet expired) reminders.

**`web/src/features/reminders/useReminderNotifications.ts`**

Poll every minute (via `setInterval` in a `useEffect`). When a reminder's expiry time is reached and the user's tab is open: call `showNotification` (Phase 27) with the reminder content.

**`web/src/features/reminders/ui/RemindersPage.tsx`**

List of upcoming reminders. Each row: message preview, reminder time, channel link. "Delete" button.

**`web/src/features/reminders/ui/SetReminderPopover.tsx`**

Popover attached to message context menu (from Phase 16). Time options: "20 minutes", "1 hour", "Tomorrow", "Next week", custom date picker. On select: publish a kind 9735 event.

### Route to add

```
/reminders  → RemindersPage
```

---

## Phase 37 — Custom Emoji

**Goal:** Community-specific emoji that members can use in messages and reactions.

**Desktop references:**
- `desktop/src/features/emoji/` — custom emoji feature
- Custom emoji stored as kind `30030` (emoji pack, NIP-30) events. Each event has `["emoji", shortcode, imageUrl]` tags.

### Files to create

**`web/src/features/emoji/useCustomEmoji.ts`**

Subscribe to kind 30030 events with `"#h": [communityId]`. Return map of `{ shortcode: imageUrl }`.

**`web/src/features/emoji/ui/EmojiPicker.tsx`**

Grid showing standard emoji (via an emoji library like `emoji-mart` — add to dependencies) plus custom community emoji. Used in: message reactions (Phase 15), rich composer emoji autocomplete (Phase 18), status picker (Phase 28).

**`web/src/features/emoji/useEmojiAutocomplete.ts`**

When user types `:abc` in the composer, show autocomplete dropdown of matching emoji (standard + custom). Used in the ProseMirror plugin from Phase 18.

**Render custom emoji in messages**

Update message content rendering in `MessageRow.tsx` to replace `:shortcode:` tokens with `<img>` tags pointing to the custom emoji image URL.

---

## Phase 38 — Community / Workspace Management

**Goal:** Workspace settings accessible to admins: workspace name, icon, invite link management, member roles.

**Desktop references:**
- `desktop/src/features/communities/` — community management
- `desktop/src/features/settings/ui/LenGrowthSettingsPanel.tsx` — LenGrowth-specific settings
- `desktop/src/shared/api/invites.ts`

### Files to create

**`web/src/features/communities/ui/CommunitySettingsModal.tsx`**

Sections:
1. **Overview** — workspace name, description, icon. Save via kind 9002 group metadata edit for the community group id.
2. **Members** — list all members with roles. Admin can promote/demote (kind 9000/9001). 
3. **Invites** — list active invite links; create new invite (publishes kind `KIND_INVITE_CREATE`); copy link.
4. **Danger zone** — delete workspace (admin only; kind 9008 group delete).

**`web/src/features/communities/useInvites.ts`**

Subscribe to invite events for the community. Return list of `{ code, uses, maxUses, expiresAt }`.

**`web/src/features/communities/useCreateInvite.ts`**

Publish kind `KIND_INVITE_CREATE` (check kinds.ts). Return the generated invite code. The invite link format: `https://{slug}.lengrowth.com/invite/{code}`.

### Sidebar entry point

Add a workspace name click target in the sidebar header that opens `CommunitySettingsModal` (for admins only; show nothing on click for regular members).

---

## Phase 39 — Deployment (Cloudflare Pages)

**Goal:** Deploy the web app to Cloudflare Pages, confirm subdomain routing works end-to-end.

### Build command

```bash
cd web
pnpm build
```

Produces `web/dist/` — the static site.

### Deploy command

```bash
npx wrangler pages deploy dist --project-name lenos
```

The `web/wrangler.jsonc` already exists with the project name. Ensure it has:

```json
{
  "name": "lenos",
  "pages_build_output_dir": "dist",
  "compatibility_date": "2024-01-01"
}
```

### Cloudflare Pages custom domains

Each workspace subdomain (`acmen-teste.lengrowth.com`, `mycompany.lengrowth.com`) must route to this Cloudflare Pages project. This is configured in the Cloudflare dashboard:

1. Pages project → Custom domains → Add custom domain: `*.lengrowth.com`
2. DNS: CNAME `*.lengrowth.com → lenos.pages.dev`

The SPA handles subdomain detection via `extractSlug()` in `workspace.ts` which reads `window.location.hostname`.

### Environment variables (Cloudflare Pages dashboard)

| Variable | Value |
|----------|-------|
| `VITE_RELAY_URL` | `wss://relay.lengrowth.com` |

### `_redirects` file

Create `web/public/_redirects` with:

```
/*  /index.html  200
```

This ensures Cloudflare Pages serves `index.html` for all paths (SPA fallback).

### Verify after deploy

1. Visit `https://acmen-teste.lengrowth.com` — workspace shell loads
2. Channels list appears in sidebar (NIP-29 group metadata)
3. Click a channel — messages appear
4. Send a message with Alby extension — appears in timeline
5. Visit `https://lenos.pages.dev` (root domain) — landing/repos page, no workspace shell

---

## Summary

### Phase completion map

| Phase | Output | Status |
|-------|--------|--------|
| 0 | `fetchWorkspace` + `relayWsUrl` fix | ✅ Done |
| 1 | `relay-live-client.ts` (persistent WebSocket) | ✅ Done |
| 2 | `kinds.ts` event constants | ✅ Done |
| 3 | `use-channels.ts` hook | ✅ Done |
| 4 | `use-messages.ts` hook | ✅ Done |
| 5 | `WorkspaceShell.tsx` layout | ✅ Done |
| 6 | `ChannelsSidebar.tsx` | ✅ Done |
| 7 | `MessageTimeline.tsx` | ✅ Done |
| 8 | `MessageComposer.tsx` | ✅ Done |
| 9 | `WorkspaceErrorView.tsx` | ✅ Done |
| 10 | Routing restructure (virtual file routes) | ✅ Done |
| 11 | Wire + test + initial deploy | ✅ Done |
| 12 | `use-profile.ts` — Nostr profile fetching | ✅ Done |
| 13 | `Avatar.tsx` + `MessageRow.tsx` — avatars in timeline | ✅ |
| 14 | Read state + unread badges in sidebar | ✅ |
| 15 | Message reactions (kind 7) | ✅ |
| 16 | Message edit + delete (context menu) | ✅ |
| 17 | Thread / reply system + `ThreadPanel.tsx` | ✅ |
| 18 | ProseMirror rich text composer | ⬜ |
| 19 | Typing indicators | ⬜ |
| 20 | Search modal (Cmd+K) + in-channel find (Ctrl+F) | ⬜ |
| 21 | Settings modal (7 sections) | ⬜ |
| 22 | Auth / onboarding flow (key import, profile setup) | ⬜ |
| 23 | Members sidebar (NIP-29 kind 39002) | ⬜ |
| 24 | Channel management (create / edit / delete) | ⬜ |
| 25 | Moderation (report, mute, ban) | ⬜ |
| 26 | Direct messages (DMs) | ⬜ |
| 27 | Browser notifications (Notification API) | ⬜ |
| 28 | User status + presence dots (NIP-38) | ⬜ |
| 29 | Sidebar enhancements (mute, star, sections, unread filter) | ⬜ |
| 30 | Forum channels (posts + threaded replies) | ⬜ |
| 31 | Workflows (view + trigger) | ⬜ |
| 32 | Projects / git enhanced (PRs, commits, branches) | ⬜ |
| 33 | Pulse / activity feed | ⬜ |
| 34 | Agents read-only view | ⬜ |
| 35 | Home / inbox (mentions + DMs) | ⬜ |
| 36 | Reminders | ⬜ |
| 37 | Custom emoji (NIP-30) | ⬜ |
| 38 | Community / workspace management | ⬜ |
| 39 | Deployment (Cloudflare Pages + `_redirects`) | ⬜ |

### Tauri features not ported to web

These features require Tauri APIs with no browser equivalent and are intentionally excluded from the web app:

| Feature | Reason |
|---------|--------|
| Huddles (voice/audio) | Tauri audio plugin; no WebRTC equivalent wired up yet |
| Mesh compute (local model serving) | Tauri native process management |
| App auto-updater | Tauri updater plugin |
| Mobile pairing | Tauri IPC |
| Desktop tray menu | Tauri window management |
| OS idle detection | Tauri plugin |
| Native file system (git clone/push) | Tauri file system API |
| Keychain / secure storage | Tauri keychain plugin; web uses localStorage |

### Implementation order recommendation

Start with the highest-impact, lowest-complexity phases:

1. Phase 13 (avatars) — visual quality, small lift
2. Phase 14 (unread badges) — core UX, small lift
3. Phase 22 (onboarding) — needed for new users before invite links work
4. Phase 21 (settings) — needed for theme + identity management
5. Phase 20 (search) — high-value, relay already supports NIP-50
6. Phase 26 (DMs) — high demand, medium complexity
7. Phase 15–17 (reactions, edit/delete, threads) — core chat parity
8. Phase 18 (rich composer) — polish, higher complexity
9. Phase 27–29 (notifications, status, sidebar) — notifications + sidebar polish
10. Phase 30–38 (forum, workflows, projects, pulse, agents, home, reminders, emoji, community) — depth features
