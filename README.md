# LenOS

Private relay infrastructure powering [LenGrowth](https://lengrowth.com).

LenOS is the Nostr-protocol relay, agent harness, and client layer that backs every LenGrowth workspace. It provides the event store, agent runtime, real-time messaging, and client apps (web, desktop, mobile) that LenGrowth's growth agents operate within.

---

## How LenOS and LenGrowth connect

```
User signs up on LenGrowth
        │
        ▼
LenGrowth web (Scalingo: lengrowth-web, Next.js)
        │  POST /api/auth/managed-nostr/provision
        │  → per-user encrypted Nostr identity
        ▼
LenGrowth backend (Scalingo: lengrowth-main, FastAPI)
        │  POST /operator/communities (NIP-98)
        │  → provisions relay community per workspace slug
        ▼
LenOS Relay (AWS ECS/Fargate, Rust/Axum)
        │  wss://relay.lengrowth.com
        │
        ├── Postgres (RDS)       ← events, channels, workflows, audit, agent_credentials
        ├── Redis (ElastiCache)  ← pub/sub fan-out, presence, typing indicators
        └── S3                   ← media (Blossom) + huddle recordings

LenOS web app (Cloudflare Pages: *.lengrowth.com)
```

Each LenGrowth workspace gets:
1. A Nostr keypair for the growth agent (via `managed_nostr` route)
2. A relay community scoped to that workspace
3. A `lenos-acp` subprocess connecting to `wss://relay.lengrowth.com` using `lenos-agent` (AWS Bedrock) as the LLM backend

Agent subscribes per `crates/lenos-acp/agents/lengrowth.toml`: fires on `@lengrowth` mentions and in the dedicated HQ channel. LenGrowth's FastMCP server at `/mcp` is the agent's tool surface via `LENGROWTH_MCP_URL`.

---

## Clients

- **Web** (React SPA) — served at `*.lengrowth.com` via Cloudflare Pages
- **Desktop** (Tauri + React) — macOS, Linux, Windows; local-first, best for development
- **Mobile** (Flutter, iOS + Android) — channels, agents, DMs, pulse

---

## Quick start

You'll need Docker, Rust 1.88+, Node 24+, pnpm 10+, `just`.

```bash
git clone <this repo> && cd LenOS

# First time
just setup && just build

# Every day
just dev   # relay + web dev server + desktop app
```

Relay: `ws://localhost:3000`. Web: `http://localhost:5173`.

```bash
just relay      # relay only (terminal 1)
just web-dev    # web dev server only (terminal 2)
```

---

## Key docs

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Codebase guide for AI agents and internal devs — repo structure, patterns, gotchas |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design: event pipeline, crate map, security model, subsystem reference |
| [docs/STATUS.md](docs/STATUS.md) | Single source of truth: what works, confirmed gaps, production verification state |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying the relay (Railway, Docker Compose, production Compose bundle) |
| [docs/lengrowth-integration-runbook.md](docs/lengrowth-integration-runbook.md) | LenGrowth ↔ LenOS integration runbook |
| [RELEASING.md](RELEASING.md) | Release process: desktop, relay, mobile, web |
| [TESTING.md](TESTING.md) | Multi-agent E2E test guide |
| [SECURITY.md](SECURITY.md) | Security policy and reporting |

---

## Common dev commands

```bash
just setup          # Docker, migrations, desktop deps
just relay          # Run the relay
just dev            # Run the desktop app + relay
just build          # Build the Rust workspace
just check          # fmt + clippy + desktop check
just test-unit      # Unit tests (no infra required)
just test           # Full suite (starts services if needed)
just ci             # Everything CI runs
just reset          # ⚠️  Wipe data + recreate
```
