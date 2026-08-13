#!/usr/bin/env bash
# Relay + agent smoke test.
#
# Verifies that the relay WebSocket is reachable and that a connected agent
# responds within TIMEOUT seconds.
#
# Usage:
#   RELAY_URL=wss://relay.example.com ./scripts/smoke-agent.sh
#
# Optional env vars:
#   TIMEOUT           Seconds to wait for an agent response (default: 30).
#   TEST_PRIVKEY_HEX  64-char hex private key (safe deterministic default used
#                     if not set).
#   AGENT_PUBKEY      Hex pubkey of the agent to @-mention in the test event.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${RELAY_URL:-}" ]; then
  echo "[smoke] FAIL: RELAY_URL environment variable is required" >&2
  exit 2
fi

# Python 3.8+ required — available on all supported CI images.
exec python3 "$SCRIPT_DIR/smoke-agent.py"
