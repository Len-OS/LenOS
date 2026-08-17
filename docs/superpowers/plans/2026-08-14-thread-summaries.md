# Thread Summaries (AI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Summarize thread" button to the thread panel on both web and desktop that POSTs thread messages to the relay, which forwards them to LenGrowth's AI endpoint and returns a summary displayed in a collapsible card.

**Architecture:** Relay gains a new `POST /api/thread-summary` HTTP endpoint with NIP-98 auth that proxies to `LENGROWTH_API_URL/api/ai/summarize`. Both web and desktop get a `useThreadSummary` hook that calls this endpoint, plus a `SummaryCard` collapsible UI component inserted at the top of the thread panel.

**Tech Stack:** Rust/axum (relay), reqwest (HTTP client), TypeScript/React (web + desktop), NIP-98 auth

**Spec:** `docs/superpowers/specs/2026-08-14-phase3-design.md` — Feature 1

## Global Constraints

- Web + desktop parity: both platforms must ship this feature.
- Web publish pattern: `signNostrEvent` + `getRelayClient(relayWsUrl()).publishAndWait()`
- Desktop publish pattern: `signRelayEvent` + `relayClient.publishEvent()`
- Web NIP-98: `makeNip98AuthHeader(url, "POST", { body })` from `@/shared/lib/nip98`
- Desktop NIP-98: `nip98PostHeader(url, body)` from `@/shared/api/invites` (copy pattern, not re-export)
- Desktop HTTP base: `await getRelayHttpUrl()` from `@/shared/api/tauri`
- Web HTTP base: `relayHttpBaseUrl()` from `@/shared/lib/relay-url`

---

### Task 1: Relay — add LENGROWTH_API_URL to Config

**Files:**
- Modify: `crates/lenos-relay/src/config.rs`

**Interfaces:**
- Produces: `config.lengrowth_api_url: Option<String>` accessible from all handlers via `state.config`

- [ ] **Step 1: Add the field to the `Config` struct**

In `config.rs`, after the `admin` field (around line 272), insert:

```rust
    /// Base URL for the LenGrowth AI service (e.g. `https://api.lengrowth.com`).
    /// Required for AI features (thread summaries). Set via `LENGROWTH_API_URL`.
    pub lengrowth_api_url: Option<String>,
```

- [ ] **Step 2: Read it in `Config::from_env()`**

In the `from_env()` function body (after all other `std::env::var` calls, around line 640+), add:

```rust
        let lengrowth_api_url = std::env::var("LENGROWTH_API_URL").ok();
```

Then add `lengrowth_api_url` to the `Config { ... }` struct literal returned by `from_env()`.

- [ ] **Step 3: Compile-check**

```bash
cargo check -p lenos-relay
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add crates/lenos-relay/src/config.rs
git commit -m "feat(relay): add LENGROWTH_API_URL to relay Config"
```

---

### Task 2: Relay — POST /api/thread-summary handler

**Files:**
- Create: `crates/lenos-relay/src/api/thread_summary.rs`
- Modify: `crates/lenos-relay/src/router.rs`
- Modify: `crates/lenos-relay/src/api/mod.rs` (add module declaration)

**Interfaces:**
- Consumes: `config.lengrowth_api_url: Option<String>` from Task 1
- Consumes: `verify_bridge_auth()` and `check_nip98_replay()` from `super::bridge`
- Produces: `POST /api/thread-summary` endpoint

- [ ] **Step 1: Create `thread_summary.rs`**

```rust
//! POST /api/thread-summary — forward thread messages to LenGrowth AI summarizer.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;
use super::{api_error, internal_error};

#[derive(Deserialize)]
pub struct ThreadMessage {
    pub pubkey: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Deserialize)]
pub struct SummarizeRequest {
    pub messages: Vec<ThreadMessage>,
}

#[derive(Serialize)]
pub struct SummarizeResponse {
    pub summary: String,
}

