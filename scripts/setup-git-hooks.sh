#!/usr/bin/env bash
#
# setup-git-hooks.sh — installs local git hooks for lint/typecheck/test.
#
# Usage: bash scripts/setup-git-hooks.sh
# Run once after cloning the repository.
#
# Copies hooks from scripts/git-hooks/ to .git/hooks/.
# Since .git/hooks/ is not version-controlled, new clones
# need to run this once to enable the hooks.
#

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SOURCE="${PROJECT_ROOT}/scripts/git-hooks"
HOOK_TARGET="${PROJECT_ROOT}/.git/hooks"

if [ ! -d "${HOOK_TARGET}" ]; then
	echo "Skipping hook installation: not a git repository (no .git/hooks/ directory)"
	exit 0
fi

if [ ! -f "${HOOK_SOURCE}/pre-commit" ] || [ ! -f "${HOOK_SOURCE}/pre-push" ]; then
	echo "Error: hooks not found in ${HOOK_SOURCE}"
	echo "Expected: pre-commit and pre-push"
	exit 1
fi

echo "Installing hooks to ${HOOK_TARGET}..."
cp "${HOOK_SOURCE}/pre-commit" "${HOOK_TARGET}/pre-commit"
cp "${HOOK_SOURCE}/pre-push" "${HOOK_TARGET}/pre-push"
chmod +x "${HOOK_TARGET}/pre-commit" "${HOOK_TARGET}/pre-push"

echo "Done. Hooks installed:"
echo "  pre-commit: Biome lint (auto-fix) + tsc typecheck"
echo "  pre-push:   npm test (full suite)"
echo ""
echo "Skip with: git commit --no-verify  /  git push --no-verify"
