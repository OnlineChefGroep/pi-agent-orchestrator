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
OUT_RAW="${1:-$ROOT/_site}"

# Refuse dangerous targets before any path math (basename "/" is "/").
case "$OUT_RAW" in
  ""|"/"|"$HOME"|"$ROOT"|"."|"..")
    echo "error: refusing to delete unsafe output path: ${OUT_RAW:-<empty>}" >&2
    exit 1
    ;;
esac

# Resolve OUT to an absolute path without requiring the directory to exist yet.
OUT_PARENT="$(cd "$(dirname "$OUT_RAW")" && pwd -P)"
OUT_BASE="$(basename "$OUT_RAW")"
OUT="$OUT_PARENT/$OUT_BASE"

# Only allow deleting a directory under the repo root (never the root itself).
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

echo "→ Assembling site into: $OUT"
rm -rf -- "$OUT"
mkdir -p "$OUT/assets" "$OUT/docs/images" "$OUT/.well-known"

# Disable Jekyll so GitHub Pages serves staged files (incl. index.md) verbatim.
touch "$OUT/.nojekyll"

# Top-level pages + markdown mirror.
cp "$ROOT/site/index.html" "$OUT/index.html"
cp "$ROOT/site/index.md"   "$OUT/index.md"

# Root docs that the landing page (and published entrypoints) link to.
cp "$ROOT/README.md"   "$OUT/README.md"
cp "$ROOT/AGENTS.md"   "$OUT/AGENTS.md"
cp "$ROOT/llms.txt"    "$OUT/llms.txt"
cp "$ROOT/llms-full.txt" "$OUT/llms-full.txt"
cp "$ROOT/sitemap.md"  "$OUT/sitemap.md"
cp "$ROOT/sitemap.xml" "$OUT/sitemap.xml"
cp "$ROOT/robots.txt"  "$OUT/robots.txt"
cp "$ROOT/agent-permissions.json" "$OUT/agent-permissions.json"
cp "$ROOT/agent-permissions.json" "$OUT/.well-known/agent-permissions.json"

# Only the specific docs the site links to (do NOT copy internal handoff docs).
cp "$ROOT/docs/architecture.md"   "$OUT/docs/architecture.md"
cp "$ROOT/docs/api-reference.md"  "$OUT/docs/api-reference.md"
cp "$ROOT/docs/custom-agents.md"  "$OUT/docs/custom-agents.md"

# Docs-tree images referenced by staged markdown (keep relative ./images/ paths).
cp "$ROOT/docs/images/dashboard_preview.svg" \
  "$OUT/docs/images/dashboard_preview.svg"
cp "$ROOT/docs/images/orchestrator_architecture.png" \
  "$OUT/docs/images/orchestrator_architecture.png"

# Showcase assets referenced by index.html / index.md.
cp "$ROOT/docs/images/dashboard_preview.mp4" "$OUT/assets/dashboard_preview.mp4"
cp "$ROOT/docs/images/dashboard_preview.gif" "$OUT/assets/dashboard_preview.gif"

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
