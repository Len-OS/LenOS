# Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement /giphy, /poll, /remind slash commands with a shared registry and autocomplete palette on both web and desktop.

**Architecture:** Shared registry in `shared/lib/slashCommandRegistry.ts` (or two copies). Detection hook mirrors `useMentions.ts`. Palette anchored above composer. Three built-in commands. Relay gets `/api/giphy` proxy endpoint.

**Tech Stack:** TypeScript/React, Rust/Axum, Nostr kind:30078/kind:7/kind:40002, shadcn/ui (desktop), Tailwind (web)

**Spec:** docs/superpowers/specs/2026-08-14-phase3-design.md (Feature 5)

## Global Constraints

- Web + Desktop parity: feature ships on BOTH platforms
- Shared registry: `web/src/shared/lib/slashCommandRegistry.ts` AND `desktop/src/shared/lib/slashCommandRegistry.ts` (same content)
- Web publish: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Desktop publish: `signRelayEvent` + `relayClient.publishEvent(event, timeoutMsg, errorMsg)`
- Desktop subscribe: `relayClient.subscribeLive` (NOT `.subscribe`)
- NIP-98 auth on giphy endpoint: `makeNip98AuthHeader(url, "GET")` (web), `signRelayEvent({kind:27235,...})` (desktop)
- Relay: add `GIPHY_API_KEY` to config; add `GET /api/giphy` route; NIP-98 auth via `verify_bridge_auth`
- config.rs also has `lengrowth_api_url` (from Plan 1) — do NOT remove it
- Pre-existing compile error in `crates/lenos-relay/src/api/webhooks.rs:239` — do NOT touch

---

### Task 1: Relay — giphy proxy endpoint

**Files:**
- Modify: `crates/lenos-relay/src/config.rs`
- Create: `crates/lenos-relay/src/api/giphy.rs`
- Modify: `crates/lenos-relay/src/api/mod.rs`
- Modify: `crates/lenos-relay/src/router.rs`

**Interfaces:**
- Produces: `GET /api/giphy?q=<query>` — NIP-98 auth required; returns `{ gifs: [{ url: string, preview_url: string, title: string }] }`
- Relay env: `GIPHY_API_KEY`

- [ ] **Step 1: Read config.rs to understand existing structure**

```bash
grep -n "lengrowth_api_url\|from_env\|pub " crates/lenos-relay/src/config.rs | head -20
```

- [ ] **Step 2: Add GIPHY_API_KEY to config.rs**

Following the exact same pattern as `lengrowth_api_url` (already in the file), add:
```rust
pub giphy_api_key: Option<String>,
```
And in `from_env()`:
```rust
giphy_api_key: std::env::var("GIPHY_API_KEY").ok(),
```

- [ ] **Step 3: Read an existing relay API handler to understand structure**

```bash
cat crates/lenos-relay/src/api/thread_summary.rs
```

- [ ] **Step 4: Write giphy.rs**

```rust
use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};
use crate::AppState;
use crate::api::auth::{verify_bridge_auth, check_nip98_replay};

#[derive(Deserialize)]
pub struct GiphyQuery {
    pub q: String,
}

#[derive(Serialize, Deserialize)]
pub struct GifResult {
    pub url: String,
    pub preview_url: String,
    pub title: String,
}

#[derive(Serialize)]
pub struct GiphyResponse {
    pub gifs: Vec<GifResult>,
}

pub async fn search_gifs(
    State(state): State<AppState>,
    axum::TypedHeader(auth): axum::TypedHeader<axum::headers::Authorization<axum::headers::authorization::Bearer>>,
    Query(params): Query<GiphyQuery>,
) -> Result<Json<GiphyResponse>, axum::response::Response> {
    // NIP-98 auth
    let relay_url = format!("{}/api/giphy", state.config.relay_url);
    verify_bridge_auth(&auth.0.token(), &relay_url, "GET", None, &state)
        .map_err(|e| e.into_response())?;
    check_nip98_replay(&auth.0.token(), &state)
        .await
        .map_err(|e| e.into_response())?;

    let api_key = state.config.giphy_api_key.as_deref().unwrap_or_default();
    if api_key.is_empty() {
        return Ok(Json(GiphyResponse { gifs: vec![] }));
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.giphy.com/v1/gifs/search")
        .query(&[("api_key", api_key), ("q", &params.q), ("limit", "10")])
        .send()
        .await
        .map_err(|_| axum::response::Response::builder()
            .status(502)
            .body(axum::body::Body::from("giphy upstream error"))
            .unwrap())?;

    #[derive(Deserialize)]
    struct GiphyApiResp {
        data: Vec<GiphyApiGif>,
    }
    #[derive(Deserialize)]
    struct GiphyApiGif {
        title: String,
        images: GiphyImages,
    }
    #[derive(Deserialize)]
    struct GiphyImages {
        original: GiphyUrl,
        fixed_height_small: GiphyUrl,
    }
    #[derive(Deserialize)]
    struct GiphyUrl {
        url: String,
    }

    let body: GiphyApiResp = resp.json().await.map_err(|_| {
        axum::response::Response::builder()
            .status(502)
            .body(axum::body::Body::from("giphy parse error"))
            .unwrap()
    })?;

    let gifs = body.data.into_iter().map(|g| GifResult {
        url: g.images.original.url,
        preview_url: g.images.fixed_height_small.url,
        title: g.title,
    }).collect();

    Ok(Json(GiphyResponse { gifs }))
}
```

