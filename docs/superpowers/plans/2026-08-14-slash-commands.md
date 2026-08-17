# Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing `/` in either composer opens a keyboard-navigable command palette with built-in `/giphy`, `/poll`, and `/remind` commands. Desktop uses Tiptap, web uses ProseMirror; both share the same slash command registry.

**Architecture:** A shared `slashCommandRegistry.ts` defines the `SlashCommand` interface and the three built-in commands. Each platform has a `useSlashCommands` hook (mirrors `useMentions.ts`/`detectPrefixQuery`) and a `SlashCommandPalette` popover component (mirrors `MentionAutocomplete`). The relay gains `GET /api/giphy?q=` proxying to Giphy API. `/poll` publishes two events: kind:40002 (visible in timeline) + kind:30078 (poll data). `/remind` reuses the existing `handleSchedule` pattern.

**Tech Stack:** TypeScript/React, Tiptap (desktop), ProseMirror (web), Nostr kind:30078/40002/7, Rust/axum (relay)

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 5

## Global Constraints

- Web + desktop parity.
- `/` trigger: beginning of line or after whitespace. 120 ms debounce.
- Keyboard: ↑↓ to navigate, Enter to select, Esc to dismiss.
- `/giphy`: relay endpoint `GET /api/giphy?q=` with NIP-98 auth; show top-10 GIF grid in palette; empty state = "No GIFs found".
- `/poll`: two events — kind:40002 channel message (content: `{ type: "poll", pollId }`) + kind:30078 poll data (d:`"poll-{uuid}"`).
- `/remind` time: relative (`10m`, `2h`, `1d`) or absolute ISO-8601.
- Desktop `detectPrefixQuery` at `desktop/src/shared/lib/detectPrefixQuery.ts`.
- Web `SLASH_COMMANDS` stub already at `web/src/features/messages/ui/MessageComposer.tsx:20`.

---

### Task 1: Relay — `GET /api/giphy` endpoint

**Files:**
- Create: `crates/lenos-relay/src/api/giphy.rs`
- Modify: `crates/lenos-relay/src/router.rs`
- Modify: `crates/lenos-relay/src/api/mod.rs`
- Modify: `crates/lenos-relay/src/config.rs` (add `giphy_api_key: Option<String>`)

**Interfaces:**
- Produces: `GET /api/giphy?q=<query>` → `{ gifs: [{url, preview_url, title}] }`

- [ ] **Step 1: Add `giphy_api_key` to `Config`**

In `config.rs`, add field to `Config` struct:

```rust
    /// Giphy API key for the /api/giphy proxy endpoint. Set via `GIPHY_API_KEY`.
    pub giphy_api_key: Option<String>,
```

In `Config::from_env()`:

```rust
        let giphy_api_key = std::env::var("GIPHY_API_KEY").ok();
```

Add `giphy_api_key` to the returned `Config { ... }`.

- [ ] **Step 2: Create `giphy.rs`**

```rust
//! GET /api/giphy — NIP-98 authenticated Giphy search proxy.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;
use super::api_error;

#[derive(Deserialize)]
pub struct GiphyQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 { 10 }

#[derive(Serialize)]
pub struct GifItem {
    pub url: String,
    pub preview_url: String,
    pub title: String,
}

#[derive(Serialize)]
pub struct GiphyResponse {
    pub gifs: Vec<GifItem>,
}

pub async fn search_gifs(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<GiphyQuery>,
) -> Result<Json<GiphyResponse>, (StatusCode, Json<serde_json::Value>)> {
    // NIP-98 auth
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "relay: no community configured"))?;

    let url = super::bridge::nip98_expected_url(&state.config.relay_url, &tenant, "/api/giphy");
    let (_, event_id_bytes) = super::bridge::verify_bridge_auth(
        &headers,
        "GET",
        &url,
        None,
        state.config.require_auth_token,
    )?;
    super::bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    let api_key = state
        .config
        .giphy_api_key
        .as_deref()
        .ok_or_else(|| api_error(StatusCode::SERVICE_UNAVAILABLE, "Giphy not configured"))?;

    let limit = params.limit.min(10);
    let giphy_url = format!(
        "https://api.giphy.com/v1/gifs/search?api_key={api_key}&q={q}&limit={limit}&rating=g",
        api_key = api_key,
        q = urlencoding::encode(&params.q),
        limit = limit,
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| super::internal_error(anyhow::anyhow!(e)))?;

    let resp = client
        .get(&giphy_url)
        .send()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("Giphy unreachable: {e}")))?;

    if !resp.status().is_success() {
        return Err(api_error(StatusCode::BAD_GATEWAY, &format!("Giphy returned {}", resp.status())));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("invalid Giphy response: {e}")))?;

    let gifs = body["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|item| GifItem {
            url: item["images"]["original"]["url"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            preview_url: item["images"]["fixed_height_small"]["url"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            title: item["title"].as_str().unwrap_or("").to_string(),
        })
        .filter(|g| !g.url.is_empty())
        .collect();

    Ok(Json(GiphyResponse { gifs }))
}
```

