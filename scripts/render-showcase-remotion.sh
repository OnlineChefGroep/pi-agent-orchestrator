#!/usr/bin/env bash
# B) Remotion hero — title card, keystrokes, inspect fidelity
# Optional polish step. Requires pi-agent-control-extension checked out
# somewhere on disk; set DROID_PLUGIN_ROOT to its path before running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
DROID_PLUGIN_ROOT="${DROID_PLUGIN_ROOT:-}"
RENDER_SH="$DROID_PLUGIN_ROOT/scripts/render-showcase.sh"

# Prefer live cast, then programmatic hero. Use TMPDIR (not /tmp) so the
# script works on Windows + macOS + Linux.
TMP_DIR="${TMPDIR:-/tmp}"
CLIP_CAST="${1:-}"
if [[ -z "$CLIP_CAST" ]]; then
	if [[ -f "$TMP_DIR/showcase-live.cast" ]]; then
		CLIP_CAST="$TMP_DIR/showcase-live.cast"
	else
		CLIP_CAST="$TMP_DIR/showcase.cast"
	fi
fi

if [[ -z "$DROID_PLUGIN_ROOT" ]]; then
	echo "skip remotion: DROID_PLUGIN_ROOT not set"
	exit 0
fi
[[ -x "$RENDER_SH" ]] || {
	echo "skip remotion: $RENDER_SH not found (set DROID_PLUGIN_ROOT)"
	exit 0
}

# Use mktemp for the props file so concurrent runs don't collide.
PROPS_FILE="$(mktemp "${TMP_DIR}/pi-orchestrator-remotion-props.XXXXXX.json")"
trap 'rm -f "$PROPS_FILE"' EXIT

cat >"$PROPS_FILE" <<'EOF'
{
  "preset": "warm-hero",
  "title": "Pi Agent Orchestrator",
  "subtitle": "v0.11.0 — sub-agents, swarms, top view & live dashboard",
  "layout": "single",
  "fidelity": "inspect",
  "speed": 1.05,
  "labels": ["Live TUI capture"],
  "keys": [
    { "t": 1.5, "label": "j / k" },
    { "t": 4.0, "label": "?" },
    { "t": 6.5, "label": "t top" },
    { "t": 9.0, "label": "l last" },
    { "t": 12.0, "label": "widget" }
  ],
  "sections": [
    { "t": 0, "title": "Agent dashboard" },
    { "t": 6, "title": "Resource top view" },
    { "t": 11, "title": "Activity widget" }
  ],
  "effects": [],
  "showProgress": true,
  "windowTitle": "pi — /agents"
}
EOF

bash "$RENDER_SH" \
	--props "$PROPS_FILE" \
	--fidelity inspect \
	--output "$OUT_DIR/dashboard_preview_remotion.mp4" \
	"$CLIP_CAST"

# Hero slot: remotion version when available
cp "$OUT_DIR/dashboard_preview_remotion.mp4" "$OUT_DIR/dashboard_preview.mp4"
echo "Remotion hero: $OUT_DIR/dashboard_preview.mp4"