Check actual auth helper names by reading `crates/lenos-relay/src/api/thread_summary.rs` — adjust function names to match.

- [ ] **Step 5: Add to mod.rs and router.rs**

In `api/mod.rs`, add `pub(crate) mod giphy;`.

In `router.rs`, find where `POST /api/thread-summary` was added and add nearby:
```rust
.route("/api/giphy", get(api::giphy::search_gifs))
```

Add `use axum::routing::get;` if not already imported.

- [ ] **Step 6: cargo check (NOT cargo test — pre-existing test failure)**

```bash
cd crates/lenos-relay && cargo check 2>&1 | grep -v "^warning" | head -20
```

Fix any errors.

- [ ] **Step 7: Commit**

```bash
git add crates/lenos-relay/src/config.rs crates/lenos-relay/src/api/giphy.rs crates/lenos-relay/src/api/mod.rs crates/lenos-relay/src/router.rs
git commit -m "feat(relay): add GET /api/giphy proxy with NIP-98 auth"
```

---

### Task 2: Shared slash command registry

**Files:**
- Create: `web/src/shared/lib/slashCommandRegistry.ts`
- Create: `desktop/src/shared/lib/slashCommandRegistry.ts`

**Interfaces:**
- Produces: `SLASH_COMMANDS: SlashCommand[]` — exported array with giphy, poll, remind
- Produces: `CommandContext` — interface for execute context
- Produces: `SlashCommand` — interface

- [ ] **Step 1: Find how web and desktop import relayHttpBaseUrl and makeNip98AuthHeader**

```bash
grep -rn "relayHttpBaseUrl\|makeNip98AuthHeader\|relayHttpUrl\|getRelayHttpUrl" web/src/shared/ --include="*.ts" | head -5
grep -rn "relayHttpBaseUrl\|getRelayHttpUrl\|signRelayEvent" desktop/src/shared/ --include="*.ts" | head -5
```

- [ ] **Step 2: Write web/src/shared/lib/slashCommandRegistry.ts**

```typescript
export interface CommandContext {
  channelId: string;
  publishEvent(params: { kind: number; content: string; tags: string[][] }): Promise<void>;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  execute(args: string, context: CommandContext): Promise<void>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "giphy",
    description: "Search GIFs",
    usage: "/giphy <query>",
    async execute(_args, _context) {
      // Invocation handled by SlashCommandPalette (shows grid picker)
    },
  },
  {
    name: "poll",
    description: "Create a poll",
    usage: "/poll <question> | <opt1> | <opt2>",
    async execute(args, context) {
      const parts = args.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) throw new Error("Poll needs a question and at least 2 options");
      const [question, ...options] = parts;
      const pollId = crypto.randomUUID();
      await context.publishEvent({
        kind: 40002,
        content: JSON.stringify({ type: "poll", pollId }),
        tags: [["e", context.channelId, "", "root"]],
      });
      await context.publishEvent({
        kind: 30078,
        content: JSON.stringify({ question, options, createdAt: Math.floor(Date.now() / 1000) }),
        tags: [["d", `poll-${pollId}`]],
      });
    },
  },
  {
    name: "remind",
    description: "Set a reminder",
    usage: "/remind <time> <message>",
    async execute(args, context) {
      const spaceIdx = args.indexOf(" ");
      if (spaceIdx === -1) throw new Error("Usage: /remind <time> <message>");
      const timeStr = args.slice(0, spaceIdx).trim();
      const message = args.slice(spaceIdx + 1).trim();
      const notBefore = parseRemindTime(timeStr);
      await context.publishEvent({
        kind: 30078,
        content: JSON.stringify({ message, channelId: context.channelId }),
        tags: [
          ["d", `scheduled-${crypto.randomUUID()}`],
          ["not_before", String(notBefore)],
        ],
      });
    },
  },
];

function parseRemindTime(s: string): number {
  const now = Math.floor(Date.now() / 1000);
  const rel = s.match(/^(\d+)(m|h|d)$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const secs = unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return now + n * secs;
  }
  const abs = Date.parse(s);
  if (!isNaN(abs)) return Math.floor(abs / 1000);
  throw new Error(`Cannot parse time: ${s}`);
}
```