pub async fn summarize_thread(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SummarizeRequest>,
) -> Result<Json<SummarizeResponse>, (StatusCode, Json<serde_json::Value>)> {
    // NIP-98 auth (same pattern as documents.rs)
    let raw_host = headers
        .get(axum::http::header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let tenant = crate::tenant::bind_community(&state.db, raw_host)
        .await
        .map_err(|_| api_error(StatusCode::NOT_FOUND, "relay: no community configured"))?;

    let url = super::bridge::nip98_expected_url(
        &state.config.relay_url,
        &tenant,
        "/api/thread-summary",
    );
    let (_, event_id_bytes) = super::bridge::verify_bridge_auth(
        &headers,
        "POST",
        &url,
        None,
        state.config.require_auth_token,
    )?;
    super::bridge::check_nip98_replay(&state, &tenant, event_id_bytes).await?;

    // Require LENGROWTH_API_URL
    let base_url = state
        .config
        .lengrowth_api_url
        .as_deref()
        .ok_or_else(|| api_error(StatusCode::SERVICE_UNAVAILABLE, "AI summarization not configured"))?;

    if body.messages.is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "messages array is empty"));
    }

    // Forward to LenGrowth
    let upstream_url = format!("{}/api/ai/summarize", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| internal_error(anyhow::anyhow!(e)))?;

    let upstream_body = serde_json::json!({ "messages": body.messages });

    let resp = client
        .post(&upstream_url)
        .json(&upstream_body)
        .send()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("LenGrowth unreachable: {e}")))?;

    if !resp.status().is_success() {
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            &format!("LenGrowth returned {}", resp.status()),
        ));
    }

    let result: SummarizeResponse = resp
        .json()
        .await
        .map_err(|e| api_error(StatusCode::BAD_GATEWAY, &format!("invalid LenGrowth response: {e}")))?;

    Ok(Json(result))
}
```

- [ ] **Step 2: Register module in `api/mod.rs`**

Find the `pub(crate) mod` declarations in `crates/lenos-relay/src/api/mod.rs` and add:

```rust
pub(crate) mod thread_summary;
```

- [ ] **Step 3: Register route in `router.rs`**

In `build_router()`, before the `/hooks/{id}` line (line ~147), add:

```rust
        // AI thread summarization — NIP-98 auth, proxies to LenGrowth
        .route("/api/thread-summary", post(api::thread_summary::summarize_thread))
```

- [ ] **Step 4: Compile and test**

```bash
cargo test -p lenos-relay 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/lenos-relay/src/api/thread_summary.rs \
        crates/lenos-relay/src/api/mod.rs \
        crates/lenos-relay/src/router.rs
git commit -m "feat(relay): add POST /api/thread-summary endpoint"
```

---

### Task 3: Web — `useThreadSummary` hook + `SummaryCard` component

**Files:**
- Create: `web/src/features/messages/useThreadSummary.ts`
- Create: `web/src/features/messages/ui/SummaryCard.tsx`

**Interfaces:**
- Consumes: `relayHttpBaseUrl()` from `@/shared/lib/relay-url`; `makeNip98AuthHeader()` from `@/shared/lib/nip98`
- Consumes: `Message` type from `@/features/messages/use-messages`
- Produces: `useThreadSummary(messages)` → `{ summary, loading, error, summarize }`
- Produces: `<SummaryCard summary loading onDismiss />` component

- [ ] **Step 1: Create `useThreadSummary.ts`**

```typescript
import { useState, useCallback } from "react";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import type { Message } from "@/features/messages/use-messages";

