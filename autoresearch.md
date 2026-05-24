# Autoresearch: Lint Warnings Elimination

## Objective

Eliminate all Biome lint warnings and progressively enable stricter rules for the pi-subagents TypeScript extension. Currently there are 3 `noStaticOnlyClass` warnings. After fixing those, we'll incrementally enable more strict Biome rules and fix any new violations.

## Metrics

- **Primary**: `lint_warnings` (count, lower is better) — Biome lint warnings count from `npm run lint`
- **Secondary**: `lint_errors` (count, lower is better) — Biome lint errors count

## How to Run

`bash autoresearch.sh` — outputs `METRIC name=number` lines.

## Files in Scope

- `biome.json` — Biome linter configuration (enable/disable rules)
- `biome.json` — Biome linter configuration (enable/disable rules)
- All `src/**/*.ts` and `test/**/*.ts` files — may be modified to fix newly enabled lint rules
- Any `.ts` files that get flagged by newly enabled Biome rules

## Off Limits

- `node_modules/` — external dependencies
- `.factory/` — Factory configuration
- `.github/` — CI configuration
- `docs/` — documentation
- Test logic/behavior must remain identical (tests must still pass after each change)

## Constraints

- Tests must pass (`npm test`) — pre-existing failures (5 test files with ENOENT temp dir issues) are acceptable as they existed before optimization
- TypeScript must typecheck (`npm run typecheck`)
- No new dependencies
- No changes to runtime behavior

## Termination

Run until interrupted by the user.

## What's Been Tried

### Experiment 1 (baseline)
- **Result**: KEPT — 3 warnings, 0 errors
- **Description**: Baseline measurement of current lint state

### Experiment 2 — Convert static-only classes to functions ✓
- **Result**: KEPT — 0 warnings, 0 errors (100% reduction!)
- **Description**: Converted `PermissionUtils` (agent-types.ts), `AgentFieldParser` (custom-agents.ts), and `AgentPromptTemplates` (default-agents.ts) from classes with only `static` members to plain module-level functions and constants
- **Files changed**: `src/agent-types.ts`, `src/custom-agents.ts`, `src/default-agents.ts`
- **Key insight**: All three classes had zero instance state, making the conversion trivial — functions and constants are strictly equivalent here
