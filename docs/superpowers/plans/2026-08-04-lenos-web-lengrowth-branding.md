# LenOS Web — LenGrowth Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the LenOS web app as the LenGrowth workspace UI with minimal surface changes, then configure for Cloudflare Pages deploy.

**Architecture:** All branding is shallow — swap icon asset, update page title/favicon, adjust 4 CSS HSL color tokens to emerald, fix one label string. Relay URL is already driven by `VITE_RELAY_URL` env var; no code change needed for relay config.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind CSS v4 (CSS variables), shadcn/ui, pnpm

## Global Constraints

- Working directory: `LenOS/web/`
- pnpm only (no npm/yarn)
- Do NOT change any routing logic, relay connection code, or component structure
- Do NOT change any file outside `LenOS/web/` except copying assets from `LenGrowth/frontend/public/`
- Color tokens: emerald primary only — do not touch background, foreground, muted, or any other token
- No new dependencies

---

### Task 1: Copy LenGrowth assets into web app

**Files:**
- Create: `LenOS/web/src/assets/lengrowth-icon.png` (copy of `LenGrowth/frontend/public/logo-white-small.png`)
- Create: `LenOS/web/public/favicon.ico` (copy of `LenGrowth/frontend/public/favicon/favicon.ico`)
- Create: `LenOS/web/public/favicon-16x16.png` (copy of `LenGrowth/frontend/public/favicon/favicon-16x16.png`)
- Create: `LenOS/web/public/favicon-32x32.png` (copy of `LenGrowth/frontend/public/favicon/favicon-32x32.png`)

**Interfaces:**
- Produces: `@/assets/lengrowth-icon.png` — used by Tasks 2 and 3

- [ ] **Step 1: Copy icon and favicons**

```bash
cp "LenGrowth/frontend/public/logo-white-small.png" "LenOS/web/src/assets/lengrowth-icon.png"
mkdir -p "LenOS/web/public"
cp "LenGrowth/frontend/public/favicon/favicon.ico" "LenOS/web/public/favicon.ico"
cp "LenGrowth/frontend/public/favicon/favicon-16x16.png" "LenOS/web/public/favicon-16x16.png"
cp "LenGrowth/frontend/public/favicon/favicon-32x32.png" "LenOS/web/public/favicon-32x32.png"
```

- [ ] **Step 2: Verify files exist**

```bash
ls LenOS/web/src/assets/lengrowth-icon.png
ls LenOS/web/public/favicon.ico
```

- [ ] **Step 3: Commit**

```bash
cd LenOS
git add web/src/assets/lengrowth-icon.png web/public/favicon.ico web/public/favicon-16x16.png web/public/favicon-32x32.png
git commit -m "feat: add LenGrowth icon and favicon assets"
```

---

### Task 2: Update page title and favicon links in index.html

**Files:**
- Modify: `LenOS/web/index.html`

**Interfaces:**
- Consumes: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` from Task 1 (in `web/public/`)

- [ ] **Step 1: Edit index.html**

Replace the entire contents of `LenOS/web/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LenGrowth</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify build**

```bash
cd LenOS/web && pnpm build 2>&1 | tail -5
```

Expected: no errors, output ends with `✓ built in`

- [ ] **Step 3: Commit**

```bash
cd LenOS
git add web/index.html
git commit -m "feat: update page title and favicon to LenGrowth"
```

---

### Task 3: Replace app icon in InvitePage and ReposPage

**Files:**
- Modify: `LenOS/web/src/features/invite/ui/InvitePage.tsx`
- Modify: `LenOS/web/src/features/repos/ui/ReposPage.tsx`

**Interfaces:**
- Consumes: `@/assets/lengrowth-icon.png` from Task 1

- [ ] **Step 1: Update InvitePage.tsx — import**

In `LenOS/web/src/features/invite/ui/InvitePage.tsx`, line 1, change:
```tsx
import lenosAppIcon from "@/assets/app-icon@3x.png";
```
To:
```tsx
import lengrowthIcon from "@/assets/lengrowth-icon.png";
```

- [ ] **Step 2: Update InvitePage.tsx — usage**

Find the `<img alt="LenOS"` usage (line ~200), change:
```tsx
<img alt="LenOS" className="h-full w-full" src={lenosAppIcon} />
```
To:
```tsx
<img alt="LenGrowth" className="h-full w-full" src={lengrowthIcon} />
```

- [ ] **Step 3: Update ReposPage.tsx — import**

In `LenOS/web/src/features/repos/ui/ReposPage.tsx`, line 5, change:
```tsx
import lenosAppIcon from "@/assets/app-icon@3x.png";
```
To:
```tsx
import lengrowthIcon from "@/assets/lengrowth-icon.png";
```

