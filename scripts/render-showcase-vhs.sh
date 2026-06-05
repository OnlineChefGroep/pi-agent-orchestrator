#!/usr/bin/env bash
# D) VHS — declarative terminal recording (install-and-agents.tape)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAPE_SRC="$ROOT/showcase/install-and-agents.tape"
TAPE_TMP="/tmp/pi-orchestrator-showcase.tape"
OUT_GIF="$ROOT/docs/images/showcase_vhs.gif"
OUT_MP4="$ROOT/docs/images/showcase_vhs.mp4"

if ! command -v vhs >/dev/null 2>&1; then
	if command -v go >/dev/null 2>&1; then
		echo "Installing vhs..."
		go install github.com/charmbracelet/vhs@latest
		export PATH="${PATH}:${HOME}/go/bin:${HOME}/.local/go/bin"
	fi
fi

command -v vhs >/dev/null || {
	echo "skip vhs: install with: go install github.com/charmbracelet/vhs@latest"
	exit 0
}

[[ -f "$TAPE_SRC" ]] || {
	echo "missing $TAPE_SRC"
	exit 1
}

sed "s|REPO_PLACEHOLDER|$ROOT|g" "$TAPE_SRC" >"$TAPE_TMP"

cd "$ROOT"
npm run build

vhs "$TAPE_TMP"

if [[ -f "$OUT_GIF" ]] && command -v ffmpeg >/dev/null; then
	ffmpeg -y -i "$OUT_GIF" -movflags +faststart -pix_fmt yuv420p \
		-vf "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818" \
		"$OUT_MP4" 2>/dev/null
	echo "VHS: $OUT_GIF, $OUT_MP4"
else
	echo "VHS: $OUT_GIF"
fi
