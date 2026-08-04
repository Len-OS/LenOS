#!/usr/bin/env bash
# Computes the full multi-instance desktop dev environment.
# Source this file from desktop dev commands; it exports:
#   LENOS_VITE_PORT, LENOS_HMR_PORT, VITE_PORT, VITE_HMR_PORT
#   LENOS_RELAY_PORT, LENOS_RELAY_URL
#   LENOS_INSTANCE_SLUG, LENOS_WORKTREE_LABEL, VITE_DEV_BRANCH (worktrees only)
#   LENOS_TAURI_CONFIG
#   LENOS_PRIVATE_KEY (worktrees only, when LENOS_SHARE_IDENTITY=1)

WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Derive a stable base port from the worktree root so the same worktree always
# gets the same ports. This keeps the Tauri dev config stable between runs and
# preserves Cargo's build cache.
BASE_PORT=$(python3 -c "import hashlib,sys; h=int(hashlib.sha256(sys.argv[1].encode()).hexdigest(), 16); print(10000 + h % 55000)" "$WORKTREE_ROOT")
export LENOS_VITE_PORT=$BASE_PORT
export LENOS_HMR_PORT=$((BASE_PORT + 1))
export LENOS_RELAY_PORT=3000
export VITE_PORT="$LENOS_VITE_PORT"
export VITE_HMR_PORT="$LENOS_HMR_PORT"
export LENOS_RELAY_URL="${LENOS_RELAY_URL:-ws://localhost:3000}"

DEV_URL="http://localhost:${LENOS_VITE_PORT}"
if [[ "${LENOS_RESET_WEBVIEW_STATE:-0}" == "1" ]]; then
    DEV_URL="${DEV_URL}?resetDevState=1"
fi

LENOS_TAURI_CONFIG="{\"build\":{\"devUrl\":\"${DEV_URL}\",\"beforeDevCommand\":\"exec ./node_modules/.bin/vite --port ${LENOS_VITE_PORT} --strictPort\"},\"identifier\":\"xyz.block.lenos.app.dev\",\"productName\":\"LenOS Dev\"}"
unset VITE_DEV_BRANCH

# In worktrees, extract a label from the branch name and derive a unique app
# identity and icon so multiple local desktop instances can run side by side.
#
# Worktree detection: compare --git-dir to --git-common-dir. In the main
# working tree these are identical; in any worktree (whether under .worktrees/,
# .claude/worktrees/, or elsewhere on disk) they differ.
if git rev-parse --is-inside-work-tree &>/dev/null; then
    GIT_DIR=$(git rev-parse --git-dir)
    GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
    if [[ -n "$GIT_COMMON_DIR" && "$GIT_DIR" != "$GIT_COMMON_DIR" ]]; then
        BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
        export LENOS_WORKTREE_LABEL="${BRANCH_NAME##*/}"
        export LENOS_INSTANCE_SLUG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

        # LENOS_SHARE_IDENTITY=1: reuse the main dev checkout's Nostr key so
        # worktrees skip onboarding and share the same identity. The per-worktree
        # identifier is kept so concurrent instances don't collide on
        # tauri-plugin-single-instance or the app data directory.
        if [[ "${LENOS_SHARE_IDENTITY:-0}" == "1" ]]; then
            KEYRING_SERVICE="lenos-desktop-dev"
            KEYRING_BLOB=""
            case "$(uname -s)" in
                Darwin)
                    if command -v security &>/dev/null; then
                        KEYRING_BLOB="$(security find-generic-password -s "$KEYRING_SERVICE" -a secrets -w 2>/dev/null || true)"
                    fi
                    ;;
                Linux)
                    if command -v secret-tool &>/dev/null; then
                        KEYRING_BLOB="$(secret-tool lookup service "$KEYRING_SERVICE" username secrets target default 2>/dev/null || true)"
                    fi
                    ;;
            esac

            KEYRING_IDENTITY="$(printf '%s' "$KEYRING_BLOB" | python3 -c 'import json, sys; value = json.load(sys.stdin).get("identity", ""); print(value if isinstance(value, str) else "")' 2>/dev/null || true)"
            CANONICAL_KEY="$HOME/Library/Application Support/xyz.block.lenos.app.dev/identity.key"
            LEGACY_CANONICAL_KEY="$HOME/Library/Application Support/xyz.block.sprout.app.dev/identity.key"

            SHARED_IDENTITY="$KEYRING_IDENTITY"
            if [[ -z "$SHARED_IDENTITY" && -f "$CANONICAL_KEY" ]]; then
                SHARED_IDENTITY="$(cat "$CANONICAL_KEY")"
            elif [[ -z "$SHARED_IDENTITY" && -f "$LEGACY_CANONICAL_KEY" ]]; then
                SHARED_IDENTITY="$(cat "$LEGACY_CANONICAL_KEY")"
            fi

            if [[ -n "$SHARED_IDENTITY" ]]; then
                export LENOS_PRIVATE_KEY="$SHARED_IDENTITY"
            else
                echo "⚠ LENOS_SHARE_IDENTITY=1 but no identity found in keyring service $KEYRING_SERVICE, at $CANONICAL_KEY, or at $LEGACY_CANONICAL_KEY — run LenOS from repo root first" >&2
            fi
        fi

        ICON_DIR="$WORKTREE_ROOT/desktop/src-tauri/target/dev-icons"
        mkdir -p "$ICON_DIR"
        DEV_ICON="$ICON_DIR/icon.icns"
        GENERATE_DEV_ICON="$WORKTREE_ROOT/scripts/generate-dev-icon.swift"
        BASE_ICON="$WORKTREE_ROOT/desktop/src-tauri/icons/icon.icns"

        if swift "$GENERATE_DEV_ICON" "$BASE_ICON" "$DEV_ICON" "$LENOS_WORKTREE_LABEL"; then
            echo "🌳 Worktree: ${LENOS_WORKTREE_LABEL}"
            export VITE_DEV_BRANCH="$LENOS_WORKTREE_LABEL"
            LENOS_TAURI_CONFIG="{\"build\":{\"devUrl\":\"${DEV_URL}\",\"beforeDevCommand\":\"exec ./node_modules/.bin/vite --port ${LENOS_VITE_PORT} --strictPort\"},\"identifier\":\"xyz.block.lenos.app.dev.${LENOS_INSTANCE_SLUG}\",\"productName\":\"LenOS Dev (${LENOS_WORKTREE_LABEL})\",\"bundle\":{\"icon\":[\"$DEV_ICON\"]}}"
        fi
    fi
fi

export LENOS_TAURI_CONFIG
