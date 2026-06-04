#!/bin/bash
# Regenerate showcase GIF/MP4 from real dist renderers (dashboard, top view, widget).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/render-showcase-assets.sh"

# Optional Remotion polish when pi-agent-control-extension is available
DROID_PLUGIN_ROOT="${DROID_PLUGIN_ROOT:-/home/jan/OrgChefgroep/pi-agent-control-extension}"
if [[ -x "$DROID_PLUGIN_ROOT/scripts/render-showcase.sh" ]]; then
	ffmpeg -y -i docs/images/dashboard_preview.gif -movflags faststart -pix_fmt yuv420p \
		-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" /tmp/clip.mp4 2>/dev/null
	cat <<EOF >/tmp/props.json
{"preset":"factory-hero","title":"Agent Orchestrator","clips":["/tmp/clip.mp4"]}
EOF
	bash "$DROID_PLUGIN_ROOT/scripts/render-showcase.sh" --props /tmp/props.json \
		--output /tmp/showcase-remotion.mp4 /tmp/clip.mp4
	cp /tmp/showcase-remotion.mp4 docs/images/dashboard_preview.mp4
	echo "Remotion hero: docs/images/dashboard_preview.mp4"
fi

echo "Showcase assets: docs/images/showcase_*.gif + dashboard_preview.{gif,mp4}"
