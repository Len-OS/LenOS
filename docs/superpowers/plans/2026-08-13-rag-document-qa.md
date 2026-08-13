# RAG Document Q&A — Implementation Prompt

**For another AI agent to implement. Read this entire document before writing a single line of code.**

---

## What you are building

LenOS needs a document Q&A system (RAG — Retrieval-Augmented Generation). Users upload documents to a workspace channel. Later, users or agents ask questions in natural language and get answers grounded in those documents.

Example use cases (explicitly requested by the product owner):
- "What does our Q2 report say about churn?"
- "Summarize last month's ad performance from the PDF"
- "What are the action items from this meeting transcript?"

---

## Codebase context (verified, do not re-derive)

| Area | Fact |
|------|------|
| Database | PostgreSQL 17, multi-tenant. All tables have `community_id UUID NOT NULL`. Partitioned events table with monthly partitions. |
| Migrations | `/migrations/` — numbered SQL files. Add yours as the next number. |
| HTTP framework | Axum (Rust), `crates/lenos-relay/` |
| File storage | S3 via `rust-s3 v0.37`. Upload route already exists at `crates/lenos-relay/src/api/media.rs`. Files are stored with SHA-256 hash as key. |
| Existing upload | Blossom-compatible: `PUT /upload` + `PUT /media/upload`. Auth via NIP-98. Rate-limited per pubkey. |
| LLM providers | `crates/lenos-agent/src/config.rs` — Anthropic (Claude) + OpenAI both configured. Use OpenAI `text-embedding-3-small` for embeddings (128-dim truncated or 1536-dim full). |
| Search today | Postgres FTS: `search_tsv TSVECTOR` column + GIN index on events table. Keyword-only. |
| pgvector | NOT installed yet. Must be added. Postgres 17 supports it. |
| Nostr kinds | `KIND_FILE_METADATA = 1063` (NIP-94) already defined in `crates/lenos-core/src/kind.rs:61`. Use this for document attachment events. |
| Web uploads | Web currently uses FileReader data URLs only. You must add multipart upload to the web client. |
| DB wrapper | `crates/lenos-db/src/lib.rs` — all DB functions go here as methods on `Db`. Pattern: thin method calls module function. |
| Community scoping | Every DB query must include `community_id` in WHERE clause. Same document UUID in two communities = two independent records. |
| Auth | NIP-98 HTTP auth on relay routes. Inspect `crates/lenos-relay/src/api/media.rs` for the auth extraction pattern. |

---

## Architecture

```
User uploads PDF/TXT/MD
        ↓
POST /api/documents (multipart, NIP-98 auth)
        ↓
1. Store raw file in S3 (reuse existing media storage)
2. Extract text (PDF→text, markdown→strip syntax)
3. Chunk text (512 tokens, 50 overlap)
4. Embed each chunk (OpenAI text-embedding-3-small, 1536-dim)
5. Store chunks + embeddings in Postgres (pgvector)
6. Publish kind:1063 Nostr event to the channel
        ↓
Later: user asks question
        ↓
GET /api/documents/search?q=...&community_id=...&channel_id=...
        ↓
1. Embed query (same model)
2. Cosine similarity search in pgvector (top 5 chunks)
3. Return chunks with document metadata
        ↓
Agent (LenGrowth MCP tool) receives chunks + generates answer
```

---

## Scope — what to build

### Backend (Rust, `crates/`)

