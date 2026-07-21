#!/usr/bin/env bash
# Pi-host extension smoke test.
#
# Proves that the actual Pi host loads and activates the locally built extension
# (dist/index.js) without requiring any model API key. Uses RPC mode (which boots
# without credentials), asks the host to enumerate registered commands, and
# asserts the extension's commands were registered from dist/index.js.
#
# Bounded by a timeout; the Pi process exits on stdin EOF and is force-killed if
# it overruns. No tmux sessions or background processes are left behind.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/cursor-cloud-lib.sh
. scripts/cursor-cloud-lib.sh

cc_ensure_node
cc_assert_node

if [ ! -f dist/index.js ]; then
  echo "== building extension (dist/index.js missing) =="
  npm run build
fi

PI_BIN="node_modules/.bin/pi"
if [ ! -x "$PI_BIN" ]; then
  echo "ERROR: Pi host CLI not found at $PI_BIN (run the install script first)." >&2
  exit 1
fi

echo "== loading dist/index.js through the Pi host (RPC mode, no credentials) =="
raw="$(printf '%s\n' '{"id":"smoke","type":"get_commands"}' \
  | timeout 60 "$PI_BIN" --mode rpc --no-session -e ./dist/index.js 2>/dev/null || true)"

echo "---- raw Pi RPC output ----"
printf '%s\n' "$raw"
echo "---------------------------"

printf '%s\n' "$raw" | node scripts/cloud-smoke-assert.mjs
