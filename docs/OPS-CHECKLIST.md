# Pre-Launch Ops Checklist

Items requiring human action — cannot be automated. Check off and record date when done.

---

## Critical (P0 — must complete before any user traffic)

- [ ] **G-10a: Fix Scalingo production environment**

  Current state: `ENVIRONMENT=development` on production — exposes `/docs`, disables `https_only` on session cookies, `SESSION_SECRET` falls back to `JWT_SECRET`.

  ```bash
  scalingo -a lengrowth-main env-set \
    SESSION_SECRET=$(openssl rand -hex 32) \
    ENVIRONMENT=production
  ```

  Verify: `curl https://growth-api.lenquant.com/docs` must return 404.

- [ ] **Deploy Cloudflare security headers**

  File `web/public/_headers` was created 2026-08-23 — needs a Cloudflare Pages deploy.

  ```bash
  git push origin main
  ```

  Verify after deploy:
  ```bash
  curl -I https://lenos-e2e32.lengrowth.com | grep -i "content-security-policy\|x-frame-options"
  ```

---

## High (P1 — before inviting beta users)

- [ ] **Provision durable test identities for E2E**

  Call `POST https://growth-api.lenquant.com/api/auth/managed-nostr/provision` for:
  - `fern2gue+32@gmail.com` (Supabase JWT required)
  - `fern2gue+33@gmail.com`

  Password: `Teste009@!`

  Update `LenGrowth/docs/lenos-web-authenticated-fixture.json` with returned pubkeys.
  Confirm `relay_member=true` via relay operator endpoint.

- [ ] **Verify task dispatch end-to-end**

  In a live workspace: `@lengrowth create task: test task dispatch callback`
  Expected: agent acknowledges, task appears in LenGrowth dashboard, completion event arrives in channel.

- [ ] **G-10b: Create 4 OAuth apps and set 12 workspace integration env vars**

  Full checklist: `LenGrowth/docs/workspace-integrations-oauth-setup.md`

  Apps needed: GitHub, Notion, Linear, Slack (workspace integrations).
  Callbacks: `https://growth-api.lenquant.com/api/workspace-integrations/{provider}/callback`

---

## Medium (P2 — within first week of beta)

- [ ] Screen reader audit — VoiceOver (macOS) + NVDA (Windows) manual tab-order review
- [ ] Gate F (desktop/native) — sidecar lifecycle, `lenos://` deep links, Tauri updater (requires real signed build)
- [ ] Live E2E (Gates B–E) — requires real NIP-07 identities and live relay membership
- [ ] Fill in `[relay-owner]` etc. in `docs/ON-CALL.md`

---

## Future (P3 — roadmap)

- [ ] SSO / SAML for enterprise
- [ ] Event TTL / automated Postgres purge
- [ ] S3 lifecycle policy for media
- [ ] GDPR deletion endpoint
- [ ] Age-gate
- [ ] Per-workspace provider credentials
- [ ] Per-track huddle recording