**New migration** (`migrations/NNNN_documents.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id    UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    channel_id      UUID REFERENCES channels(id) ON DELETE SET NULL,
    uploaded_by     BYTEA NOT NULL,  -- pubkey bytes
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    s3_key          TEXT NOT NULL,
    byte_size       BIGINT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing',  -- processing|ready|failed
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_documents_community ON documents (community_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_channel ON documents (community_id, channel_id) WHERE deleted_at IS NULL;

CREATE TABLE document_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    community_id    UUID NOT NULL,
    chunk_index     INT NOT NULL,
    content         TEXT NOT NULL,
    token_count     INT NOT NULL,
    embedding       VECTOR(1536),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_document ON document_chunks (document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;
```

**New crate** `crates/lenos-rag/`:
- `src/lib.rs` — public API: `RagEngine`, `DocumentProcessor`
- `src/chunker.rs` — recursive character splitter (512 tokens, 50 overlap). No external deps — split on `\n\n`, `\n`, `. `, ` ` in order until chunk ≤ 512 tokens. Token estimate: `text.len() / 4` (good enough for chunking; exact tokenization not needed here).
- `src/extractor.rs` — text extraction: plain text passthrough, Markdown strip (`# `, `**`, `_`, `` ` ``), PDF via `pdf-extract` crate (add to Cargo.toml). Return `Err` for unsupported MIME types.
- `src/embedder.rs` — OpenAI embeddings. POST to `https://api.openai.com/v1/embeddings` with model `text-embedding-3-small`. Read `OPENAI_API_KEY` from env. Batch up to 100 chunks per request. Return `Vec<Vec<f32>>`.
- `src/engine.rs` — `RagEngine { db, s3, embedder }`. Methods:
  - `async fn ingest_document(community_id, channel_id, uploader_pubkey, filename, mime_type, bytes) -> Result<Uuid>` — stores file in S3, extracts text, chunks, embeds, inserts into DB, updates document status.
  - `async fn search(community_id, query, limit, channel_id_filter) -> Result<Vec<ChunkMatch>>` — embeds query, does cosine similarity search, returns top `limit` chunks with document metadata.

**New relay route** `crates/lenos-relay/src/api/documents.rs`:
- `POST /api/documents` — multipart: field `file` (bytes) + field `channel_id` (UUID string, optional). Auth: NIP-98. Max 50MB. Validates MIME type (allow: `text/plain`, `text/markdown`, `application/pdf`). Returns `{ "document_id": "...", "status": "processing" }`. Ingestion runs in `tokio::spawn` (async background).
- `GET /api/documents` — list documents for `?community_id=&channel_id=`. Auth: NIP-98. Returns array of document records.
- `GET /api/documents/search` — `?q=&community_id=&channel_id=&limit=5`. Auth: NIP-98. Returns `{ "chunks": [{ "document_id", "document_name", "chunk_index", "content", "score" }] }`.
- `DELETE /api/documents/:id` — soft delete (set `deleted_at`). Only uploader or admin can delete.

Wire routes into the router in `crates/lenos-relay/src/main.rs` (or wherever the router is built — check the existing pattern).

**DB functions** in `crates/lenos-db/src/document.rs` (new file) + expose via `crates/lenos-db/src/lib.rs`:
- `create_document(pool, params) -> Result<DocumentRecord>`
- `update_document_status(pool, community_id, id, status, error) -> Result<()>`
- `insert_chunks(pool, chunks: &[ChunkRecord]) -> Result<()>` — bulk insert with `COPY` or chunked `INSERT`
- `search_chunks(pool, community_id, embedding: &[f32], limit: i64, channel_id: Option<Uuid>) -> Result<Vec<ChunkMatch>>`
- `list_documents(pool, community_id, channel_id, limit, cursor) -> Result<Vec<DocumentRecord>>`
- `soft_delete_document(pool, community_id, id, deleted_by: &[u8]) -> Result<()>`

**`search_chunks` SQL:**
```sql
SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    d.filename,
    d.channel_id,
    1 - (dc.embedding <=> $1::vector) AS score
FROM document_chunks dc
JOIN documents d ON d.id = dc.document_id
WHERE dc.community_id = $2
  AND d.deleted_at IS NULL
  AND d.status = 'ready'
  AND ($3::uuid IS NULL OR d.channel_id = $3)
  AND dc.embedding IS NOT NULL
ORDER BY dc.embedding <=> $1::vector
LIMIT $4
```

Pass embedding as `Vec<f32>` serialized via `pgvector` crate (add `pgvector = { version = "0.4", features = ["sqlx"] }` to lenos-db Cargo.toml).

### Web (React + TypeScript, `web/src/`)

**`web/src/features/documents/`** (new feature directory):
- `ui/DocumentsPage.tsx` — list of documents in current channel. Empty state prompts upload. Grid of `DocumentCard` components.
- `ui/DocumentCard.tsx` — filename, status badge (processing/ready/failed), uploader, created_at, delete button (own docs only).
- `ui/DocumentUpload.tsx` — drag-and-drop zone + file picker. Accepts PDF/TXT/MD. Shows progress. On select: `POST /api/documents` with `FormData`. Displays error from response if rejected.
- `ui/DocumentSearchPanel.tsx` — right-side panel (like `AgentTranscriptViewer`). Text input, submit. Calls `GET /api/documents/search`. Renders chunks as quoted cards with doc name + score.
- `useDocuments.ts` — `useDocuments(communityId, channelId)` — polls `GET /api/documents` every 5s when any document is `processing`. Uses the existing `getRelayClient` HTTP helper or `fetch` with NIP-98 auth header.

**Add "Documents" entry to channel sidebar** — wherever the channel navigation is (`web/src/features/channels/`), add a "Documents" link that routes to `DocumentsPage`.

Add route in `web/src/app/routes/` following existing route file pattern.

**NIP-98 auth helper** — check if one exists. If not, create `web/src/shared/lib/nip98-auth.ts`:
```typescript
export async function nip98AuthHeader(url: string, method: string): Promise<string> {
  const event = await signNostrEvent({
    kind: 27235,
    content: "",
    tags: [["u", url], ["method", method]],
  }, { requireNip07: true });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}
```

### MCP tool for LenGrowth agents

Add `search_documents` tool to the MCP bridge (`crates/lenos-relay/src/api/mcp.rs` or wherever the MCP tools are defined — find it with `grep -rn "mcp\|tool_name\|CallTool" crates/`):

```json
{
  "name": "search_documents",
  "description": "Search workspace documents for relevant content. Use this when the user asks about uploaded files, reports, PDFs, or documents.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "channel_id": { "type": "string", "description": "Optional: restrict to a specific channel's documents" },
      "limit": { "type": "integer", "default": 5, "maximum": 20 }
    },
    "required": ["query"]
  }
}
```

The tool handler calls `GET /api/documents/search` internally and returns the chunks as tool output.

---

## What NOT to build (out of scope for this task)

- Streaming answers — agents handle generation; this PR only does retrieval
- Re-ranking (cross-encoder) — cosine similarity is sufficient for v1
- Document versioning
- Per-chunk access control beyond channel-level scoping
- OCR for scanned PDFs (pdf-extract handles text-layer PDFs only)

---

## Environment variables to add

```bash
OPENAI_API_KEY=sk-...          # Required for embeddings
LENOS_RAG_MAX_FILE_BYTES=52428800  # 50MB default
LENOS_RAG_ENABLED=true         # Feature flag, default true
```

Add to `.env.example`.

---

## Dependencies to add

**`crates/lenos-rag/Cargo.toml`** (new crate):
```toml
[package]
name = "lenos-rag"
version = "0.1.0"
edition = "2021"

[dependencies]
lenos-db = { path = "../lenos-db" }
lenos-core = { path = "../lenos-core" }
tokio = { workspace = true }
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
serde = { workspace = true }
serde_json = { workspace = true }
uuid = { workspace = true }
chrono = { workspace = true }
tracing = { workspace = true }
thiserror = { workspace = true }
pdf-extract = "0.7"
base64 = "0.22"
```

**`crates/lenos-db/Cargo.toml`** — add:
```toml
pgvector = { version = "0.4", features = ["sqlx"] }
```

**`Cargo.toml` (workspace)** — add `crates/lenos-rag` to members.

---

## Build order

1. Migration (pgvector extension + tables)
2. `crates/lenos-rag` crate (embedder + chunker + extractor first, then engine)
3. `crates/lenos-db` document functions
4. Relay routes (`crates/lenos-relay/src/api/documents.rs`)
5. Wire routes into relay router + add `lenos-rag` as relay dependency
6. Web `DocumentUpload` + `useDocuments`
7. Web `DocumentsPage` + `DocumentCard` + route
8. Web `DocumentSearchPanel`
9. MCP tool registration

---

## Verification checklist

- [ ] `cargo test -p lenos-rag` passes (unit tests for chunker: verify chunk sizes, overlap, no empty chunks)
- [ ] `cargo test -p lenos-db` passes
- [ ] `cargo check -p lenos-relay` clean
- [ ] `pnpm -F web typecheck` clean
- [ ] Upload a PDF via `curl -X PUT /api/documents -F "file=@test.pdf" -H "Authorization: Nostr ..."` → returns `{ "document_id": "...", "status": "processing" }`
- [ ] After processing: `GET /api/documents/search?q=test+query&community_id=...` returns chunks with scores
- [ ] Chunk count: 1-page PDF (~500 words) should produce 1-2 chunks

---

## Key files to read before starting

1. `crates/lenos-relay/src/api/media.rs` — existing upload route pattern (NIP-98 auth, S3 upload, rate limiting)
2. `crates/lenos-db/src/lib.rs` — how DB functions are exposed (thin wrapper pattern)
3. `crates/lenos-db/src/channel.rs` — example of a full DB module to copy structure
4. `migrations/0001_initial_schema.sql` — existing schema context
5. `web/src/features/agents/ui/AgentsPage.tsx` — example page component pattern
6. `web/src/features/agents/ui/CreateAgentDialog.tsx` — example dialog/form pattern
7. `crates/lenos-agent/src/config.rs` — how OpenAI API key is accessed

Do NOT copy the Blossom upload endpoint for documents — documents need different validation (MIME type allowlist, text extraction pipeline) and should be a separate route.