- [ ] **Step 3: Write desktop/src/shared/lib/slashCommandRegistry.ts**

Identical content to web version (same registry). Desktop's CommandContext.publishEvent uses desktop publish APIs but the registry file itself is plain TS with no platform-specific imports.

- [ ] **Step 4: Type-check both**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
cd desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add web/src/shared/lib/slashCommandRegistry.ts desktop/src/shared/lib/slashCommandRegistry.ts
git commit -m "feat: add slash command registry with giphy, poll, remind"
```

---

### Task 3: Web — PollMessage component

**Files:**
- Create: `web/src/features/messages/ui/PollMessage.tsx`
- Create: `web/src/features/messages/hooks/usePollData.ts`
- Create: `web/src/features/messages/hooks/usePollVotes.ts`

**Interfaces:**
- Produces: `<PollMessage pollId={string} />` — self-contained poll renderer
- Produces: `usePollData(pollId)` → `{ question: string, options: string[], createdAt: number } | null`
- Produces: `usePollVotes(pollEventId)` → `Map<string, Set<string>>` (optionIndex → Set<pubkey>)

- [ ] **Step 1: Find relay subscribe and sign patterns used in web**

```bash
grep -rn "subscribe\|relayWsUrl\|getRelayClient" web/src/features/messages/hooks/ --include="*.ts" | head -10
grep -rn "signNostrEvent\|publishAndWait" web/src/features/messages/ --include="*.ts" | head -5
```

- [ ] **Step 2: Write usePollData.ts**

Subscribes kind:30078 `#d: ["poll-{pollId}"]`, parses content.

```typescript
import { useState, useEffect } from "react";
import { getRelayClient, relayWsUrl } from "@/shared/lib/relay";

interface PollData {
  question: string;
  options: string[];
  createdAt: number;
}

export function usePollData(pollId: string | null): PollData | null {
  const [data, setData] = useState<PollData | null>(null);
  useEffect(() => {
    if (!pollId) return;
    const client = getRelayClient(relayWsUrl());
    const sub = client.subscribe(
      [{ kinds: [30078], "#d": [`poll-${pollId}`], limit: 1 }],
      (event) => {
        try { setData(JSON.parse(event.content)); } catch {}
      }
    );
    return () => sub.close();
  }, [pollId]);
  return data;
}
```

- [ ] **Step 3: Write usePollVotes.ts**

Subscribes kind:7 reactions with `#e: [pollEventId]`, groups by content (option index).

```typescript
import { useState, useEffect } from "react";
import { getRelayClient, relayWsUrl } from "@/shared/lib/relay";

export function usePollVotes(pollEventId: string | null): Map<string, Set<string>> {
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    if (!pollEventId) return;
    const client = getRelayClient(relayWsUrl());
    const sub = client.subscribe(
      [{ kinds: [7], "#e": [pollEventId] }],
      (event) => {
        setVotes((prev) => {
          const next = new Map(prev);
          const optionIdx = event.content;
          const set = new Set(next.get(optionIdx) ?? []);
          set.add(event.pubkey);
          next.set(optionIdx, set);
          return next;
        });
      }
    );
    return () => sub.close();
  }, [pollEventId]);
  return votes;
}
```

- [ ] **Step 4: Write PollMessage.tsx**