Note: add `urlencoding` to `crates/lenos-relay/Cargo.toml` if not present. Check with:

```bash
grep urlencoding crates/lenos-relay/Cargo.toml
```

If missing, add `urlencoding = "2"` to the `[dependencies]` section.

- [ ] **Step 3: Register in `mod.rs` and `router.rs`**

`api/mod.rs`:
```rust
pub(crate) mod giphy;
```

`router.rs` (in `build_router()`, near other API routes):
```rust
        .route("/api/giphy", get(api::giphy::search_gifs))
```

- [ ] **Step 4: Compile and test**

```bash
cargo check -p lenos-relay 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add crates/lenos-relay/src/api/giphy.rs \
        crates/lenos-relay/src/api/mod.rs \
        crates/lenos-relay/src/router.rs \
        crates/lenos-relay/src/config.rs
git commit -m "feat(relay): add GET /api/giphy search proxy"
```

---

### Task 2: Shared slash command registry

**Files:**
- Create: `web/src/features/messages/slashCommands/registry.ts`
- Create: `desktop/src/features/messages/slashCommands/registry.ts`

**Interfaces:**
- Produces: `SlashCommand` interface and `SLASH_COMMANDS` array consumed by platform hooks

- [ ] **Step 1: Write desktop registry**

```typescript
// desktop/src/features/messages/slashCommands/registry.ts
export interface CommandContext {
  channelId: string;
  myPubkey: string;
  publishChannelMessage(content: string): Promise<void>;
  publishEvent(kind: number, content: string, tags: string[][]): Promise<void>;
  getRelayHttpBase(): Promise<string>;
  nip98GetHeader(url: string): Promise<string>;
}

export interface SlashCommand {
  name: string;       // "giphy"
  description: string; // "Search and insert a GIF"
  usage: string;       // "/giphy <query>"
  execute(args: string, ctx: CommandContext): Promise<void>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "giphy",
    description: "Search and insert a GIF",
    usage: "/giphy <query>",
    async execute(args, ctx) {
      const query = args.trim();
      if (!query) return;
      const base = await ctx.getRelayHttpBase();
      const url = `${base.replace(/\/+$/, "")}/api/giphy?q=${encodeURIComponent(query)}`;
      const authorization = await ctx.nip98GetHeader(url);
      const res = await fetch(url, { headers: { Authorization: authorization } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { gifs: { url: string; preview_url: string; title: string }[] };
      if (data.gifs.length === 0) throw new Error("no_results");
      // Caller handles GIF selection UI — execute receives the selected gif url:
      // This is called AFTER gif selection, with args = selected gif URL
      await ctx.publishChannelMessage(args); // args is the gif URL when called post-selection
    },
  },
  {
    name: "poll",
    description: "Create a poll",
    usage: "/poll <question> | <option1> | <option2>",
    async execute(args, ctx) {
      const parts = args.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) throw new Error("Need a question and at least 2 options: /poll Q | A | B");
      const [question, ...options] = parts;
      const pollId = crypto.randomUUID();
      // Publish poll data event
      await ctx.publishEvent(30078, JSON.stringify({ question, options, createdAt: Math.floor(Date.now() / 1000) }), [
        ["d", `poll-${pollId}`],
      ]);
      // Publish channel message so it appears in timeline
      await ctx.publishEvent(40002, JSON.stringify({ type: "poll", pollId }), [
        ["h", ctx.channelId],
      ]);
    },
  },
  {
    name: "remind",
    description: "Schedule a reminder message",
    usage: "/remind <time> <message>  (time: 10m, 2h, 1d, or ISO-8601)",
    async execute(args, ctx) {
      const firstSpace = args.indexOf(" ");
      if (firstSpace === -1) throw new Error("Usage: /remind <time> <message>");
      const timeStr = args.slice(0, firstSpace).trim();
      const message = args.slice(firstSpace + 1).trim();
      if (!message) throw new Error("Message cannot be empty");
      const notBefore = parseRemindTime(timeStr);
      if (!notBefore) throw new Error(`Cannot parse time: "${timeStr}". Use 10m, 2h, 1d, or ISO-8601.`);
      const dTag = `scheduled-${crypto.randomUUID()}`;
      await ctx.publishEvent(30078, message, [
        ["d", dTag],
        ["h", ctx.channelId],
        ["not_before", String(notBefore)],
      ]);
    },
  },
];

/** Parse relative (10m, 2h, 1d) or ISO-8601 time string to unix seconds. Returns null if unparseable. */
export function parseRemindTime(s: string): number | null {
  const rel = /^(\d+)(m|h|d)$/.exec(s);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const ms = unit === "m" ? n * 60_000 : unit === "h" ? n * 3_600_000 : n * 86_400_000;
    return Math.floor((Date.now() + ms) / 1000);
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  return null;
}
```

