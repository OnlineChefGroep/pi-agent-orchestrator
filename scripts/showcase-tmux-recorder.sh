#!/usr/bin/env bash
# E) tmux-based showcase — real pi CLI interaction with SMOOTH pacing
#
# Records the actual pi CLI in a tmux session, navigates through
# dashboard scenes via send-keys, and captures with asciinema.
# Produces showcase_tmux.gif and showcase_tmux.mp4.
#
# Prerequisites:
#   - pi CLI installed and on PATH
#   - tmux, asciinema, agg, ffmpeg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
SCENES_SCRIPT="$ROOT/scripts/showcase-tmux-scenes.mjs"
# shellcheck source=scripts/lib/showcase-agg.sh
source "$ROOT/scripts/lib/showcase-agg.sh"

FIDELITY="${SHOWCASE_FIDELITY:-inspect}"
NO_TITLES=false
for arg in "$@"; do
  case "$arg" in
    --no-titles) NO_TITLES=true ;;
  esac
done
# Also support env var for CI
[[ "${SHOWCASE_NO_TITLES:-}" == "1" ]] && NO_TITLES=true
SESSION="showcase-tmux-$$"
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

if ! command -v pi >/dev/null 2>&1; then
  echo "skip tmux showcase: pi CLI not found on PATH" >&2
  exit 0
fi

mkdir -p "$OUT_DIR"

# ── Cleanup ──
cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

echo "═══ E) tmux-based showcase (smooth, calm pacing) ═══"

# ── Build project first ──
cd "$ROOT"
npm run build --silent 2>/dev/null || true

# ── Start tmux session ──
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$ROOT" \
  -x "$COLS" -y "$ROWS"

# ── Generate scene choreography ──
echo "Generating scene choreography..."
node "$SCENES_SCRIPT" --session "$SESSION" > /tmp/showcase-tmux-choreography.sh
chmod +x /tmp/showcase-tmux-choreography.sh

# ── Record with asciinema inside tmux ──
export TERM=xterm-256color
export COLORTERM=truecolor

echo "Starting asciinema inside tmux..."
tmux send-keys -t "$SESSION" "asciinema rec --overwrite --cols $COLS --rows $ROWS '$FINAL_CAST'" Enter
sleep 2

# ── Launch pi CLI ──
echo "Launching pi CLI..."
tmux send-keys -t "$SESSION" "pi -e ./src/index.ts" Enter
sleep 5

# Verify pi started
if ! tmux capture-pane -t "$SESSION" -p 2>/dev/null | grep -qi "pi\|agent\|>"; then
  echo "Warning: pi may not have started, continuing anyway..."
fi

# ── Run the full choreography (~150s) ──
echo "Running scene choreography..."
bash /tmp/showcase-tmux-choreography.sh

# ── Stop asciinema ──
sleep 1
tmux send-keys -t "$SESSION" C-d
sleep 2

# ── Convert to GIF (calm speed) ──
echo "Converting to GIF (calm speed)..."
agg_render_cast "$FINAL_CAST" "$GIF" "$FIDELITY" 0.85

# ── Convert to MP4 (full speed first, then compress) ──
echo "Converting to MP4 (full speed)..."
agg_cast_to_mp4 "$GIF" "$MP4" 16

# ── Compress MP4 to ~60s with title card and scene labels ──
echo "Compressing MP4 to ~60s with title card..."
MP4_COMPRESSED="$OUT_DIR/showcase_tmux_compressed.mp4"

# Check if ffmpeg has drawtext filter (requires libfreetype)
HAS_DRAWTEXT=false
if $NO_TITLES; then
  echo "--no-titles flag set — skipping title card and scene labels"
elif ffmpeg -filters 2>/dev/null | grep -q drawtext; then
  HAS_DRAWTEXT=true
  echo "ffmpeg drawtext filter available — adding title card and scene labels"
else
  echo "ffmpeg drawtext filter not available — skipping title card"
  echo "  Install ffmpeg with libfreetype for title card support"
fi

# Base filter: scale + compress
VFILTER="scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease"
VFILTER+=",pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181818"