- [ ] **Step 4: Update ReposPage.tsx — usage**

Find the `<img alt="LenOS"` usage (line ~56), change:
```tsx
<img alt="LenOS" className="h-full w-full" src={lenosAppIcon} />
```
To:
```tsx
<img alt="LenGrowth" className="h-full w-full" src={lengrowthIcon} />
```

- [ ] **Step 5: Verify build**

```bash
cd LenOS/web && pnpm build 2>&1 | tail -5
```

Expected: no TypeScript errors, built successfully

- [ ] **Step 6: Commit**

```bash
cd LenOS
git add web/src/features/invite/ui/InvitePage.tsx web/src/features/repos/ui/ReposPage.tsx
git commit -m "feat: replace LenOS app icon with LenGrowth icon"
```

---

### Task 4: Swap primary color tokens to emerald

**Files:**
- Modify: `LenOS/web/src/shared/styles/globals.css`

**Interfaces:**
- Produces: emerald `--primary` used by all shadcn buttons, sidebar highlights, focus rings

- [ ] **Step 1: Update :root (light mode) primary tokens**

In `LenOS/web/src/shared/styles/globals.css`, inside `:root { ... }`, replace:
```css
    --primary: 266 85.05% 58.04%;
    --primary-foreground: 220 23.08% 94.9%;
```
With:
```css
    --primary: 158 64% 52%;
    --primary-foreground: 0 0% 100%;
```

In the same `:root` block, replace:
```css
    --sidebar-primary: 266 85.05% 58.04%;
    --sidebar-primary-foreground: 220 23.08% 94.9%;
```
With:
```css
    --sidebar-primary: 158 64% 52%;
    --sidebar-primary-foreground: 0 0% 100%;
```

- [ ] **Step 2: Update .dark (dark mode) primary tokens**

In the `.dark { ... }` block, replace:
```css
    --primary: 267 82.69% 79.61%;
    --primary-foreground: 232 23.4% 18.43%;
```
With:
```css
    --primary: 160 84% 39%;
    --primary-foreground: 0 0% 100%;
```

In the same `.dark` block, replace:
```css
    --sidebar-primary: 267 82.69% 79.61%;
    --sidebar-primary-foreground: 232 23.4% 18.43%;
```
With:
```css
    --sidebar-primary: 160 84% 39%;
    --sidebar-primary-foreground: 0 0% 100%;
```

- [ ] **Step 3: Verify build**

```bash
cd LenOS/web && pnpm build 2>&1 | tail -5
```

Expected: built successfully, no errors

- [ ] **Step 4: Commit**

```bash
cd LenOS
git add web/src/shared/styles/globals.css
git commit -m "feat: swap primary color tokens to LenGrowth emerald"
```

---

### Task 5: Update Terms of Service label text

**Files:**
- Modify: `LenOS/web/src/features/invite/ui/InviteJoinPolicyNotice.tsx`

- [ ] **Step 1: Update accessible label on line 116**

Change:
```tsx
          accessibleLabel="I agree to the LenOS Terms of Service and Privacy Policy."
```
To:
```tsx
          accessibleLabel="I agree to the LenGrowth Terms of Service and Privacy Policy."
```

- [ ] **Step 2: Verify build**

```bash
cd LenOS/web && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd LenOS
git add web/src/features/invite/ui/InviteJoinPolicyNotice.tsx
git commit -m "fix: update ToS label text to LenGrowth"
```

---

### Task 6: Verify full build and spot-check dist output

**Files:** none modified

- [ ] **Step 1: Clean build**

```bash
cd LenOS/web && rm -rf dist && pnpm build
```

Expected: zero errors, `dist/` created

- [ ] **Step 2: Confirm title in dist**

```bash
grep -i "LenGrowth\|LenOS" LenOS/web/dist/index.html
```

Expected: only `LenGrowth` in title, no `LenOS` string

- [ ] **Step 3: Confirm LenGrowth icon asset in dist**

```bash
ls LenOS/web/dist/assets/ | grep -i "lengrowth"
```

Expected: `lengrowth-icon-*.png` listed (Vite hashes filename)

---

## Cloudflare Pages setup (manual — not automated)

After all tasks complete, configure via Cloudflare Pages dashboard:

1. Connect `BuildGrowthNow/LenOS` repo, branch `main`
2. Build command: `cd web && pnpm install && pnpm build`
3. Output directory: `web/dist`
4. Environment variable: `VITE_RELAY_URL` = `wss://relay.lengrowth.com`
5. After first deploy, note the Pages hostname (e.g. `lenos-web.pages.dev`)
6. In Cloudflare DNS: add `CNAME *.lengrowth.com → <pages-hostname>` (proxy ON)
