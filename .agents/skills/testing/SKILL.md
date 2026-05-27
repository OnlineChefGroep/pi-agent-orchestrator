---
name: testing-pi-agent-orchestrator
description: Test the pi-agent-orchestrator VS Code extension. Use when verifying code changes, running the test suite, or writing adversarial tests.
---

# Testing pi-agent-orchestrator

## Overview
This is a VS Code extension (no browser UI). All testing is shell-based via vitest.
No recording needed — capture command outputs as text evidence.

## Key Commands

```bash
# TypeScript compilation check
npx tsc --noEmit

# Lint (Biome)
npm run lint

# Run all tests
npx vitest run

# Run specific test files
npx vitest run test/handoff.test.ts test/agent-manager.test.ts

# Run tests matching a pattern
npx vitest run -t "session limits"
```

## Test Structure
- `test/handoff.test.ts` — Handoff parsing, prompt generation, rendering
- `test/error-chaos-handoff.test.ts` — Resilience: corrupted JSON, oversized payloads, DOS prevention
- `test/agent-manager.test.ts` — Session limits, usage accounting, spawn/turn enforcement
- `test/settings.test.ts` — Settings sanitization and persistence
- `test/e2e-chain.test.ts` — End-to-end agent chain execution
- `test/schedule.test.ts` / `test/schedule-e2e.test.ts` — Scheduled job execution

## Known Flaky Tests
On Windows, `schedule.test.ts` and `schedule-e2e.test.ts` may fail with `ENOTEMPTY: directory not empty, rmdir` errors during temp directory cleanup. These are pre-existing and documented in AGENTS.md as `continue-on-error` in CI. Not caused by code changes.

## Writing Adversarial Tests
When testing changes to core modules:

1. **Session limits** (`src/agent-manager.ts`): Test that setters feed into enforcement fields (`sessionLimits.maxAgentsPerSession`/`maxTotalTurnsPerSession`), not just scalar fields. Also test `setSessionLimits()` syncs scalar getters.
2. **Handoff validation** (`src/handoff.ts`): `validateHandoffShape` rejects the entire handoff (returns `null`) when any field is invalid — it does NOT filter out bad items. Test with `vi.spyOn(console, 'warn')` to assert specific error messages.
3. **Artifact validation** (`src/handoff.ts`): `isArtifact()` is called by `validateHandoffShape` — invalid artifacts cause the whole handoff to be rejected, not filtered.
4. **Tree rendering** (`src/output-handler.ts`): Test with multiple root nodes to verify `isLast` logic.

## Code Conventions
- No `any` types (AGENTS.md rule)
- Conventional commits format
- Biome for formatting/linting (not ESLint/Prettier)
- `Number.isInteger()` does NOT narrow TypeScript types — always pair with `!== undefined` checks when the source type is `T | undefined`

## Devin Secrets Needed
None — this is a pure library/extension with no external service dependencies for testing.
