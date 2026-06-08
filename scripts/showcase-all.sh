#!/usr/bin/env bash
# Full showcase pipeline: C (programmatic) → A (live) → B (remotion) → T (tmux) → D (vhs)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export SHOWCASE_FIDELITY="${SHOWCASE_FIDELITY:-inspect}"
SKIP_LIVE="${SKIP_LIVE:-}"
SKIP_REMOTION="${SKIP_REMOTION:-}"
SKIP_VHS="${SKIP_VHS:-}"
SKIP_TMUX="${SKIP_TMUX:-}"

echo "═══ C) Programmatic (CI-safe, inspect fidelity) ═══"
bash "$ROOT/scripts/render-showcase-assets.sh" --fidelity "$SHOWCASE_FIDELITY"

if [[ -z "$SKIP_LIVE" ]]; then
	echo "═══ A) Live asciinema capture ═══"
	bash "$ROOT/scripts/capture-live-showcase.sh" || true
else
	echo "═══ A) Live capture skipped (SKIP_LIVE=1) ═══"
fi

if [[ -z "$SKIP_REMOTION" ]]; then
	echo "═══ B) Remotion hero ═══"
	bash "$ROOT/scripts/render-showcase-remotion.sh" || true
else
	echo "═══ B) Remotion skipped (SKIP_REMOTION=1) ═══"
fi

if [[ -z "$SKIP_TMUX" ]]; then
	echo "═══ T) Tmux recording ═══"
	bash "$ROOT/scripts/showcase-tmux-recorder.sh" || true
else
	echo "═══ T) Tmux recording skipped (SKIP_TMUX=1) ═══"
fi

if [[ -z "$SKIP_VHS" ]]; then
	echo "═══ D) VHS tape ═══"
	bash "$ROOT/scripts/render-showcase-vhs.sh" || true
else
	echo "═══ D) VHS skipped (SKIP_VHS=1) ═══"
fi

echo ""
echo "Assets in docs/images/:"
ls -lh "$ROOT/docs/images"/showcase*.gif "$ROOT/docs/images"/dashboard_preview*.mp4 2>/dev/null || true
