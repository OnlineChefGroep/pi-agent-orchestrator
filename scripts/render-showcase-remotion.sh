#!/usr/bin/env bash
# B) Remotion hero — title card, keystrokes, inspect fidelity
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/docs/images"
DROID_PLUGIN_ROOT="${DROID_PLUGIN_ROOT:-/home/jan/OrgChefgroep/pi-agent-control-extension}"
RENDER_SH="$DROID_PLUGIN_ROOT/scripts/render-showcase.sh"

# Prefer live cast, then programmatic hero
CLIP_CAST="${1:-}"
if [[ -z "$CLIP_CAST" ]]; then
  if [[ -f /tmp/showcase-live.cast ]]; then
    CLIP_CAST=/tmp/showcase-live.cast
  else
    CLIP_CAST=/tmp/showcase.cast
  fi
fi

[[ -x "$RENDER_SH" ]] || {
  echo "skip remotion: $RENDER_SH not found (set DROID_PLUGIN_ROOT)"
  exit 0
}

cat > /tmp/showcase-remotion-props.json <<'EOF'
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
  --props /tmp/showcase-remotion-props.json \
  --fidelity inspect \
  --output "$OUT_DIR/dashboard_preview_remotion.mp4" \
  "$CLIP_CAST"

# Hero slot: remotion version when available
cp "$OUT_DIR/dashboard_preview_remotion.mp4" "$OUT_DIR/dashboard_preview.mp4"
echo "Remotion hero: $OUT_DIR/dashboard_preview.mp4"