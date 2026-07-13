#!/usr/bin/env bash
# Assemble the Cloudflare Pages publish directory for the project site.
#
# The marketing SPA is built from site/web/ (Vite). Public docs, discovery
# metadata, and showcase assets are copied alongside the SPA output so agents
# and humans can fetch markdown and JSON directly from the deployed origin.
#
# Usage: scripts/build-site.sh [output_dir]   (default: ./_site)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
WEB="$ROOT/site/web"

echo "→ Assembling site into: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# Vite SPA root (primary entry). Fall back to legacy static HTML if site/web is absent.
if [[ -f "$WEB/package.json" ]]; then
	echo "→ Building Vite app in site/web/"
	(
		cd "$WEB"
		npm ci
		npm run build
	)
	if [[ ! -d "$WEB/dist" ]]; then
		echo "error: site/web/dist not found after build" >&2
		exit 1
	fi
	cp -R "$WEB/dist/." "$OUT/"
else
	echo "→ site/web not present yet; staging deprecated site/index.html as fallback"
	cp "$ROOT/site/index.html" "$OUT/index.html"
fi

mkdir -p "$OUT/assets" "$OUT/docs" "$OUT/.well-known" "$OUT/wiki"

# Markdown mirror of the landing page (direct fetch, not the SPA shell).
cp "$ROOT/site/index.md" "$OUT/index.md"

# Root docs, discovery metadata, and agent permissions.
cp "$ROOT/README.md" "$ROOT/AGENTS.md" "$ROOT/CHANGELOG.md" "$OUT/"
cp "$ROOT/llms.txt" "$ROOT/llms-full.txt" "$ROOT/sitemap.md" "$ROOT/sitemap.xml" "$ROOT/robots.txt" "$ROOT/agent-permissions.json" "$OUT/"
cp "$ROOT/agent-permissions.json" "$OUT/.well-known/agent-permissions.json"
cp "$ROOT/llms-full.txt" "$OUT/wiki/index.md"
cp "$ROOT/llms.txt" "$OUT/wiki/llms.txt"

# Public docs only — exclude internal handoff/refactor and RFC drafts.
PUBLIC_DOCS=(
	architecture.md
	api-reference.md
	custom-agents.md
	troubleshooting.md
	index.md
	repository.md
	motion-profiles.md
	HOWTO-perf.md
	PERFORMANCE.md
	overdrive-patterns.md
	agentic-loop-spec.md
)
for doc in "${PUBLIC_DOCS[@]}"; do
	cp "$ROOT/docs/$doc" "$OUT/docs/$doc"
done
mkdir -p "$OUT/docs/images"
cp -R "$ROOT/docs/images/." "$OUT/docs/images/"

# Showcase assets referenced by index.md and README.
cp "$ROOT/docs/images/dashboard_preview.mp4" "$OUT/assets/dashboard_preview.mp4"
cp "$ROOT/docs/images/dashboard_preview.gif" "$OUT/assets/dashboard_preview.gif"

# SPA client-route fallback for exact React routes only.
# Cloudflare Pages always applies _redirects (even when an asset exists), so never
# use a /* catch-all — that would shadow /docs/*.md, robots.txt, and assets.
# Prefer the Vite-copied public/_redirects when present; otherwise write the same
# allowlist.
if [[ -f "$WEB/package.json" && ! -f "$OUT/_redirects" ]]; then
	cat > "$OUT/_redirects" <<'EOF'
/install /index.html 200
/capabilities /index.html 200
/docs /index.html 200
EOF
fi

touch "$OUT/.nojekyll"

echo "✓ Site staged. Contents:"
( cd "$OUT" && find . -type f -printf '%P\t%s bytes\n' | sort )
echo "✓ Total size: $(du -sh "$OUT" | cut -f1)"