if $HAS_DRAWTEXT; then
  # Font detection: check multiple paths, warn if none found
  FONT_BOLD=""
  FONT_REG=""
  for dir in /usr/share/fonts/truetype/dejavu /usr/share/fonts/TTF /usr/share/fonts/dejavu /usr/share/fonts /usr/local/share/fonts ~/Library/Fonts; do
    if [[ -f "$dir/DejaVuSans-Bold.ttf" ]]; then
      FONT_BOLD="$dir/DejaVuSans-Bold.ttf"
      FONT_REG="$dir/DejaVuSans.ttf"
      [[ -f "$FONT_REG" ]] || FONT_REG="$FONT_BOLD"
      break
    fi
  done

  if [[ -z "$FONT_BOLD" ]]; then
    if [[ -n "${SHOWCASE_FONT:-}" ]]; then
      FONT_BOLD="$SHOWCASE_FONT"
      FONT_REG="$SHOWCASE_FONT"
    else
      FONT_BOLD="Sans"
      FONT_REG="Sans"
    fi
  fi
  echo "Using font: $FONT_BOLD"

  # Title card + scene labels (timing windows in INPUT seconds)
  VFILTER+=",drawtext=fontfile=${FONT_BOLD}:text='Pi Agent Orchestrator':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-40:enable='between(t,0.5,3.5)':alpha='if(between(t,0.5,1.2),(t-0.5)/0.7,if(between(t,2.8,3.5),1-(t-2.8)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='v0.11.0 — Sub-agents, Swarms & Live Dashboard':fontsize=20:fontcolor=0xcccccc:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,0.8,3.5)':alpha='if(between(t,0.8,1.5),(t-0.8)/0.7,if(between(t,2.8,3.5),1-(t-2.8)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Dashboard':fontsize=16:fontcolor=0x9ece6a:x=40:y=20:enable='between(t,5,18)':alpha='if(between(t,5,5.7),(t-5)/0.7,if(between(t,17.3,18),1-(t-17.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Help':fontsize=16:fontcolor=0xe0af68:x=40:y=20:enable='between(t,19,25)':alpha='if(between(t,19,19.7),(t-19)/0.7,if(between(t,24.3,25),1-(t-24.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Top View':fontsize=16:fontcolor=0x7aa2f7:x=40:y=20:enable='between(t,26,42)':alpha='if(between(t,26,26.7),(t-26)/0.7,if(between(t,41.3,42),1-(t-41.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Widget':fontsize=16:fontcolor=0xbb9af7:x=40:y=20:enable='between(t,42,50)':alpha='if(between(t,42,42.7),(t-42)/0.7,if(between(t,49.3,50),1-(t-49.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Agent Spawn':fontsize=16:fontcolor=0xf7768e:x=40:y=20:enable='between(t,50,65)':alpha='if(between(t,50,50.7),(t-50)/0.7,if(between(t,64.3,65),1-(t-64.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Settings':fontsize=16:fontcolor=0x9ece6a:x=40:y=20:enable='between(t,65,82)':alpha='if(between(t,65,65.7),(t-65)/0.7,if(between(t,81.3,82),1-(t-81.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Swarm':fontsize=16:fontcolor=0x7dcfff:x=40:y=20:enable='between(t,82,95)':alpha='if(between(t,82,82.7),(t-82)/0.7,if(between(t,94.3,95),1-(t-94.3)/0.7,1))'"
  VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Overview':fontsize=16:fontcolor=0x9ece6a:x=40:y=20:enable='between(t,95,115)':alpha='if(between(t,95,95.7),(t-95)/0.7,if(between(t,114.3,115),1-(t-114.3)/0.7,1))'"
fi

VFILTER+=",setpts=0.45*PTS"

if ffmpeg -y -i "$MP4" \
  -vf "$VFILTER" \
  -movflags +faststart -pix_fmt yuv420p \
  -preset slow -crf 18 \
  "$MP4_COMPRESSED" 2>/dev/null; then
  mv "$MP4_COMPRESSED" "$MP4"
  echo ""
  echo "tmux showcase assets:"
  echo "  GIF: $GIF ($(du -h "$GIF" | cut -f1))"
  echo "  MP4: $MP4 ($(du -h "$MP4" | cut -f1), ~60s compressed with title card)"
else
  echo "Warning: ffmpeg compression failed, keeping full-length MP4"
  rm -f "$MP4_COMPRESSED"
  echo ""
  echo "tmux showcase assets:"
  echo "  GIF: $GIF ($(du -h "$GIF" | cut -f1))"
  echo "  MP4: $MP4 ($(du -h "$MP4" | cut -f1), full length)"
fi