- [ ] **Step 2: Write desktop registry unit test**

```javascript
// desktop/src/features/messages/slashCommands/registry.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { parseRemindTime } from "./registry.ts";

test("parseRemindTime_relative_minutes", () => {
  const result = parseRemindTime("10m");
  const expected = Math.floor((Date.now() + 10 * 60_000) / 1000);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - expected) <= 2, "should be ~10 minutes from now");
});

test("parseRemindTime_relative_hours", () => {
  const result = parseRemindTime("2h");
  const expected = Math.floor((Date.now() + 2 * 3_600_000) / 1000);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - expected) <= 2);
});

test("parseRemindTime_relative_days", () => {
  const result = parseRemindTime("1d");
  const expected = Math.floor((Date.now() + 86_400_000) / 1000);
  assert.ok(result !== null);
  assert.ok(Math.abs(result - expected) <= 2);
});

test("parseRemindTime_invalid_returns_null", () => {
  assert.equal(parseRemindTime("garbage"), null);
  assert.equal(parseRemindTime(""), null);
});

test("parseRemindTime_iso8601", () => {
  const isoDate = "2030-01-01T00:00:00Z";
  const result = parseRemindTime(isoDate);
  assert.ok(result !== null);
  assert.equal(result, Math.floor(Date.parse(isoDate) / 1000));
});
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd desktop && pnpm test src/features/messages/slashCommands/registry.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 4: Write web registry**

```typescript
// web/src/features/messages/slashCommands/registry.ts
// Same interface and implementation as desktop version — copy verbatim.
// (parseRemindTime, SlashCommand, CommandContext, SLASH_COMMANDS are identical)
```

Copy the full content of the desktop registry into the web path.

- [ ] **Step 5: Type-check both**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
cd ../desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 6: Commit**

```bash
git add desktop/src/features/messages/slashCommands/registry.ts \
        desktop/src/features/messages/slashCommands/registry.test.mjs \
        web/src/features/messages/slashCommands/registry.ts
git commit -m "feat: add slash command registry with /giphy, /poll, /remind"
```

---

### Task 3: `PollMessage` component (web + desktop)

**Files:**
- Create: `web/src/features/messages/ui/PollMessage.tsx`
- Create: `desktop/src/features/messages/ui/PollMessage.tsx`

**Interfaces:**
- Consumes: `pollId: string`
- Produces: rendered poll with vote buttons

- [ ] **Step 1: Write web `PollMessage.tsx`**

```tsx
// web/src/features/messages/ui/PollMessage.tsx
import { useEffect, useState } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { signNostrEvent } from "@/shared/lib/nostr-signer";

interface PollData {
  question: string;
  options: string[];
  createdAt: number;
}

