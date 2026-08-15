# Workspace Branding (White-Label per Tenant)

**Date:** 2026-08-15  
**Status:** Approved  
**Surfaces:** Web, Desktop (Tauri/React), Mobile (Flutter)

---

## Overview

Each lenOS workspace gets per-tenant visual branding: a logo avatar, an accent color, and self-service subdomain editing. Dark/light mode remains per-user (already exists). Branding is workspace-wide — all members see the same colors and avatar.

---

## Decisions

| Question | Decision |
|---|---|
| Branding storage | Extend kind 9002 (NIP-29 group metadata) with `picture` + `color` tags |
| Subdomain storage | DB-only (`communities` table), new relay PATCH endpoint |
| Who edits branding | Workspace admins (kind 9002 admin gate, existing NIP-29 auth) |
| Who edits subdomain | Owner only (extra check in relay PATCH handler) |
| Dark/light mode | Per-user, already exists — no change |
| Avatar upload | Blossom media endpoint (`PUT /upload`) — existing infrastructure |

---

## Data Shape

### kind 9002 — Group Metadata (extended)

```jsonc
{
  "kind": 9002,
  "tags": [
    ["name", "Acme Corp"],
    ["about", "Our workspace"],
    ["picture", "https://relay.acme.lengrowth.com/media/{sha256}"],
    ["color", "#5b4fcf"]
  ]
}
```

`picture` and `color` are optional. If absent, UI falls back to defaults.  
No new relay routing needed — kind 9002 already handled.

### Subdomain PATCH

```
PATCH /api/admin/v1/workspace/subdomain
Authorization: NIP-98 (existing HTTP auth pattern)
Content-Type: application/json

{ "slug": "new-name" }
```

**Validation:** alphanumeric + dash, 3–63 chars, not in reserved list (`www`, `app`, `relay`, `api`, `growth-api`, `lenos`, `mail`, `smtp`), unique in `communities` table.  
**Response:** 200 OK | 409 Conflict | 422 Unprocessable | 403 Forbidden (non-owner).

---

## Architecture

### Web + Desktop (shared React codebase)

**New hook — `useWorkspaceBranding`**
- Subscribes to latest kind 9002 from relay for current `communityId`
- Extracts `picture` (avatar URL) and `color` (hex accent) tags
- Returns `{ avatar: string | null, accentColor: string | null }`

**`WorkspaceProvider` / context** (`web/src/shared/lib/workspace-context.tsx`)
- Add `accentColor: string | null` and `avatar: string | null` to context
- Populated from `useWorkspaceBranding` on workspace load

**`WorkspaceShell`** (`web/src/features/workspace/ui/WorkspaceShell.tsx`)
- Injects `--workspace-accent: #hex` CSS variable on shell root element
- Renders workspace avatar in `CommunityRail` header (initials fallback if no avatar)

**CSS**
- `web/src/shared/styles/globals.css` — add `--workspace-accent` fallback default
- `desktop/src/shared/styles/globals/theme.css` — add `--workspace-accent` fallback; `adaptive-theme.ts` derives sidebar gradient tints from this variable

**`CommunitySettingsModal`** (`web/src/features/communities/ui/CommunitySettingsModal.tsx`)
- Overview tab gains:
  - Avatar: file input → Blossom upload (`PUT /upload`) → preview thumbnail → stored as `picture` tag in kind 9002
  - Color picker: `<input type="color">` + hex text input → stored as `color` tag in kind 9002
- Both included in existing kind 9002 publish on save
- New subdomain field (owner-only, separate from kind 9002):
  - Warning: "Changing subdomain breaks existing links for all members"
  - Calls `PATCH /api/admin/v1/workspace/subdomain`
  - On success: `window.location.replace("https://{newSlug}.lengrowth.com")`
  - On error: inline error below field (conflict / invalid)

### Mobile (Flutter)

**New `workspace_branding_service.dart`** (`mobile/lib/shared/theme/`)
- Subscribes to kind 9002 from relay for current workspace
- Parses `picture` + `color` tags
- Exposes branding to Riverpod providers

