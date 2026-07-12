#!/usr/bin/env bash
# Assemble the GitHub Pages publish directory for the project site.
#
# The site lives under site/ and links (via relative paths) to docs and assets
# that live elsewhere in the repo. This script stages exactly the files the
# published site references into a self-contained directory that can be handed
# to actions/upload-pages-artifact.
#
# Usage: scripts/build-site.sh [output_dir]   (default: ./_site)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/_site}"

echo "→ Assembling site into: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/docs"

# Top-level pages + markdown mirror.
cp "$ROOT/site/index.html" "$OUT/index.html"
cp "$ROOT/site/index.md"   "$OUT/index.md"

# Root docs that the landing page links to.
cp "$ROOT/README.md"   "$OUT/README.md"
cp "$ROOT/AGENTS.md"   "$OUT/AGENTS.md"
cp "$ROOT/llms.txt"    "$OUT/llms.txt"
cp "$ROOT/llms-full.txt" "$OUT/llms-full.txt"

# Only the specific docs the site links to (do NOT copy internal handoff docs).
cp "$ROOT/docs/architecture.md"   "$OUT/docs/architecture.md"
cp "$ROOT/docs/api-reference.md"  "$OUT/docs/api-reference.md"

# Showcase assets referenced by index.html / index.md.
cp "$ROOT/docs/images/dashboard_preview.mp4" "$OUT/assets/dashboard_preview.mp4"
cp "$ROOT/docs/images/dashboard_preview.gif" "$OUT/assets/dashboard_preview.gif"

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