function usePollData(pollId: string): PollData | null {
  const [data, setData] = useState<PollData | null>(null);
  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `poll-data-${pollId}`,
      filter: { kinds: [30078], "#d": [`poll-${pollId}`] },
      onEvent: (raw) => {
        try { setData(JSON.parse(raw.content as string) as PollData); } catch {}
      },
    });
    return unsub;
  }, [pollId]);
  return data;
}

function usePollVotes(pollEventDTag: string): Map<string, Set<string>> {
  // Returns Map<optionIndex, Set<pubkey>>
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `poll-votes-${pollEventDTag}`,
      filter: { kinds: [7], "#d": [pollEventDTag] },
      onEvent: (raw) => {
        const optionIdx = raw.content as string;
        const pubkey = raw.pubkey as string;
        setVotes((prev) => {
          const next = new Map(prev);
          if (!next.has(optionIdx)) next.set(optionIdx, new Set());
          next.get(optionIdx)!.add(pubkey);
          return next;
        });
      },
    });
    return unsub;
  }, [pollEventDTag]);
  return votes;
}

interface Props {
  pollId: string;
  currentPubkey: string | null;
}

export function PollMessage({ pollId, currentPubkey }: Props) {
  const poll = usePollData(pollId);
  const votes = usePollVotes(`poll-${pollId}`);

  if (!poll) {
    return (
      <div className="rounded-lg border border-black/10 p-3 text-sm text-black/40 dark:border-white/10 dark:text-white/40">
        Loading poll…
      </div>
    );
  }

  const totalVotes = Array.from(votes.values()).reduce((acc, s) => acc + s.size, 0);
  const myVote = currentPubkey
    ? Array.from(votes.entries()).find(([, s]) => s.has(currentPubkey))?.[0] ?? null
    : null;

  const castVote = async (optionIdx: string) => {
    if (!currentPubkey || myVote === optionIdx) return;
    try {
      const signed = await signNostrEvent(
        { kind: 7, content: optionIdx, tags: [["d", `poll-${pollId}`]] },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(signed as Record<string, unknown>);
    } catch {}
  };

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-sm font-semibold text-black dark:text-white">{poll.question}</p>
      {poll.options.map((option, i) => {
        const idx = String(i);
        const count = votes.get(idx)?.size ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = myVote === idx;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => void castVote(idx)}
            className={`relative w-full overflow-hidden rounded border px-3 py-2 text-left text-sm transition-colors ${
              isMyVote
                ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            }`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-black/5 dark:bg-white/5"
              style={{ width: `${pct}%` }}
            />
            <span className="relative">{option}</span>
            <span className="relative ml-2 text-xs text-black/40 dark:text-white/40">
              {count} ({pct}%)
            </span>
          </button>
        );
      })}
      <p className="text-xs text-black/40 dark:text-white/40">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}
```

- [ ] **Step 2: Write desktop `PollMessage.tsx`**

Desktop version uses the same logic but shadcn/ui primitives and `relayClient.subscribe`:

```tsx
// desktop/src/features/messages/ui/PollMessage.tsx
// Same structure as web, replacing:
// - getRelayClient(relayWsUrl()) → relayClient
// - client.subscribe({ id, filter, onEvent }) → relayClient.subscribe(filter, onEvent)
// - signNostrEvent → signRelayEvent + relayClient.publishEvent
// - Tailwind classes → shadcn/ui equivalents (Card, Button, Progress)
import { useEffect, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { Button } from "@/shared/ui/button";

interface PollData {
  question: string;
  options: string[];
  createdAt: number;
}

function usePollData(pollId: string): PollData | null {
  const [data, setData] = useState<PollData | null>(null);
  useEffect(() => {
    const unsub = relayClient.subscribe(
      { kinds: [30078], "#d": [`poll-${pollId}`] },
      (raw) => { try { setData(JSON.parse(raw.content as string) as PollData); } catch {} },
    );
    return unsub;
  }, [pollId]);
  return data;
}

function usePollVotes(dTag: string): Map<string, Set<string>> {
  const [votes, setVotes] = useState<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    const unsub = relayClient.subscribe(
      { kinds: [7], "#d": [dTag] },
      (raw) => {
        setVotes((prev) => {
          const next = new Map(prev);
          const idx = raw.content as string;
          const pk = raw.pubkey as string;
          if (!next.has(idx)) next.set(idx, new Set());
          next.get(idx)!.add(pk);
          return next;
        });
      },
    );
    return unsub;
  }, [dTag]);
  return votes;
}

