#!/usr/bin/env bash
# A) Live capture — record showcase-live-demo via asciinema → cast → GIF/MP4
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
# shellcheck source=scripts/lib/showcase-agg.sh
source "$ROOT/scripts/lib/showcase-agg.sh"

FIDELITY="${SHOWCASE_FIDELITY:-inspect}"
CAST="/tmp/showcase-live.cast"
GIF="$OUT_DIR/showcase_live.gif"
MP4="$OUT_DIR/showcase_live.mp4"

cd "$ROOT"
npm run build

command -v asciinema >/dev/null || {
	echo "skip live: asciinema not installed"
	exit 0
}

export TERM=xterm-256color
export COLORTERM=truecolor
export FORCE_COLOR=3

# Non-interactive record (~20s demo); force terminal size for crisp agg output
asciinema rec --overwrite \
	--cols 110 --rows 32 \
	--command "node $ROOT/scripts/showcase-live-demo.mjs --auto" \
	"$CAST" </dev/null

agg_render_cast "$CAST" "$GIF" "$FIDELITY" 1.0
agg_cast_to_mp4 "$GIF" "$MP4" 14

echo "Live capture: $GIF ($(du -h "$GIF" | cut -f1)), $MP4"
