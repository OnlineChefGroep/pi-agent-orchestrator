#!/usr/bin/env bash
# Render a polished video from the real compiled Pi TUI renderers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTION_DIR="$ROOT/showcase/remotion"
OUT_DIR="$ROOT/docs/images"

mkdir -p "$OUT_DIR"
cd "$ROOT"

npm run build
npm --prefix "$REMOTION_DIR" install --no-audit --no-fund --ignore-scripts
node "$REMOTION_DIR/scripts/capture-terminal.mjs"

EXTRA_ARGS=()
if [[ -n "${REMOTION_BROWSER_EXECUTABLE:-}" ]]; then
  EXTRA_ARGS+=("--browser-executable=${REMOTION_BROWSER_EXECUTABLE}")
fi

npm --prefix "$REMOTION_DIR" run render -- "${EXTRA_ARGS[@]}"
npm --prefix "$REMOTION_DIR" run poster -- "${EXTRA_ARGS[@]}"

echo "Remotion showcase: $OUT_DIR/dashboard_preview.mp4"
echo "Poster: $OUT_DIR/dashboard_preview.png"