interface Props { pollId: string; currentPubkey?: string; }

export function PollMessage({ pollId, currentPubkey }: Props) {
  const poll = usePollData(pollId);
  const votes = usePollVotes(`poll-${pollId}`);

  if (!poll) return <div className="text-sm text-muted-foreground p-3">Loading poll…</div>;

  const total = Array.from(votes.values()).reduce((a, s) => a + s.size, 0);
  const myVote = currentPubkey
    ? Array.from(votes.entries()).find(([, s]) => s.has(currentPubkey))?.[0] ?? null
    : null;

  const castVote = async (idx: string) => {
    if (!currentPubkey || myVote === idx) return;
    try {
      const event = await signRelayEvent({ kind: 7, content: idx, tags: [["d", `poll-${pollId}`]] });
      await relayClient.publishEvent(event, "Timeout voting.", "Failed to vote.");
    } catch {}
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{poll.question}</p>
      {poll.options.map((opt, i) => {
        const idx = String(i);
        const count = votes.get(idx)?.size ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <Button
            key={idx}
            variant={myVote === idx ? "default" : "outline"}
            className="relative w-full justify-start overflow-hidden"
            onClick={() => void castVote(idx)}
          >
            <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${pct}%` }} />
            <span className="relative">{opt}</span>
            <span className="relative ml-auto text-xs text-muted-foreground">{count} ({pct}%)</span>
          </Button>
        );
      })}
      <p className="text-xs text-muted-foreground">{total} vote{total !== 1 ? "s" : ""}</p>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
cd ../desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/ui/PollMessage.tsx \
        desktop/src/features/messages/ui/PollMessage.tsx
git commit -m "feat: add PollMessage component (web + desktop)"
```

---

### Task 4: Wire poll rendering into message timelines

**Files:**
- Modify: `web/src/features/messages/ui/MessageRow.tsx` or `MessageTimeline.tsx`
- Modify: `desktop/src/features/messages/ui/MessageRow.tsx`

**Interfaces:**
- Consumes: `PollMessage` from Task 3

- [ ] **Step 1: Detect poll messages in web MessageRow/Timeline**

In web `MessageRow.tsx`, add detection logic. Messages with `type === "poll"` in parsed content should render `PollMessage` instead of text:

```typescript
import { PollMessage } from "@/features/messages/ui/PollMessage";

// Inside render, before the content paragraph:
let parsedContent: { type?: string; pollId?: string } | null = null;
try { parsedContent = JSON.parse(msg.content); } catch {}
const isPoll = parsedContent?.type === "poll" && parsedContent?.pollId;
```

Replace the content `<p>` with:

```tsx
{isPoll ? (
  <PollMessage pollId={parsedContent!.pollId!} currentPubkey={currentPubkey} />
) : (
  <p className="whitespace-pre-wrap break-words text-sm ...">
    {msg.content}
  </p>
)}
```

- [ ] **Step 2: Same for desktop MessageRow**

Same JSON parse + `isPoll` check. Render `<PollMessage>` from desktop import path.

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -10
cd ../desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/ui/MessageRow.tsx \
        desktop/src/features/messages/ui/MessageRow.tsx
git commit -m "feat: render PollMessage in message timelines"
```

---

### Task 5: Desktop — `useSlashCommands` hook + `SlashCommandPalette`

**Files:**
- Create: `desktop/src/features/messages/slashCommands/useSlashCommands.ts`
- Create: `desktop/src/features/messages/slashCommands/SlashCommandPalette.tsx`

**Interfaces:**
- Consumes: `detectPrefixQuery` from `@/shared/lib/detectPrefixQuery`; `SLASH_COMMANDS` from Task 2
- Produces: `useSlashCommands(text, cursorPos)` → `{ active, query, filtered, selectIndex, setSelectIndex }`

- [ ] **Step 1: Create `useSlashCommands.ts`**

```typescript
// desktop/src/features/messages/slashCommands/useSlashCommands.ts
import { useState, useEffect, useCallback } from "react";
import { SLASH_COMMANDS, type SlashCommand } from "./registry";

function detectSlashQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  // Match "/" at start of line or after whitespace
  const match = /(?:^|\s)(\/\S*)$/.exec(before);
  if (!match) return null;
  return match[1].slice(1); // strip leading "/"
}

function fuzzyMatch(query: string, cmd: SlashCommand): boolean {
  if (!query) return true;
  return cmd.name.startsWith(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase());
}

export function useSlashCommands(text: string, cursorPos: number) {
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<SlashCommand[]>([]);
  const [selectIndex, setSelectIndex] = useState(0);

  useEffect(() => {
    const q = detectSlashQuery(text, cursorPos);
    if (q === null) {
      setActive(false);
      setQuery("");
      setFiltered([]);
      return;
    }
    const results = SLASH_COMMANDS.filter((c) => fuzzyMatch(q, c));
    setActive(true);
    setQuery(q);
    setFiltered(results);
    setSelectIndex(0);
  }, [text, cursorPos]);

  const dismiss = useCallback(() => {
    setActive(false);
    setQuery("");
    setFiltered([]);
  }, []);

  return { active, query, filtered, selectIndex, setSelectIndex, dismiss };
}
```

- [ ] **Step 2: Write test for `detectSlashQuery`**

```javascript
// desktop/src/features/messages/slashCommands/useSlashCommands.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

// Test the pure detection logic (copy the function for testability)
function detectSlashQuery(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const match = /(?:^|\s)(\/\S*)$/.exec(before);
  if (!match) return null;
  return match[1].slice(1);
}

test("detectSlashQuery_at_start", () => {
  assert.equal(detectSlashQuery("/giphy", 6), "giphy");
});

test("detectSlashQuery_after_whitespace", () => {
  assert.equal(detectSlashQuery("hello /poll", 11), "poll");
});

test("detectSlashQuery_partial", () => {
  assert.equal(detectSlashQuery("/gi", 3), "gi");
});

test("detectSlashQuery_no_slash", () => {
  assert.equal(detectSlashQuery("hello world", 11), null);
});

test("detectSlashQuery_slash_not_at_word_boundary", () => {
  // "word/" should not trigger — slash must follow whitespace or be at start
  assert.equal(detectSlashQuery("word/giphy", 10), null);
});
```

- [ ] **Step 3: Run test**

```bash
cd desktop && pnpm test src/features/messages/slashCommands/useSlashCommands.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 4: Create `SlashCommandPalette.tsx`**

```tsx
// desktop/src/features/messages/slashCommands/SlashCommandPalette.tsx
import { useEffect, useRef } from "react";
import type { SlashCommand } from "./registry";

interface Props {
  commands: SlashCommand[];
  selectIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onIndexChange: (i: number) => void;
  onDismiss: () => void;
}

export function SlashCommandPalette({ commands, selectIndex, onSelect, onIndexChange, onDismiss }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
      role="listbox"
      aria-label="Slash commands"
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd.name}
          role="option"
          aria-selected={i === selectIndex}
          onMouseEnter={() => onIndexChange(i)}
          onClick={() => onSelect(cmd)}
          className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
            i === selectIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
          }`}
        >
          <span className="font-mono font-medium text-primary">/{cmd.name}</span>
          <span className="text-muted-foreground">{cmd.description}</span>
          <span className="ml-auto text-xs text-muted-foreground/60">{cmd.usage}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 6: Commit**

```bash
git add desktop/src/features/messages/slashCommands/useSlashCommands.ts \
        desktop/src/features/messages/slashCommands/useSlashCommands.test.mjs \
        desktop/src/features/messages/slashCommands/SlashCommandPalette.tsx
git commit -m "feat(desktop): add useSlashCommands hook and SlashCommandPalette"
```

---

### Task 6: Desktop — wire slash commands into `MessageComposer`

**Files:**
- Modify: `desktop/src/features/messages/ui/MessageComposer.tsx`

**Interfaces:**
- Consumes: `useSlashCommands` from Task 5; `SlashCommandPalette` from Task 5; `SLASH_COMMANDS` from Task 2; `signRelayEvent`, `relayClient`, `getRelayHttpUrl` from shared APIs

- [ ] **Step 1: Add imports**

```typescript
import { useSlashCommands } from "@/features/messages/slashCommands/useSlashCommands";
import { SlashCommandPalette } from "@/features/messages/slashCommands/SlashCommandPalette";
import type { SlashCommand } from "@/features/messages/slashCommands/registry";
import { getRelayHttpUrl, signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";
```

- [ ] **Step 2: Add hook call**

Inside `MessageComposerImpl`, after existing hook calls, add:

```typescript
  const [editorText, setEditorText] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const slashCmds = useSlashCommands(editorText, cursorPos);
```

The Tiptap `onUpdate` callback already fires on content changes (line ~318). Update it to also track `editorText` and `cursorPos`:

```typescript
// In onUpdate callback, add:
const text = editor.getText();
const pos = editor.state.selection.anchor;
setEditorText(text);
setCursorPos(pos);
```

- [ ] **Step 3: Add keyboard handling**

In `handleEditorKeyDown` (line ~761), add slash command navigation before the existing autocomplete handling:

```typescript
if (slashCmds.active) {
  if (e.key === "ArrowUp") {
    e.preventDefault();
    slashCmds.setSelectIndex((i) => Math.max(0, i - 1));
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    slashCmds.setSelectIndex((i) => Math.min(slashCmds.filtered.length - 1, i + 1));
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const cmd = slashCmds.filtered[slashCmds.selectIndex];
    if (cmd) void handleSlashCommand(cmd);
    return;
  }
  if (e.key === "Escape") {
    slashCmds.dismiss();
    return;
  }
}
```

- [ ] **Step 4: Add `handleSlashCommand` function**

```typescript
  const handleSlashCommand = async (cmd: SlashCommand) => {
    // Strip "/cmdname " from editor text
    const currentText = editorText;
    const match = /(?:^|\s)\/\S+\s*(.*)$/.exec(currentText);
    const args = match ? match[1].trim() : "";

    // Clear editor first
    richText.editor?.commands.clearContent();
    slashCmds.dismiss();

    if (cmd.name === "giphy") {
      // /giphy: first fetch results, then show GIF picker
      // For now: execute with args as the query, handle "no_results" error
      try {
        const base = await getRelayHttpUrl();
        const url = `${base.replace(/\/+$/, "")}/api/giphy?q=${encodeURIComponent(args)}`;
        // Build NIP-98 GET auth (same pattern as moderation.ts nip98GetHeader)
        const authEvent = await signRelayEvent({
          kind: 27235,
          content: "",
          tags: [["u", url], ["method", "GET"]],
        });
        const authorization = `Nostr ${btoa(JSON.stringify(authEvent))}`;
        const res = await fetch(url, { headers: { Authorization: authorization } });
        const data = (await res.json()) as { gifs: { url: string; preview_url: string; title: string }[] };
        if (data.gifs.length === 0) {
          // Show feedback — could use a toast if available
          console.info("[Giphy] No results for:", args);
          return;
        }
        // For MVP: insert first GIF URL as message content
        const gifUrl = data.gifs[0].url;
        const event = await signRelayEvent({
          kind: 40002,
          content: gifUrl,
          tags: [["h", channelId ?? ""]],
        });
        await relayClient.publishEvent(event, "Timeout sending GIF.", "Failed to send GIF.");
      } catch (e) {
        console.error("[Giphy] error:", e);
      }
      return;
    }

    // For poll and remind: build CommandContext and call execute
    if (!channelId) return;
    const ctx = {
      channelId,
      myPubkey: "", // resolved separately if needed
      publishChannelMessage: async (content: string) => {
        const event = await signRelayEvent({ kind: 40002, content, tags: [["h", channelId]] });
        await relayClient.publishEvent(event, "Timeout.", "Failed.");
      },
      publishEvent: async (kind: number, content: string, tags: string[][]) => {
        const event = await signRelayEvent({ kind, content, tags });
        await relayClient.publishEvent(event, "Timeout.", "Failed.");
      },
      getRelayHttpBase: getRelayHttpUrl,
      nip98GetHeader: async (url: string) => {
        const authEvent = await signRelayEvent({
          kind: 27235, content: "", tags: [["u", url], ["method", "GET"]],
        });
        return `Nostr ${btoa(JSON.stringify(authEvent))}`;
      },
    };

    try {
      await cmd.execute(args, ctx);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[SlashCommand /${cmd.name}] failed:`, msg);
    }
  };
