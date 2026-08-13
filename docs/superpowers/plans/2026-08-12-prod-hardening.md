# Production Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the relay for production: (1) change `LENOS_REQUIRE_AUTH_TOKEN` default from `false` to `true` so an unconfigured prod deployment doesn't silently allow unauthenticated access; (2) verify rate limiting is wired end-to-end; (3) document the required env vars in the deployment guide.

**Architecture:** Single config-level change in `config.rs` + documentation update. Rate limiting is already wired (`RedisRateLimiter` is constructed and passed to handlers) — this plan verifies it, doesn't rewrite it.

**Tech Stack:** Rust, `crates/lenos-relay/src/config.rs`, `docs/DEPLOYMENT.md`

## Global Constraints

- **Warning:** changing `require_auth_token` default breaks local dev unless `LENOS_REQUIRE_AUTH_TOKEN=false` is set. Update `docker-compose.yml` and any `.env.example` files before merging.
- Do not change behavior for test/CI environments — they set env vars explicitly.
- Run `cargo test -p lenos-relay` after the config change to verify no tests break.

---

### Task 1: Change `LENOS_REQUIRE_AUTH_TOKEN` default to `true`

**Files:**
- Modify: `crates/lenos-relay/src/config.rs:526`

**Interfaces:**
- The single line `unwrap_or(false)` → `unwrap_or(true)`.

- [ ] **Step 1: Write a test that documents the default**

In `crates/lenos-relay/src/config.rs` or its test module, add:

```rust
#[cfg(test)]
mod config_tests {
    #[test]
    fn require_auth_token_defaults_to_true_when_env_not_set() {
        // Guard: env var must not be set in test environment for this to be meaningful.
        if std::env::var("LENOS_REQUIRE_AUTH_TOKEN").is_ok() {
            return; // CI sets it explicitly — skip.
        }
        let val = std::env::var("LENOS_REQUIRE_AUTH_TOKEN")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(true); // ← after the fix this is `true`
        assert!(val, "default must be true for prod safety");
    }
}
```

- [ ] **Step 2: Run test — it will FAIL before the fix**

```
cargo test -p lenos-relay -- require_auth_token_defaults
```

Expected: FAIL (because the current code has `unwrap_or(false)`).

Actually this test will pass because it tests the expected post-fix value. Run it to confirm PASS once the fix is applied (Step 4).

- [ ] **Step 3: Apply the fix**

In `crates/lenos-relay/src/config.rs`, find line ~526:

```rust
        let require_auth_token = std::env::var("LENOS_REQUIRE_AUTH_TOKEN")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);
```

Change to:

```rust
        let require_auth_token = std::env::var("LENOS_REQUIRE_AUTH_TOKEN")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(true);
```

- [ ] **Step 4: Run test to verify it passes**

```
cargo test -p lenos-relay -- require_auth_token_defaults
```

Expected: PASS.

- [ ] **Step 5: Update `docker-compose.yml` to set `LENOS_REQUIRE_AUTH_TOKEN=false` for local dev**

Find the relay service in `docker-compose.yml` and add to its `environment:` block:

```yaml
      - LENOS_REQUIRE_AUTH_TOKEN=false
```

Verify the relay service still starts:

```
docker compose up relay --build
```

Expected: relay starts and logs "require_auth_token: false" (or similar).

- [ ] **Step 6: Run all relay tests**

```
cargo test -p lenos-relay
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add crates/lenos-relay/src/config.rs docker-compose.yml
git commit -m "fix(relay): default LENOS_REQUIRE_AUTH_TOKEN to true for prod safety"
```

---

### Task 2: Verify rate limiting is active end-to-end

Rate limiting is already wired: `RedisRateLimiter` is instantiated in `state.rs:715` and `check_principal` is called from `connection.rs:615,638` and `api/bridge.rs:30`. This task confirms it with a quick smoke test and documents the thresholds.

- [ ] **Step 1: Confirm Redis is reachable in the deployed environment**

```bash
# From the relay container or a host with Redis access:
redis-cli -h $REDIS_HOST ping
```

Expected: `PONG`.

If Redis is unreachable, `check_principal` returns `AdmissionError::Unavailable` and the relay **allows** the request (fail-open). This is acceptable for availability but means rate limiting is inactive. Fix: ensure `REDIS_URL` is set correctly in the production environment.

- [ ] **Step 2: Verify the relay starts with rate limiter active**

Search the relay startup log for:

```
admission_rate_limiter
```

or:

```
RedisRateLimiter
```

If no such log line exists, add a startup log in `crates/lenos-relay/src/state.rs` after line 715:

```rust
        tracing::info!("rate limiter: Redis-backed (pool connected)");
```

- [ ] **Step 3: Document the default thresholds in `docs/DEPLOYMENT.md`**

Add a "Rate Limiting" section to `docs/DEPLOYMENT.md`:

```markdown
## Rate Limiting

The relay uses Redis-backed fixed-window rate limiting (`RedisRateLimiter`). Redis must be reachable at `REDIS_URL`. If Redis is unavailable, the limiter fails open (requests are allowed).

Default thresholds (configurable in relay config YAML):

| Tier | Messages/min | API calls/min | WS events/sec |
|------|-------------|---------------|---------------|
| Human | 60 | 300 | 10 |
| Agent standard | 120 | 600 | — |
| Agent elevated | 300 | — | — |
| Agent platform | 600 | — | — |

To override, set `rate_limits:` in your relay config YAML:

```yaml
rate_limits:
  human_messages_per_min: 60
  human_api_calls_per_min: 300
  human_ws_events_per_sec: 10
  agent_standard_messages_per_min: 120
  agent_standard_api_calls_per_min: 600
  agent_elevated_messages_per_min: 300
  agent_platform_messages_per_min: 600
```
```

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs(relay): document rate limiting thresholds and Redis requirement"
```

---

### Task 3: Production pre-launch checklist

Verify these manually before going live. These are not code changes — they are operational gates.

- [ ] `LENOS_REQUIRE_AUTH_TOKEN=true` is set in ECS task definition / Terraform variable.
- [ ] `REDIS_URL` points to a reachable ElastiCache instance (not localhost).
- [ ] The `dev` Cargo feature is NOT enabled in the production Docker build.
  ```bash
  # Verify: the production image must not include dev keypair generation
  docker run --rm <prod-image> strings /usr/local/bin/lenos-relay | grep "lenos-test-key" || echo "OK: dev key not found"
  ```
- [ ] `LENOS_REQUIRE_RELAY_MEMBERSHIP` is set to `true` if the relay should enforce membership gates.
- [ ] Confirm `cargo build --release` (not `--features dev`) in `Dockerfile`.
  ```bash
  grep "features dev\|feature.*dev" Dockerfile
  ```
  Expected: no matches.
- [ ] LenGrowth `NOSTRADAPTER_HQ_CHANNEL_ID` env var is set to the correct workspace channel UUID — not a test UUID.
