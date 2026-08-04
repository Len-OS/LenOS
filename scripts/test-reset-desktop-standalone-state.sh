#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
export LENOS_TEST_PLATFORM=Darwin
mkdir -p "$HOME/Library/Application Support/com.lengrowth.lenos.dev.example"
mkdir -p "$HOME/Library/Application Support/com.lengrowth.lenos.dev.other"
mkdir -p "$HOME/Library/Application Support/com.lengrowth.lenos"
mkdir -p "$HOME/.lenos-dev"
touch "$HOME/.lenos-dev/keep"
mkdir -p "$tmp/bin"
cat > "$tmp/bin/security" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$HOME/security-calls"
exit 1
MOCK
chmod +x "$tmp/bin/security"
export PATH="$tmp/bin:$PATH"

"$repo_root/scripts/reset-desktop-standalone-state.sh" \
    com.lengrowth.lenos.dev.example lenos-desktop-dev.example

[[ ! -e "$HOME/Library/Application Support/com.lengrowth.lenos.dev.example" ]]
[[ -d "$HOME/Library/Application Support/com.lengrowth.lenos.dev.other" ]]
[[ -d "$HOME/Library/Application Support/com.lengrowth.lenos" ]]
[[ -f "$HOME/.lenos-dev/keep" ]]
grep -Fx -- "delete-generic-password -s lenos-desktop-dev.example" "$HOME/security-calls" >/dev/null

if "$repo_root/scripts/reset-desktop-standalone-state.sh" \
    com.lengrowth.lenos lenos-desktop >/dev/null 2>&1; then
    echo "expected production scope guard to reject reset" >&2
    exit 1
fi

echo "standalone desktop reset scope test passed"
