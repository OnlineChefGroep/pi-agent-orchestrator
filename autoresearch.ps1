#!/usr/bin/env pwsh
# Run the benchmark and output METRIC lines to stdout.

$ErrorActionPreference = "Stop"

# Pre-check: TypeScript syntax (basic file readability)
$files = @("src/agent-types.ts", "src/custom-agents.ts", "src/default-agents.ts")
foreach ($f in $files) {
    if (-not (Test-Path $f)) { Write-Output "PRE-CHECK FAILED: $f not found"; exit 1 }
}

# Run lint
$output = & (Join-Path "node_modules" ".bin" "biome") check "src/" "test/" 2>&1 | Out-String
$exitCode = $LASTEXITCODE

# Count warnings and errors
$warnings = 0; $errors = 0
if ($output -match "Found\s+(\d+)\s+warnings?") { $warnings = [int]$Matches[1] }
if ($output -match "Found\s+(\d+)\s+errors?") { $errors = [int]$Matches[1] }

Write-Output "METRIC lint_warnings=$warnings"
Write-Output "METRIC lint_errors=$errors"
