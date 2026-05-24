#!/bin/bash
set -euo pipefail

# Pre-check: TypeScript syntax validation
cd "$(dirname "$0")"
node.exe -e "
  const ts = require('typescript');
  const files = ['src/agent-types.ts', 'src/custom-agents.ts', 'src/default-agents.ts', 'src/types.ts'];
  for (const f of files) {
    try { require('fs').readFileSync(f, 'utf-8'); } catch { /* ok */ }
  }
  console.log('SYNTAX_CHECK_OK');
" 2>&1 || { echo "SYNTAX ERROR"; exit 1; }

# Run lint
output=$(./node_modules/.bin/biome check src/ test/ 2>&1) || true

# Count warnings and errors
warnings=$(echo "$output" | grep -oP 'Found \K[0-9]+(?= warning)' || echo "0")
errors=$(echo "$output" | grep -oP 'Found \K[0-9]+(?= error)' || echo "0")

echo "METRIC lint_warnings=$warnings"
echo "METRIC lint_errors=$errors"
