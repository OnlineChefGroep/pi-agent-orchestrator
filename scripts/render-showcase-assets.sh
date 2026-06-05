#!/usr/bin/env bash
# C) Programmatic showcase — dist renderers → cast → GIF/MP4 (CI-safe)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
FIDELITY="inspect"
# shellcheck source=scripts/lib/showcase-agg.sh
source "$ROOT/scripts/lib/showcase-agg.sh"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--fidelity)
		FIDELITY="$2"
		shift 2
		;;
	*) shift ;;
	esac
done

mkdir -p "$OUT_DIR"
cd "$ROOT"
npm run build

node "$ROOT/scripts/generate-showcase-media.mjs"

render_gif() {
	local cast="$1"
	local gif="$2"
	agg_render_cast "$cast" "$gif" "$FIDELITY" 1.1
	echo "GIF: $gif ($(du -h "$gif" | cut -f1))"
}

render_gif /tmp/showcase-dashboard.cast "$OUT_DIR/showcase_dashboard.gif"
render_gif /tmp/showcase-top.cast "$OUT_DIR/showcase_top_view.gif"
render_gif /tmp/showcase-widget.cast "$OUT_DIR/showcase_widget.gif"
render_gif /tmp/showcase.cast "$OUT_DIR/dashboard_preview_programmatic.gif"

# Fallback hero when Remotion not run
if [[ ! -f "$OUT_DIR/dashboard_preview.mp4" ]] || [[ "${FORCE_PROGRAMMATIC_HERO:-}" == "1" ]]; then
	cp "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.gif"
	agg_cast_to_mp4 "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.mp4" 18
fi

echo "Done (fidelity=$FIDELITY). Assets in $OUT_DIR"