```tsx
import { usePollData } from "../hooks/usePollData";
import { usePollVotes } from "../hooks/usePollVotes";
import { signNostrEvent } from "@/shared/lib/nostr";
import { getRelayClient, relayWsUrl } from "@/shared/lib/relay";

interface Props {
  pollId: string;
  channelMessageEventId: string; // the kind:40002 event's id
}

export function PollMessage({ pollId, channelMessageEventId }: Props) {
  const data = usePollData(pollId);
  const votes = usePollVotes(channelMessageEventId);

  if (!data) return <div className="text-xs text-muted-foreground">Loading poll…</div>;

  const totalVotes = Array.from(votes.values()).reduce((sum, s) => sum + s.size, 0);

  const handleVote = async (optionIdx: number) => {
    const event = await signNostrEvent({
      kind: 7,
      content: String(optionIdx),
      tags: [["e", channelMessageEventId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    await getRelayClient(relayWsUrl()).publishAndWait(event);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 max-w-sm">
      <p className="text-sm font-medium">{data.question}</p>
      <div className="space-y-1.5">
        {data.options.map((opt, i) => {
          const count = votes.get(String(i))?.size ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              className="w-full text-left rounded border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent relative overflow-hidden"
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative">{opt}</span>
              <span className="relative float-right text-xs text-muted-foreground">{count > 0 ? `${pct}%` : ""}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add web/src/features/messages/ui/PollMessage.tsx web/src/features/messages/hooks/usePollData.ts web/src/features/messages/hooks/usePollVotes.ts
git commit -m "feat(web): add PollMessage component with usePollData and usePollVotes"
```

---

### Task 4: Web — slash command detection hook + palette + composer wiring

**Files:**
- Create: `web/src/features/messages/hooks/useSlashCommands.ts`
- Create: `web/src/features/messages/ui/SlashCommandPalette.tsx`
- Modify: `web/src/features/messages/ui/MessageComposer.tsx` (or equivalent web composer)
- Modify: `web/src/features/messages/ui/MessageTimeline.tsx` (detect poll messages)

**Interfaces:**
- Consumes: `SLASH_COMMANDS` from `@/shared/lib/slashCommandRegistry`
- Produces: `useSlashCommands(text, cursorPos)` → `{ active, query, filtered, selectedIdx, select, moveUp, moveDown, dismiss }`

- [ ] **Step 1: Find web message composer**

```bash
grep -rn "MessageComposer\|handleSubmit\|composer\|EditorContent" web/src/features/messages/ --include="*.tsx" | head -15
grep -rn "useMentions\|detectPrefixQuery\|MentionAutocomplete" web/src/features/messages/ --include="*.ts" --include="*.tsx" | head -10
```

- [ ] **Step 2: Write useSlashCommands.ts**

```typescript
import { useState, useMemo } from "react";
import { SLASH_COMMANDS, SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface SlashCommandState {
  active: boolean;
  query: string;
  filtered: SlashCommand[];
  selectedIdx: number;
}

export function useSlashCommands(text: string, _cursorPos: number) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const match = text.match(/^\/(\S*)$/);
  const active = match !== null;
  const query = match?.[1] ?? "";

  const filtered = useMemo(
    () =>
      active
        ? SLASH_COMMANDS.filter(
            (c) => query === "" || c.name.toLowerCase().startsWith(query.toLowerCase())
          )
        : [],
    [active, query]
  );

  return {
    active,
    query,
    filtered,
    selectedIdx: Math.min(selectedIdx, Math.max(0, filtered.length - 1)),
    select: (idx: number) => {
      setSelectedIdx(0);
      return filtered[idx] ?? null;
    },
    moveUp: () => setSelectedIdx((i) => Math.max(0, i - 1)),
    moveDown: () => setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1)),
    dismiss: () => setSelectedIdx(0),
  };
}
```

- [ ] **Step 3: Write SlashCommandPalette.tsx**

```tsx
import { SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface Props {
  commands: SlashCommand[];
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandPalette({ commands, selectedIdx, onSelect }: Props) {
  if (commands.length === 0) return null;
  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 rounded-lg border border-border bg-popover shadow-md overflow-hidden z-50">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-accent ${
            i === selectedIdx ? "bg-accent" : ""
          }`}
        >
          <span className="font-mono font-medium text-primary">/{cmd.name}</span>
          <span className="text-xs text-muted-foreground">{cmd.description}</span>
          <span className="ml-auto text-xs text-muted-foreground/70">{cmd.usage}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire into web composer**

Read the web composer file (found in step 1). In the composer:
1. Import `useSlashCommands` and `SlashCommandPalette`
2. Call `useSlashCommands(inputText, cursorPos)`
3. Render `<SlashCommandPalette>` above the input when `active && filtered.length > 0`
4. On key events: ↑/↓ navigate, Enter executes selected command (calls `cmd.execute(queryAfterCommandName, ctx)`) or submits
5. On command selection: clear input, build `CommandContext` with `channelId` and `publishEvent` (wraps `signNostrEvent + publishAndWait`), call `cmd.execute`

