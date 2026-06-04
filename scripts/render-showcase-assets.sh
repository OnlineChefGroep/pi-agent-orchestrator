#!/usr/bin/env bash
# Render GIF + MP4 showcase assets from real TUI output (dist renderers).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
mkdir -p "$OUT_DIR"

cd "$ROOT"
npm run build

node "$ROOT/scripts/generate-showcase-media.mjs"

render_gif() {
	local cast="$1"
	local gif="$2"
	agg --theme kanagawa-dragon --font-size 16 --speed 1.2 --no-loop "$cast" "$gif"
	echo "GIF: $gif ($(du -h "$gif" | cut -f1))"
}

render_gif /tmp/showcase-dashboard.cast "$OUT_DIR/showcase_dashboard.gif"
render_gif /tmp/showcase-top.cast "$OUT_DIR/showcase_top_view.gif"
render_gif /tmp/showcase-widget.cast "$OUT_DIR/showcase_widget.gif"
render_gif /tmp/showcase.cast "$OUT_DIR/dashboard_preview.gif"

# Hero MP4 from combined GIF (Remotion optional via create_showcase.sh)
ffmpeg -y -i "$OUT_DIR/dashboard_preview.gif" \
	-movflags faststart -pix_fmt yuv420p \
	-vf "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818" \
	"$OUT_DIR/dashboard_preview.mp4" 2>/dev/null

echo "Done. Assets in $OUT_DIR"
