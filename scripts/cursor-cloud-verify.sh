#!/usr/bin/env bash
# Node-safe entry point for the canonical Cloud verification gate.
#
# Ensures a compliant Node is on PATH, then runs the internal verification
# sequence in a stable order while propagating the first failing exit code.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/cursor-cloud-lib.sh
. scripts/cursor-cloud-lib.sh

cc_ensure_node
cc_assert_node

exec npm run verify:cloud:internal
