#!/usr/bin/env bash
# E) tmux-based showcase — compiled renderers in a real terminal session
#
# Records the deterministic current-version scenario in a tmux session with
# asciinema. Every UI frame comes from the compiled extension renderers.
# Produces showcase_tmux.gif and showcase_tmux.mp4.
#
# Prerequisites:
#   - tmux, asciinema, agg, ffmpeg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
# shellcheck source=scripts/lib/showcase-agg.sh
source "$ROOT/scripts/lib/showcase-agg.sh"

FIDELITY="${SHOWCASE_FIDELITY:-inspect}"
SESSION="showcase-tmux-$$"
DONE_SIGNAL="${SESSION}-done"
FINAL_CAST="${CAST:-$(mktemp -t pi-orchestrator-showcase-tmux.XXXXXX.cast)}"
GIF="$OUT_DIR/showcase_tmux.gif"
MP4="$OUT_DIR/showcase_tmux.mp4"
COLS=110
ROWS=34

# ── Preflight checks ──
for tool in tmux node asciinema agg ffmpeg; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "skip tmux showcase: required tool '$tool' not found in PATH" >&2
		exit 0
	fi
done

mkdir -p "$OUT_DIR"

# ── Cleanup ──
cleanup() {
	tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

echo "═══ E) tmux-based showcase (current compiled renderers) ═══"

# ── Build project first ──
cd "$ROOT"
npm run build --silent 2>/dev/null || true

# ── Start tmux session ──
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$ROOT" \
	-x "$COLS" -y "$ROWS"

# ── Record with asciinema inside tmux ──
export TERM=xterm-256color
export COLORTERM=truecolor
unset NO_COLOR

echo "Starting asciinema inside tmux..."
tmux send-keys -t "$SESSION" \
	"asciinema rec --overwrite --cols $COLS --rows $ROWS --command 'node $ROOT/scripts/showcase-live-demo.mjs --auto' '$FINAL_CAST'; tmux wait-for -S '$DONE_SIGNAL'" Enter
tmux wait-for "$DONE_SIGNAL"

# ── Convert the truthful terminal session ──
echo "Converting terminal recording..."
agg_render_cast "$FINAL_CAST" "$GIF" "$FIDELITY" 1.0
agg_cast_to_mp4 "$GIF" "$MP4" 16

echo ""
echo "tmux showcase assets:"
echo "  GIF: $GIF ($(du -h "$GIF" | cut -f1))"
echo "  MP4: $MP4 ($(du -h "$MP4" | cut -f1), complete current-version terminal tour)"
