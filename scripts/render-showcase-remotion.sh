#!/usr/bin/env bash
# Render the real terminal capture plus the source-derived Remotion promo suite.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTION_DIR="$ROOT/showcase/remotion"
OUT_DIR="$ROOT/docs/images"

mkdir -p "$OUT_DIR"
cd "$ROOT"

npm run build
npm --prefix "$REMOTION_DIR" install --no-audit --no-fund --ignore-scripts
node "$REMOTION_DIR/scripts/capture-terminal.mjs"
node "$REMOTION_DIR/scripts/extract-promo-data.mjs"
npm --prefix "$REMOTION_DIR" run typecheck

EXTRA_ARGS=()
if [[ -n "${REMOTION_BROWSER_EXECUTABLE:-}" ]]; then
  EXTRA_ARGS+=("--browser-executable=${REMOTION_BROWSER_EXECUTABLE}")
fi

render() {
  npm --prefix "$REMOTION_DIR" run "$1" -- "${EXTRA_ARGS[@]}"
}

render render
render poster
render promo:banner
render promo:social
render promo:architecture
render promo:tour

cat <<SUMMARY
Remotion assets rendered:
  - $OUT_DIR/dashboard_preview.mp4
  - $OUT_DIR/dashboard_preview.png
  - $OUT_DIR/promo_banner.png
  - $OUT_DIR/social_preview.png
  - $OUT_DIR/architecture_overview.png
  - $OUT_DIR/feature_tour.mp4
SUMMARY
