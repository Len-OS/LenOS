# LenOS Web — LenGrowth Branding + Deploy Design

**Date:** 2026-08-04  
**Status:** Approved  
**Scope:** Minimal surface branding changes + Cloudflare Pages deploy config

---

## Goal

Rebrand the LenOS web app (`web/`) as the LenGrowth workspace UI. Ship to Cloudflare Pages pointed at `wss://relay.lengrowth.com`. Keep changes minimal — functional over cosmetic.

---

## Changes

### 1. Page title + favicon

- `web/index.html`: `<title>LenGrowth</title>` + favicon link to LenGrowth favicon
- Copy `LenGrowth/frontend/public/favicon/favicon.ico` → `web/public/favicon.ico`

### 2. App icon

- Copy `LenGrowth/frontend/public/logo-white-small.png` → `web/src/assets/lengrowth-icon.png`
- Update import in `InvitePage.tsx` and `ReposPage.tsx`: `lenosAppIcon` → `lengrowthIcon`
- Update `alt` attributes: `"LenOS"` → `"LenGrowth"`

### 3. Color tokens (globals.css)

Swap primary from Catppuccin mauve to emerald. Touch only `--primary`, `--primary-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground` in both `:root` and `.dark`.

| Token | Light (HSL) | Dark (HSL) |
|---|---|---|
| `--primary` | `158 64% 52%` | `160 84% 39%` |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` |
| `--sidebar-primary` | same as primary | same as primary |
| `--sidebar-primary-foreground` | `0 0% 100%` | `0 0% 100%` |

### 4. Terms of Service text

- `InviteJoinPolicyNotice.tsx`: "LenOS Terms of Service" → "LenGrowth Terms of Service"

### 5. Relay URL

- Not hardcoded — set via Cloudflare Pages env var: `VITE_RELAY_URL=wss://relay.lengrowth.com`
- No code change needed; `relay-url.ts` already reads `import.meta.env.VITE_RELAY_URL`

---

## Deploy

- Platform: Cloudflare Pages
- Repo: `BuildGrowthNow/LenOS`, branch: `main`
- Build command: `cd web && pnpm install && pnpm build`
- Output dir: `web/dist`
- Env vars: `VITE_RELAY_URL=wss://relay.lengrowth.com`
- DNS: wildcard `*.lengrowth.com` CNAME → Pages hostname (proxy ON)

---

## Out of scope

- Subdomain routing logic (reads `window.location.hostname` → community UUID) — separate task
- "Enter workspace" post-login flow in LenGrowth frontend — separate task
- Full zinc/dark theme replacement — deferred
