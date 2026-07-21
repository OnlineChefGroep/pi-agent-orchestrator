#!/usr/bin/env bash
# Generate reviewable, non-destructive Cloud environment artifacts.
#
# Produces (in the resolved artifact directory):
#   - versions.txt              runtime + tool versions
#   - verify-cloud.log          full acceptance-gate output (ANSI stripped)
#   - pi-extension-smoke.log    Pi-host extension load proof (ANSI stripped)
#   - dashboard.svg             the real /agents dashboard rendered from dist/
#   - cloud-environment-report.md  summary with command, exit, duration, timestamp
#
# Drives the real compiled implementation, never overwrites tracked docs, and
# exits non-zero if any step fails or if generation dirties tracked files.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/cursor-cloud-lib.sh
. scripts/cursor-cloud-lib.sh

cc_ensure_node
cc_assert_node

ART="$(cc_artifact_dir)"
echo "Artifact directory: $ART"
REPORT="$ART/cloud-environment-report.md"
TABLE="$(mktemp)"
trap 'rm -f "$TABLE"' EXIT
overall=0

# Snapshot the working tree BEFORE any generation runs, so the post-generation
# guard below can detect drift. Capture content hashes, not just
# `git status --porcelain`: a tracked file already modified before generation and
# modified again by a step can keep the same porcelain entry (e.g. ` M file`),
# hiding the content change. The porcelain listing still catches added/removed
# files that a `git diff HEAD` of tracked content would miss.
cc_tree_state() { git status --porcelain; }
cc_tree_hash() { git diff HEAD --binary | shasum -a 256 | awk '{print $1}'; }
before_tree="$(cc_tree_state)"
before_hash="$(cc_tree_hash)"

cc_strip_ansi() {
  sed -E 's/\x1b\[[0-9;?]*[a-zA-Z]//g'
}

run_step() {
  local title="$1" logfile="$2"
  shift 2
  local start status dur tmp
  tmp="$(mktemp)"
  start="$(date +%s)"
  # Capture the exit status inline so errexit stays on (no set +e/set -e toggle).
  status=0
  "$@" >"$tmp" 2>&1 || status=$?
  dur=$(( $(date +%s) - start ))
  cc_strip_ansi <"$tmp" >"$logfile"
  rm -f "$tmp"
  # Backticks below are literal Markdown; values come from positional args.
  # shellcheck disable=SC2016
  printf '| %s | `%s` | %s | %ss | %s |\n' \
    "$title" "$*" "$([ "$status" -eq 0 ] && echo PASS || echo "FAIL($status)")" \
    "$dur" "$(date -u +%H:%M:%SZ)" >>"$TABLE"
  echo "[$title] exit=$status duration=${dur}s -> $logfile"
  [ "$status" -eq 0 ] || overall=1
  return 0
}

# --- versions -------------------------------------------------------------
cc_print_versions >"$ART/versions.txt"
echo "[versions] -> $ART/versions.txt"

# --- acceptance gate + smoke ---------------------------------------------
run_step "verify:cloud" "$ART/verify-cloud.log" npm run verify:cloud
run_step "pi-host smoke" "$ART/pi-extension-smoke.log" bash scripts/cursor-cloud-smoke.sh

# --- dashboard artifact (real renderers, non-destructive) ----------------
run_step "dashboard render" "$ART/dashboard-render.log" \
  env SCREENSHOT_OUT="$ART/dashboard.svg" node scripts/render-screenshots.mjs

# --- validate the image is readable and non-empty ------------------------
# Grep the whole file: an XML declaration or comments at the top can push the
# <svg tag past the first 64 bytes and would falsely fail a head -c 64 check.
if [ -s "$ART/dashboard.svg" ] && grep -q "<svg" "$ART/dashboard.svg"; then
  echo "[dashboard] OK ($(wc -c <"$ART/dashboard.svg") bytes) -> $ART/dashboard.svg"
else
  echo "ERROR: dashboard.svg missing, empty, or not an SVG." >&2
  overall=1
fi

# --- guard: verify no tracked-file drift from generation ------------------
# Compare the post-generation state against the pre-generation snapshot taken
# above. Both the porcelain listing and the content hash must be unchanged.
after_tree="$(cc_tree_state)"
after_hash="$(cc_tree_hash)"
if [ "$before_tree" != "$after_tree" ] || [ "$before_hash" != "$after_hash" ]; then
  echo "ERROR: artifact generation modified tracked/working files:" >&2
  diff <(printf '%s\n' "$before_tree") <(printf '%s\n' "$after_tree") >&2 || true
  overall=1
else
  echo "[clean-tree] no working-tree drift from artifact generation"
fi

# --- environment report ---------------------------------------------------
{
  echo "# Cursor Cloud environment report"
  echo
  echo "- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Artifact directory: \`$ART\`"
  echo "- Overall: $([ "$overall" -eq 0 ] && echo PASS || echo FAIL)"
  echo
  echo "## Versions"
  echo
  echo '```'
  cat "$ART/versions.txt"
  echo '```'
  echo
  echo "## Steps"
  echo
  echo "| Step | Command | Result | Duration | When |"
  echo "| --- | --- | --- | --- | --- |"
  cat "$TABLE"
  echo
  echo "## Artifacts"
  echo
  echo "- \`versions.txt\`"
  echo "- \`verify-cloud.log\`"
  echo "- \`pi-extension-smoke.log\`"
  echo "- \`dashboard.svg\`"
} >"$REPORT"
echo "[report] -> $REPORT"

if [ "$overall" -ne 0 ]; then
  echo "ARTIFACT GENERATION FAILED" >&2
  exit 1
fi
echo "ARTIFACT GENERATION OK"