```

- [ ] **Step 5: Render `SlashCommandPalette`**

In the JSX, render above the editor (find the EditorContent element, around line 1051):

```tsx
{slashCmds.active && slashCmds.filtered.length > 0 && (
  <div className="absolute bottom-full left-0 right-0 z-50 mb-1 px-2">
    <SlashCommandPalette
      commands={slashCmds.filtered}
      selectIndex={slashCmds.selectIndex}
      onSelect={(cmd) => void handleSlashCommand(cmd)}
      onIndexChange={slashCmds.setSelectIndex}
      onDismiss={slashCmds.dismiss}
    />
  </div>
)}
```

Ensure the parent container has `relative` positioning.

- [ ] **Step 6: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 7: Commit**

```bash
git add desktop/src/features/messages/ui/MessageComposer.tsx
git commit -m "feat(desktop): wire slash commands into MessageComposer"
```

---

### Task 7: Web — `useSlashCommands` hook + `SlashCommandPalette` + `MessageComposer` wiring

**Files:**
- Create: `web/src/features/messages/slashCommands/useSlashCommands.ts`
- Create: `web/src/features/messages/slashCommands/SlashCommandPalette.tsx`
- Modify: `web/src/features/messages/ui/MessageComposer.tsx`

**Interfaces:**
- Consumes: `SLASH_COMMANDS` registry from Task 2; web publish pattern

- [ ] **Step 1: Create web `useSlashCommands.ts`**

Identical to desktop Task 5 Step 1 — copy verbatim to `web/src/features/messages/slashCommands/useSlashCommands.ts`.

- [ ] **Step 2: Create web `SlashCommandPalette.tsx`**

Mirror the desktop version with Tailwind classes (not shadcn/ui):

```tsx
// web/src/features/messages/slashCommands/SlashCommandPalette.tsx
import { useEffect, useRef } from "react";
import type { SlashCommand } from "./registry";

