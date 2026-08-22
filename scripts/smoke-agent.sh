#!/usr/bin/env bash
# LenGrowth adapter smoke test.
#
# Publishes a kind:9 "@lengrowth get tasks" command to the relay and waits
# for the LenGrowth nostr_adapter to reply with a kind:9 response.
# Exits 0 on success, 1 on timeout/failure, 2 on missing required env var.
#
# Required:
#   RELAY_URL         WebSocket URL of the workspace relay to test.
#                     e.g. wss://lenos-e2e32.lengrowth.com
#
# Optional:
#   SMOKE_CHANNEL_ID  Channel UUID for the h-tag on the command event.
#                     When omitted the command is published unscoped, which
#                     still triggers the adapter but skips channel-membership
#                     enforcement.
#   RELAY_GATEWAY_URL Connect via this URL with Host: <RELAY_URL host>.
#                     Set to wss://relay.lengrowth.com when the tenant
#                     subdomain is behind Cloudflare Bot Fight Mode.
#   ADAPTER_PUBKEY    Hex pubkey of the LenGrowth adapter (defaults to prod).
#   TIMEOUT           Seconds to wait for adapter response (default: 45).
#   TEST_PRIVKEY_HEX  64-char hex private key. Default key is pre-seeded as
#                     a member of lenos-e2e32. Rotate only after re-running
#                     the invite-claim bootstrap.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${RELAY_URL:-}" ]; then
  echo "[smoke] FAIL: RELAY_URL environment variable is required" >&2
  exit 2
fi

# Python 3.8+ required — available on all supported CI images.
exec python3 "$SCRIPT_DIR/smoke-agent.py"
