#!/usr/bin/env bash
# Assemble the publish directory for orchestrator.chefgroep.online (and GH mirror).
#
# Primary surface: Vite + React SPA in site/web/. Documentation markdown is bundled
# into the SPA as HTML. A small, explicit set of root discovery files is also
# published verbatim for crawlers and coding agents: llms*.txt, sitemap.md,
# AGENTS.md, and agent-permissions.json.
#
# Usage: scripts/build-site.sh [output_dir]   (default: ./_site)
# Env:   SITE_BASE — Vite base path (default /). Set to /pi-agent-orchestrator/
#        for the GitHub Pages org mirror.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_RAW="${1:-$ROOT/_site}"
SITE_BASE="${SITE_BASE:-/}"

case "$OUT_RAW" in
  ""|"/"|"$HOME"|"$ROOT"|"."|"..")
    echo "error: refusing to delete unsafe output path: ${OUT_RAW:-<empty>}" >&2
    exit 1
    ;;
esac

OUT_PARENT="$(cd "$(dirname "$OUT_RAW")" && pwd -P)"
OUT_BASE="$(basename "$OUT_RAW")"
OUT="$OUT_PARENT/$OUT_BASE"

case "$OUT" in
  "$ROOT"/*)
    if [ "$OUT" = "$ROOT" ]; then
      echo "error: refusing to delete repo root: $OUT" >&2
      exit 1
    fi
    ;;
  *)
    echo "error: output path must stay under repo root ($ROOT): $OUT" >&2
    exit 1
    ;;
esac

echo "→ Building marketing site into: $OUT (SITE_BASE=${SITE_BASE})"
rm -rf -- "$OUT"

WEB_DIR="$ROOT/site/web"
(
  cd "$WEB_DIR"
  npm ci --ignore-scripts
  SITE_BASE="$SITE_BASE" npm run build
)

mkdir -p "$OUT"
cp -a "$WEB_DIR/dist/." "$OUT/"

touch "$OUT/.nojekyll"
# Cloudflare Pages: omit 404.html so native SPA mode serves deep links (see site-hosting.md).
# GitHub Pages mirror (SITE_BASE != /) has no built-in SPA fallback — copy index.html to 404.html.
if [ "$SITE_BASE" != "/" ]; then
  cp "$OUT/index.html" "$OUT/404.html"
fi

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