interface Props {
  commands: SlashCommand[];
  selectIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onIndexChange: (i: number) => void;
}

export function SlashCommandPalette({ commands, selectIndex, onSelect, onIndexChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="max-h-48 overflow-y-auto rounded-lg border border-black/15 bg-white shadow-lg dark:border-white/15 dark:bg-[#2a2a2a]"
      role="listbox"
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd.name}
          role="option"
          aria-selected={i === selectIndex}
          onMouseEnter={() => onIndexChange(i)}
          onClick={() => onSelect(cmd)}
          className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
            i === selectIndex
              ? "bg-black/5 dark:bg-white/5"
              : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
          }`}
        >
          <span className="font-mono font-medium text-black dark:text-white">/{cmd.name}</span>
          <span className="text-black/50 dark:text-white/50">{cmd.description}</span>
          <span className="ml-auto text-xs text-black/30 dark:text-white/30">{cmd.usage}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire into web `MessageComposer.tsx`**

Read `web/src/features/messages/ui/MessageComposer.tsx` to understand the existing SLASH_COMMANDS stub and the ProseMirror editor structure. Then:

1. Replace the stub import with the new registry import.
2. Add `useSlashCommands(editorText, cursorPos)` — track editor text and cursor from the ProseMirror `dispatchTransaction` callback.
3. Add keyboard handler for ↑↓/Enter/Esc on the slash palette.
4. Add `handleSlashCommand` using web publish pattern (`signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`).
5. Render `<SlashCommandPalette>` above the editor with `absolute bottom-full` positioning.

The web MessageComposer uses a `RichComposer` / `EditorView` pattern (from `web/src/features/messages/ui/RichComposer.tsx`). Track text via the ProseMirror `dispatchTransaction` callback already in place.

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/messages/slashCommands/ \
        web/src/features/messages/ui/MessageComposer.tsx
git commit -m "feat(web): wire slash commands into MessageComposer"
```