The giphy command needs special handling: show a gif grid (defer — just send the giphy URL as message for MVP; note this in commit message).

- [ ] **Step 5: Wire poll detection in MessageTimeline**

Find where message content is rendered in MessageTimeline or MessageRow. Add detection:
```tsx
// In the message rendering path
const parsedContent = (() => {
  try { return JSON.parse(msg.content); } catch { return null; }
})();
if (parsedContent?.type === "poll" && parsedContent.pollId) {
  return <PollMessage pollId={parsedContent.pollId} channelMessageEventId={msg.id} />;
}
```

Check what component actually renders `msg.content` to know where to add this.

- [ ] **Step 6: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add web/src/features/messages/hooks/useSlashCommands.ts web/src/features/messages/ui/SlashCommandPalette.tsx web/src/features/messages/ui/MessageComposer.tsx web/src/features/messages/ui/MessageTimeline.tsx
git commit -m "feat(web): add slash command palette, poll detection in timeline"
```

---

### Task 5: Desktop — PollMessage + slash command palette

**Files:**
- Create: `desktop/src/features/messages/ui/PollMessage.tsx`
- Create: `desktop/src/features/messages/hooks/usePollData.ts`
- Create: `desktop/src/features/messages/hooks/usePollVotes.ts`
- Create: `desktop/src/features/messages/hooks/useSlashCommands.ts`
- Create: `desktop/src/features/messages/ui/SlashCommandPalette.tsx`

**Interfaces:**
- Consumes: `SLASH_COMMANDS` from `@/shared/lib/slashCommandRegistry`
- Uses shadcn/ui `Button` components

- [ ] **Step 1: Find desktop relay client subscribe/publish patterns**

```bash
grep -rn "subscribeLive\|publishEvent\|relayClient" desktop/src/features/messages/pinning/usePollData.ts 2>/dev/null || grep -rn "subscribeLive\|publishEvent" desktop/src/features/messages/pinning/ --include="*.ts" | head -10
```

- [ ] **Step 2: Write desktop usePollData.ts and usePollVotes.ts**

Mirror web versions but use `relayClient.subscribeLive` with `limit: 1` and disposed-flag pattern.

usePollData:
```typescript
import { useState, useEffect } from "react";
import { useRelayClient } from "@/shared/api/relay-client";

interface PollData { question: string; options: string[]; createdAt: number; }

export function usePollData(pollId: string | null): PollData | null {
  const [data, setData] = useState<PollData | null>(null);
  const relayClient = useRelayClient();
  useEffect(() => {
    if (!pollId || !relayClient) return;
    let disposed = false;
    const unsub = relayClient.subscribeLive(
      { kinds: [30078], "#d": [`poll-${pollId}`], limit: 1 },
      (event) => {
        if (disposed) return;
        try { setData(JSON.parse(event.content)); } catch {}
      }
    );
    return () => { disposed = true; unsub(); };
  }, [pollId, relayClient]);
  return data;
}
```

usePollVotes:
```typescript
import { useState, useEffect } from "react";
import { useRelayClient } from "@/shared/api/relay-client";

export function usePollVotes(pollEventId: string | null): Map<string, Set<string>> {
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());
  const relayClient = useRelayClient();
  useEffect(() => {
    if (!pollEventId || !relayClient) return;
    let disposed = false;
    const unsub = relayClient.subscribeLive(
      { kinds: [7], "#e": [pollEventId] },
      (event) => {
        if (disposed) return;
        setVotes((prev) => {
          const next = new Map(prev);
          const set = new Set(next.get(event.content) ?? []);
          set.add(event.pubkey);
          next.set(event.content, set);
          return next;
        });
      }
    );
    return () => { disposed = true; unsub(); };
  }, [pollEventId, relayClient]);
  return votes;
}
```

Adjust `useRelayClient` import path by checking how `usePinnedMessages.ts` imports it.

- [ ] **Step 3: Write desktop PollMessage.tsx with shadcn/ui**

```tsx
import { Button } from "@/shared/ui/button";
import { usePollData } from "../hooks/usePollData";
import { usePollVotes } from "../hooks/usePollVotes";
import { signRelayEvent } from "@/shared/api/tauri";
import { useRelayClient } from "@/shared/api/relay-client";

interface Props {
  pollId: string;
  channelMessageEventId: string;
}

