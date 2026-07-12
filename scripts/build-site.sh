#!/usr/bin/env bash
# Assemble the Cloudflare Pages publish directory for the project site.
#
# The site lives under site/ and links (via relative paths) to docs and assets
# that live elsewhere in the repo. This script stages exactly the files the
# published site references into a self-contained directory for deployment.
#
# Usage: scripts/build-site.sh [output_dir]   (default: ./_site)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/_site}"

echo "→ Assembling site into: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/docs" "$OUT/.well-known" "$OUT/wiki"

# Top-level pages + markdown mirror.
cp "$ROOT/site/index.html" "$OUT/index.html"
cp "$ROOT/site/index.md"   "$OUT/index.md"

# Root docs, discovery metadata, and agent permissions.
cp "$ROOT/README.md" "$ROOT/AGENTS.md" "$ROOT/CHANGELOG.md" "$OUT/"
cp "$ROOT/llms.txt" "$ROOT/llms-full.txt" "$ROOT/sitemap.md" "$ROOT/sitemap.xml" "$ROOT/robots.txt" "$ROOT/agent-permissions.json" "$OUT/"
cp "$ROOT/agent-permissions.json" "$OUT/.well-known/agent-permissions.json"
cp "$ROOT/llms-full.txt" "$OUT/wiki/index.md"
cp "$ROOT/llms.txt" "$OUT/wiki/llms.txt"

# Preserve the full open-source documentation and agent-ready knowledge base.
cp -R "$ROOT/docs/." "$OUT/docs/"

# Showcase assets referenced by index.html / index.md.
cp "$ROOT/docs/images/dashboard_preview.mp4" "$OUT/assets/dashboard_preview.mp4"
cp "$ROOT/docs/images/dashboard_preview.gif" "$OUT/assets/dashboard_preview.gif"
touch "$OUT/.nojekyll"

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