**`lenos_theme.dart`** (`mobile/lib/shared/theme/lenos_theme.dart`)
- Add `LenosTheme.fromAccent(Color accent)` factory
- Derives `ThemeData` via `ColorScheme.fromSeed(seedColor: accent)`
- Fallback to existing default palette if no accent

**`theme_provider.dart`** (`mobile/lib/shared/theme/theme_provider.dart`)
- Gains `workspaceAccent` state from `workspace_branding_service`
- Calls `LenosTheme.fromAccent` when accent is available

**`home_page.dart`** (`mobile/lib/features/home/home_page.dart`)
- Shows workspace avatar in app bar
- Initials fallback if no avatar set

### Relay (Rust)

**New handler** (extend `crates/lenos-relay/src/handlers/` or new `workspace.rs`)
- `PATCH /api/admin/v1/workspace/subdomain`
- NIP-98 HTTP auth (existing pattern)
- Owner check: verify pubkey matches community owner in DB
- Validate slug (regex + reserved list + uniqueness query)
- Update `communities` table row

**`crates/lenos-relay/src/router.rs`**
- Register new PATCH route under `/api/admin/v1/`

**`crates/lenos-db/`**
- Add `update_community_slug(community_id, new_slug) -> Result<(), SlugError>` query
- `SlugError` variants: `Conflict`, `Invalid`

---

## Files Touched

### Web + Desktop (React)
| File | Change |
|---|---|
| `web/src/shared/lib/workspace-context.tsx` | Add `accentColor`, `avatar` to context |
| `web/src/features/communities/ui/CommunitySettingsModal.tsx` | Avatar upload, color picker, subdomain field |
| `web/src/features/workspace/ui/WorkspaceShell.tsx` | Inject CSS var, render avatar |
| `web/src/shared/styles/globals.css` | Add `--workspace-accent` fallback |
| `desktop/src/shared/styles/globals/theme.css` | Add `--workspace-accent` fallback |
| `desktop/src/shared/theme/adaptive-theme.ts` | Derive tints from `--workspace-accent` |
| New: `web/src/features/communities/hooks/useWorkspaceBranding.ts` | kind 9002 branding hook |
| New: `web/src/features/communities/hooks/useUpdateSubdomain.ts` | Subdomain mutation hook |

### Mobile (Flutter)
| File | Change |
|---|---|
| `mobile/lib/shared/theme/lenos_theme.dart` | `fromAccent` factory |
| `mobile/lib/shared/theme/theme_provider.dart` | `workspaceAccent` state |
| `mobile/lib/features/home/home_page.dart` | Avatar in app bar |
| New: `mobile/lib/shared/theme/workspace_branding_service.dart` | kind 9002 subscription + parsing |

### Relay (Rust)
| File | Change |
|---|---|
| `crates/lenos-relay/src/router.rs` | Register PATCH route |
| `crates/lenos-db/src/` | Add `update_community_slug` query |
| New: `crates/lenos-relay/src/handlers/workspace.rs` | PATCH subdomain handler |

---

## CSS Variable Contract

```css
/* Fallback — neutral brand purple */
:root {
  --workspace-accent: #5b4fcf;
}

/* Applied per workspace shell */
.workspace-shell {
  --workspace-accent: /* injected from kind 9002 color tag */;
}
```

Tailwind utilities referencing `var(--workspace-accent)` for: active nav items, button primary, focus rings, highlights.

---

## Error States

| Scenario | Behavior |
|---|---|
| No `color` tag in kind 9002 | Use `--workspace-accent` default |
| No `picture` tag in kind 9002 | Show workspace name initials avatar |
| Subdomain conflict | Inline error: "This subdomain is already taken" |
| Subdomain invalid format | Inline error: "Letters, numbers, and hyphens only (3–63 chars)" |
| Blossom upload failure | Toast error, revert to previous avatar |
| Mobile — relay unreachable | Use cached branding from last successful fetch |

---

## Out of Scope

- Per-user color overrides within a workspace
- Custom domain (non-lengrowth.com) support
- Animated logos or video avatars
- Subdomain change history / audit log