interface SummaryState {
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useThreadSummary(messages: Message[]) {
  const [state, setState] = useState<SummaryState>({
    summary: null,
    loading: false,
    error: null,
  });

  const summarize = useCallback(async () => {
    if (messages.length === 0) return;
    setState({ summary: null, loading: true, error: null });
    try {
      const url = `${relayHttpBaseUrl()}/api/thread-summary`;
      const body = JSON.stringify({
        messages: messages.map((m) => ({
          pubkey: m.pubkey,
          content: m.content,
          created_at: m.createdAt,
        })),
      });
      const authorization = await makeNip98AuthHeader(url, "POST", { body });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { summary: string };
      setState({ summary: data.summary, loading: false, error: null });
    } catch (e) {
      setState({ summary: null, loading: false, error: "Failed to summarize thread." });
    }
  }, [messages]);

  const dismiss = useCallback(() => {
    setState({ summary: null, loading: false, error: null });
  }, []);

  return { ...state, summarize, dismiss };
}
```

- [ ] **Step 2: Create `SummaryCard.tsx`**

```tsx
interface Props {
  summary: string;
  onDismiss: () => void;
}

export function SummaryCard({ summary, onDismiss }: Props) {
  return (
    <div className="mx-4 mb-3 rounded-lg border border-black/10 bg-black/5 p-3 text-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
          AI Summary
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
        >
          Dismiss
        </button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-black/80 dark:text-white/80">
        {summary}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/features/messages/useThreadSummary.ts \
        web/src/features/messages/ui/SummaryCard.tsx
git commit -m "feat(web): add useThreadSummary hook and SummaryCard component"
```

---

### Task 4: Web — integrate into `ThreadPanel.tsx`

**Files:**
- Modify: `web/src/features/messages/ui/ThreadPanel.tsx`

**Interfaces:**
- Consumes: `useThreadSummary()` from Task 3; `SummaryCard` from Task 3

- [ ] **Step 1: Add import and hook call**

At the top of `ThreadPanel.tsx`, add imports:

```typescript
import { Sparkles } from "lucide-react";
import { useThreadSummary } from "@/features/messages/useThreadSummary";
import { SummaryCard } from "@/features/messages/ui/SummaryCard";
```

Inside `ThreadPanel()`, after the existing state declarations (line ~68), add:

```typescript
  const allMessages = [rootMessage, ...replies];
  const { summary, loading, error, summarize, dismiss } = useThreadSummary(allMessages);
```

- [ ] **Step 2: Add Summarize button to header**

Replace the header `<span>Thread</span>` section (lines ~107–118):

```tsx
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="text-sm font-semibold text-black dark:text-white">
          Thread
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void summarize()}
            disabled={loading}
            title="Summarize thread with AI"
            className="rounded p-1 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/5"
            aria-label="Summarize thread"
          >
            <Sparkles className="h-4 w-4 text-black/60 dark:text-white/60" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close thread"
          >
            <X className="h-4 w-4 text-black/60 dark:text-white/60" />
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Render SummaryCard and error state**

Inside the scrollable content div (before `<RootRow>`), add:

```tsx
        {(summary || loading || error) && (
          <div className="mb-2">
            {loading && (
              <div className="px-4 py-2 text-xs text-black/40 dark:text-white/40">
                Summarizing…
              </div>
            )}
            {error && (
              <div className="px-4 py-2 text-xs text-red-500">{error}</div>
            )}
            {summary && <SummaryCard summary={summary} onDismiss={dismiss} />}
          </div>
        )}
```

- [ ] **Step 4: Type-check**

```bash
cd web && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add web/src/features/messages/ui/ThreadPanel.tsx
git commit -m "feat(web): add Summarize Thread button to ThreadPanel"
```

---

### Task 5: Desktop — `useThreadSummary` hook

**Files:**
- Create: `desktop/src/features/messages/useThreadSummary.ts`

**Interfaces:**
- Consumes: `getRelayHttpUrl`, `signRelayEvent` from `@/shared/api/tauri`
- Consumes: thread messages array of shape `{ pubkey: string; content: string; createdAt: number }`
- Produces: same interface as web Task 3 hook

- [ ] **Step 1: Create hook**

```typescript
import { useState, useCallback } from "react";
import { getRelayHttpUrl, signRelayEvent } from "@/shared/api/tauri";

const NIP98_KIND = 27235;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function nip98PostHeader(url: string, body: string): Promise<string> {
  const authEvent = await signRelayEvent({
    kind: NIP98_KIND,
    content: "",
    tags: [
      ["u", url],
      ["method", "POST"],
      ["payload", await sha256Hex(body)],
      ["nonce", crypto.randomUUID()],
    ],
  });
  return `Nostr ${btoa(JSON.stringify(authEvent))}`;
}

interface ThreadMsg {
  pubkey: string;
  content: string;
  createdAt: number;
}

interface SummaryState {
  summary: string | null;
  loading: boolean;
  error: string | null;
}

export function useThreadSummary(messages: ThreadMsg[]) {
  const [state, setState] = useState<SummaryState>({
    summary: null,
    loading: false,
    error: null,
  });

  const summarize = useCallback(async () => {
    if (messages.length === 0) return;
    setState({ summary: null, loading: true, error: null });
    try {
      const httpBase = await getRelayHttpUrl();
      const url = `${httpBase.replace(/\/+$/, "")}/api/thread-summary`;
      const body = JSON.stringify({
        messages: messages.map((m) => ({
          pubkey: m.pubkey,
          content: m.content,
          created_at: m.createdAt,
        })),
      });
      const authorization = await nip98PostHeader(url, body);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authorization },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { summary: string };
      setState({ summary: data.summary, loading: false, error: null });
    } catch {
      setState({ summary: null, loading: false, error: "Failed to summarize thread." });
    }
  }, [messages]);

  const dismiss = useCallback(() => {
    setState({ summary: null, loading: false, error: null });
  }, []);

  return { ...state, summarize, dismiss };
}
```

- [ ] **Step 2: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add desktop/src/features/messages/useThreadSummary.ts
git commit -m "feat(desktop): add useThreadSummary hook"
```

---

### Task 6: Desktop — `SummaryCard` component + `MessageThreadPanel` integration

**Files:**
- Create: `desktop/src/features/messages/ui/SummaryCard.tsx`
- Modify: `desktop/src/features/messages/ui/MessageThreadPanel.tsx`

**Interfaces:**
- Consumes: `useThreadSummary()` from Task 5
- Consumes: `threadHead` + `threadReplies` props already on `MessageThreadPanel`

- [ ] **Step 1: Create `SummaryCard.tsx` for desktop**

Desktop uses shadcn/ui, so use its card primitives:

```tsx
import { Button } from "@/shared/ui/button";

interface Props {
  summary: string;
  onDismiss: () => void;
}

export function SummaryCard({ summary, onDismiss }: Props) {
  return (
    <div className="mx-3 mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Summary
        </span>
        <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-foreground/80">{summary}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add hook + button + card to `MessageThreadPanel.tsx`**

Add imports near the top:

```typescript
import { Sparkles } from "lucide-react";
import { useThreadSummary } from "@/features/messages/useThreadSummary";
import { SummaryCard } from "@/features/messages/ui/SummaryCard";
```

Inside `MessageThreadPanel`, find the destructured props (line ~53) and the thread messages. The `threadHead` is the root message, `threadReplies` are the replies. Add after the existing hook calls:

```typescript
  const allThreadMessages = [
    ...(threadHead ? [{ pubkey: threadHead.pubkey, content: threadHead.content, createdAt: threadHead.createdAt }] : []),
    ...threadReplies.map((r) => ({ pubkey: r.pubkey, content: r.content, createdAt: r.createdAt })),
  ];
  const { summary, loading, error: summaryError, summarize, dismiss } = useThreadSummary(allThreadMessages);
```

In the panel header (find `AuxiliaryPanelHeaderGroup` around line 919), add the Summarize button alongside existing header buttons:

```tsx
<Button
  variant="ghost"
  size="icon"
  title="Summarize thread with AI"
  disabled={loading}
  onClick={() => void summarize()}
  aria-label="Summarize thread"
>
  <Sparkles className="h-4 w-4" />
</Button>
```

Below the header section and above the message list, add:

```tsx
{(summary || loading || summaryError) && (
  <>
    {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Summarizing…</div>}
    {summaryError && <div className="px-3 py-2 text-xs text-destructive">{summaryError}</div>}
    {summary && <SummaryCard summary={summary} onDismiss={dismiss} />}
  </>
)}
```

- [ ] **Step 3: Type-check**

```bash
cd desktop && pnpm tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/features/messages/ui/SummaryCard.tsx \
        desktop/src/features/messages/ui/MessageThreadPanel.tsx
git commit -m "feat(desktop): add Summarize Thread button to MessageThreadPanel"
```