export function PollMessage({ pollId, channelMessageEventId }: Props) {
  const data = usePollData(pollId);
  const votes = usePollVotes(channelMessageEventId);
  const relayClient = useRelayClient();

  if (!data) return <p className="text-xs text-muted-foreground">Loading poll…</p>;

  const totalVotes = Array.from(votes.values()).reduce((sum, s) => sum + s.size, 0);

  const handleVote = async (optionIdx: number) => {
    const event = await signRelayEvent({
      kind: 7,
      content: String(optionIdx),
      tags: [["e", channelMessageEventId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    relayClient?.publishEvent(event, "publishing vote", "vote failed");
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 max-w-sm">
      <p className="text-sm font-medium">{data.question}</p>
      <div className="space-y-1.5">
        {data.options.map((opt, i) => {
          const count = votes.get(String(i))?.size ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="w-full justify-start relative overflow-hidden"
              onClick={() => handleVote(i)}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${pct}%` }} />
              <span className="relative">{opt}</span>
              {count > 0 && <span className="relative ml-auto text-xs text-muted-foreground">{pct}%</span>}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}
```

- [ ] **Step 4: Write desktop useSlashCommands.ts and SlashCommandPalette.tsx**

`useSlashCommands.ts` — identical to web version (pure TS, no platform deps).

`SlashCommandPalette.tsx` — shadcn/ui styled:
```tsx
import { SlashCommand } from "@/shared/lib/slashCommandRegistry";

interface Props {
  commands: SlashCommand[];
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandPalette({ commands, selectedIdx, onSelect }: Props) {
  if (commands.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden">
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-accent transition-colors ${
            i === selectedIdx ? "bg-accent" : ""
          }`}
        >
          <span className="font-mono font-medium text-primary">/{cmd.name}</span>
          <span className="text-xs text-muted-foreground">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add desktop/src/features/messages/ui/PollMessage.tsx desktop/src/features/messages/hooks/usePollData.ts desktop/src/features/messages/hooks/usePollVotes.ts desktop/src/features/messages/hooks/useSlashCommands.ts desktop/src/features/messages/ui/SlashCommandPalette.tsx
git commit -m "feat(desktop): add PollMessage, usePollData, usePollVotes, SlashCommandPalette"
```

---

### Task 6: Desktop — wire slash commands into composer + poll detection in timeline

**Files:**
- Modify: `desktop/src/features/messages/ui/MessageComposer.tsx` (or equivalent)
- Modify: `desktop/src/features/messages/ui/MessageTimeline.tsx` or `TimelineMessageList.tsx`

**Interfaces:**
- Consumes: `useSlashCommands`, `SlashCommandPalette`, `PollMessage` from Task 5
- Consumes: `signRelayEvent` + `relayClient.publishEvent` for CommandContext.publishEvent

- [ ] **Step 1: Find desktop composer and message rendering**

```bash
grep -rn "MessageComposer\|Composer\|handleSend\|onSendMessage" desktop/src/features/messages/ --include="*.tsx" | head -15
grep -rn "msg.content\|message.body\|parsed\|JSON.parse" desktop/src/features/messages/ui/TimelineMessageList.tsx | head -10
```

- [ ] **Step 2: Wire SlashCommandPalette into desktop composer**

Same approach as web Task 4:
1. Import hooks and palette
2. Call `useSlashCommands(inputText, cursorPos)` 
3. Render `<SlashCommandPalette>` above input when active
4. Handle keyboard (↑↓ Enter Esc)
5. On select: build CommandContext, call `cmd.execute`

Desktop CommandContext.publishEvent:
```typescript
async publishEvent({ kind, content, tags }) {
  const event = await signRelayEvent({
    kind, content, tags,
    created_at: Math.floor(Date.now() / 1000),
  });
  relayClient.publishEvent(event, "publishing slash command event", "slash command failed");
}
```

- [ ] **Step 3: Wire poll detection in desktop timeline**

In `TimelineMessageList.tsx` or wherever message content renders, add poll detection (same as web Task 4 step 5):
```tsx
const parsedContent = (() => {
  try { return JSON.parse(message.body); } catch { return null; }
})();
if (parsedContent?.type === "poll" && parsedContent.pollId) {
  return <PollMessage pollId={parsedContent.pollId} channelMessageEventId={message.id} />;
}
```

Note: desktop uses `message.body` (not `message.content`) — verify the field name.

- [ ] **Step 4: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/features/messages/ui/
git commit -m "feat(desktop): wire slash commands into composer, poll detection in timeline"
```
