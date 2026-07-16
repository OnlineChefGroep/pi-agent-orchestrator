#!/usr/bin/env bash
# Assemble the publish directory for orchestrator.chefgroep.online (and GH mirror).
#
# Primary surface: Vite + React SPA in site/web/. Static markdown, sitemaps, and
# showcase media are staged into the Vite public/ tree before build, then copied
# alongside the dist output for direct file URLs (/README.md, /sitemap.xml, …).
#
# Usage: scripts/build-site.sh [output_dir]   (default: ./_site)
# Env:   SITE_BASE — Vite base path (default /). Set to /pi-agent-orchestrator/
#        for the GitHub Pages org mirror.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_RAW="${1:-$ROOT/_site}"
SITE_BASE="${SITE_BASE:-/}"

# Refuse dangerous targets before any path math (basename "/" is "/").
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

# GitHub Pages: serve SPA deep links via 404 fallback.
touch "$OUT/.nojekyll"
cp "$OUT/index.html" "$OUT/404.html"

# Direct URLs outside the Vite bundle (agents, crawlers, mirrors).
mkdir -p "$OUT/.well-known" "$OUT/docs/images"
for file in README.md AGENTS.md llms.txt llms-full.txt sitemap.md sitemap.xml robots.txt agent-permissions.json; do
  cp "$ROOT/$file" "$OUT/$file"
done
cp "$ROOT/site/index.md" "$OUT/index.md"
cp "$ROOT/agent-permissions.json" "$OUT/.well-known/agent-permissions.json"

for doc in architecture.md api-reference.md custom-agents.md; do
  cp "$ROOT/docs/$doc" "$OUT/docs/$doc"
done
cp "$ROOT/docs/images/dashboard_preview.svg" "$OUT/docs/images/dashboard_preview.svg"
if [[ -f "$ROOT/docs/images/orchestrator_architecture.png" ]]; then
  cp "$ROOT/docs/images/orchestrator_architecture.png" "$OUT/docs/images/orchestrator_architecture.png"
fi

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
