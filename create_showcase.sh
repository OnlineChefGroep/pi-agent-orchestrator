#!/usr/bin/env bash
# Full showcase pipeline (wrapper for npm run showcase)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec bash "$ROOT/scripts/showcase-all.sh"
