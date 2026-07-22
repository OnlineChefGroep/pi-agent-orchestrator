#!/usr/bin/env bash
# C) Programmatic showcase — dist renderers → cast → GIF/MP4 (CI-safe)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
FIDELITY="inspect"
# Use TMPDIR (not /tmp) so the script works on Windows + macOS + Linux.
TMP_DIR="${TMPDIR:-/tmp}"
# shellcheck source=scripts/lib/showcase-agg.sh
source "$ROOT/scripts/lib/showcase-agg.sh"

# Fail fast with a clear message if required external tools are missing.
for tool in node agg ffmpeg; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "Error: required tool '$tool' not found in PATH. Install it first." >&2
		exit 1
	fi
done

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

render_gif "$TMP_DIR/showcase-dashboard.cast" "$OUT_DIR/showcase_dashboard.gif"
render_gif "$TMP_DIR/showcase-top.cast" "$OUT_DIR/showcase_top_view.gif"
render_gif "$TMP_DIR/showcase-widget.cast" "$OUT_DIR/showcase_widget.gif"
render_gif "$TMP_DIR/showcase.cast" "$OUT_DIR/dashboard_preview_programmatic.gif"

# Hero MP4 is Remotion-only. Programmatic GIF is the CI fallback poster/asset —
# never silently replace dashboard_preview.mp4 with the low-bitrate GIF encode.
if [[ "${FORCE_PROGRAMMATIC_HERO:-}" == "1" ]]; then
	cp "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.gif"
	agg_cast_to_mp4 "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.mp4" 18
	echo "FORCE_PROGRAMMATIC_HERO=1: wrote programmatic dashboard_preview.mp4"
elif [[ ! -f "$OUT_DIR/dashboard_preview.mp4" ]]; then
	cp "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.gif"
	echo "Error: Remotion hero missing at $OUT_DIR/dashboard_preview.mp4" >&2
	echo "Render with: npm run showcase:remotion (or npm --prefix showcase/remotion run render)" >&2
	echo "Copied programmatic GIF poster only; refusing to overwrite hero MP4 from GIF." >&2
	exit 1
else
	# Keep a GIF poster in sync for README/site without touching the Remotion MP4.
	if [[ ! -f "$OUT_DIR/dashboard_preview.gif" ]]; then
		cp "$OUT_DIR/dashboard_preview_programmatic.gif" "$OUT_DIR/dashboard_preview.gif"
	fi
	echo "Kept existing Remotion hero MP4; programmatic GIF is dashboard_preview_programmatic.gif"
fi

echo "Done (fidelity=$FIDELITY). Assets in $OUT_DIR"
