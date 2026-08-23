# Onboarding Guide

## Web app (hosted on LenGrowth)

### For LenGrowth users (recommended)

1. Sign in at [lengrowth.com](https://lengrowth.com)
2. Open your workspace — you are redirected to `{your-slug}.lengrowth.com`
3. LenGrowth provisions your encrypted Nostr identity automatically — no extension or key management required
4. Your starter channels and agents appear within a few seconds
5. Talk to Len in `#general` to get started

You do not need to install anything. Your identity is managed by LenGrowth and encrypted server-side.

### For self-hosted / standalone users

1. Visit your relay's web app URL
2. Choose an identity path:
   - **Create a new identity** — generates a local key in your browser; back it up with a password on the next screen
   - **I have a Nostr key** — paste your `nsec` or drop an encrypted backup file
   - **Browser extension** — Alby or nos2x if you already have one; optional
3. After identity setup, join a workspace with an invite link or connect to a relay directly in **Settings → Relay**

### Key backup (important for standalone users)

After creating a new identity, the backup step encrypts your key with a password and saves it as a file. **Store this file somewhere safe.** If you clear your browser data, your key is lost without this backup.

---

## Desktop app

### Requirements

- macOS 12+, Windows 10+, or Linux (x86_64/arm64)
- Download from [lengrowth.com/download](https://lengrowth.com/download)

### Setup

1. Install and open LenOS desktop
2. On first launch, enter your relay URL (e.g. `wss://relay.lengrowth.com`) or use the default LenGrowth relay
3. Sign in with your existing identity (nsec or NIP-07 extension) or create a new one
4. If you are a LenGrowth user, use the same identity you set up on web — both clients share one relay, so channels and messages are synchronized

### Key features only on desktop

- Local agent execution (Sprig harness — shell, file, git access)
- Cmd+/- text zoom (accessibility)
- Multiple community switching in the sidebar
- `lenos://` deep links from terminal or other apps
- git-sign-nostr and git-credential-nostr for Nostr-signed git operations

---

## Mobile app (iOS + Android)

Mobile app supports channels, DMs, and pulse. Contact support for early access.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "You need a durable identity to do this." | Your session is ephemeral. Re-open from LenGrowth, or go to **Settings → Identity** and import your backup key. |
| Channels not loading | Check relay URL in **Settings → Relay**. The relay must be reachable (`/health` should return 200). |
| Agent not responding | Check **Settings → Agent Credentials** — all required API keys must be set. |
| Local agents not available | Local agents require the desktop app. Install from [lengrowth.com/download](https://lengrowth.com/download). |
