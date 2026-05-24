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
- `src/agent-types.ts` — Contains `PermissionUtils` static class (one `noStaticOnlyClass` warning)
- `src/custom-agents.ts` — Contains `AgentFieldParser` static class (one `noStaticOnlyClass` warning)
- `src/default-agents.ts` — Contains `AgentPromptTemplates` static class (one `noStaticOnlyClass` warning)
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

*(Initial state: 3 `noStaticOnlyClass` warnings, 0 errors, 29/34 test files passing)*
