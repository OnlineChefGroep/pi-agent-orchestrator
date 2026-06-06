# AGENTS.md

## Quick commands

```bash
npm run typecheck && npm run lint && npm test   # full verification
npm run lint:fix                                # auto-fix Biome warnings
npm test -- test/some-file.test.ts              # run a single test file
npm test -- --watch                             # watch mode
```

## Project nature

This is a **pi extension** — it runs inside a pi coding agent host, not standalone. The three peer dependencies (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`) are the host platform and are never direct dependencies. The entry point is declared in `package.json` → `pi.extensions` as `./src/index.ts`.

Published to **GitHub Packages** (`npm.pkg.github.com`), not npmjs.

ES modules only (`"type": "module"`). No CommonJS.

## Lint

**Biome only.** ESLint and Prettier were deliberately removed. The Biome formatter is disabled (`biome.json` formatter.enabled = false). Run `npm run lint` (check) or `npm run lint:fix` (auto-fix).

## Test flakiness

`test/schedule.test.ts` and `test/schedule-store.test.ts` are known-flaky on **Windows** due to temp directory races. CI marks these `continue-on-error`. These failures should not block PRs or dev workflow on Windows.

## Adding built-in agents or settings

- New agent type → update `src/default-agents.ts` + `test/default-agents.test.ts` + `README.md`
- New setting → update `src/settings.ts` (interface + defaults) + `src/output-handler.ts` (`buildSettingsSnapshot` + settings menu) + `docs/api-reference.md`

## Commit style

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Common Mistakes

These are patterns that have caused bugs or wasted review cycles. Read before touching the codebase.

### 1. YAML boolean strings are strings, not booleans

When reading frontmatter via `js-yaml`, `handoff: true` is parsed as a JS string `"true"`, not a boolean. Use `parseBooleanOptional`/`parseBooleanWithDefault` helpers in `src/custom-agents.ts` — never write `if (frontmatter.handoff)` because that makes `handoff: "false"` truthy.

```ts
// Don't do this — string "false" is truthy
if (frontmatter.handoff) { /* runs for "false" string */ }

// Do this — explicit parse with strict semantics
handoff: parseBooleanWithDefault(fm.handoff, false),
```

### 2. ESM imports need explicit `.js` extensions

Even though source is TypeScript, imports must use `.js` (not `.ts`). `import { x } from './foo.js'` ✅, `import { x } from './foo'` ❌, `import { x } from './foo.ts'` ❌.

### 3. Type-only imports must use `import type`

`import type { Foo } from './foo.js'` for types. This is enforced by Biome and prevents accidental runtime imports of type-only modules.

### 4. The three `@earendil-works/pi-*` packages are NEVER direct deps

They are the host platform (the parent pi coding agent). Reference them via feature detection, never `import` from them in a way that assumes they exist. See `src/context-mode-bridge.ts` for the pattern.

### 5. Windows schedule tests are known-flaky

`test/schedule.test.ts` and `test/schedule-store.test.ts` race on temp dirs in Windows CI. CI marks them `continue-on-error`. Local Windows runs may flake. This is a known issue, not a regression in your code.

### 6. Biome formatter is disabled

Don't run `prettier` or assume `biome format` works. `biome.json` has `formatter.enabled: false`. Use `biome check` for lint, `npm run lint:fix` to auto-fix.

### 7. Biome requires double quotes

`"foo"` ✅, `'foo'` ❌. Use template literals for interpolation. The project's Biome config enforces double quotes.

### 8. Avoid `as any` in test mocks

When mocking `AgentRecord` or similar types, include ALL required fields. `as any` defeats type checking and breaks the `Parse Don't Validate` philosophy. Reference the type in `src/types.ts` and copy the shape.

```ts
// Don't do this
const mock = { id: "x" } as any;

// Do this
const mock: AgentRecord = { id: "x", /* all required fields */ };
```

### 9. Benchmark tests use `toBeLessThan` thresholds, not `console.log`

`test/*.benchmark.test.ts` files should assert performance with `expect(elapsed).toBeLessThan(threshold)`. `console.log` + `toContain` is a CodeRabbit-flagged anti-pattern in this repo.

### 10. Settings persist to `.pi/subagent-settings.json`

Not to `package.json`, not to env vars (except at first-run). The schema lives in `src/settings.ts` (`SubagentsSettings` interface). When adding a setting: update the interface, defaults, validation, snapshot (`buildSettingsSnapshot` in `output-handler.ts`), AND the settings menu.

### 11. Pre-commit hook runs biome + tsc only, NOT tests

Tests are in the pre-push hook. If you must push and tests are slow/flaky, `git push --no-verify` is acceptable but document why in the commit body. Hooks are opt-in: run `npm run setup:hooks` after `npm install` to enable.

### 12. Extension entry is `pi.extensions` in package.json

The `pi.extensions` field points to your entry file (e.g., `./dist/index.js` after build). The host loads this. Don't rename or restructure without updating package.json.

### 13. Map/Set preserve insertion order

Rely on this for deterministic UI output (running agents first, then queued, then done). Don't sort unless you need a different order.

### 14. Conventional commit types are limited

`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. No `feat!` (use a body footer `BREAKING CHANGE:` instead). Scopes are recommended for clarity (e.g., `feat(agents):`).

### 15. Test files live in `test/`, not `tests/`

Use `.test.ts` extension. Use `describe`/`it`/`expect` from vitest. Do not co-locate tests with source files.

## Optional peer deps

`@onlinechef/context-mode` enables `ctx_*` sandbox tools. `@onlinechefgroep/pi-subagents-tui` enables the cinematic TUI sidecar. Code paths for both are gated behind feature detection (`src/context-mode-bridge.ts`, `src/ui/agent-widget.ts`).

## Settings reference

All runtime-configurable settings are defined in `src/settings.ts` (`SubagentsSettings` interface) and surfaced through `/agents → Settings`. See `docs/api-reference.md` for the full settings schema.

## Architecture at a glance

- `src/agent-types.ts` — permission model (base tools → parent restrictions → partition filter → disallow floor)
- `src/agent-runner.ts` — agent lifecycle: spawn → build context → create session → run loop
- `src/index.ts` — extension entry point, command registration, batch/group coordination
- `src/ui/agent-dashboard.ts` — vim-hotkey interactive TUI featuring standard view and the `/agents top` resource usage view
- `src/ui/agent-top-renderer.ts` — top view table calculations, sorting (by tokens, turns, duration, tool uses, name, recency), and pagination
- `src/ui/agent-widget-renderer.ts` + `src/ui/agent-widget.ts` — virtual scrolling logic, rendering safety limits, batching and debouncing spawns
- `src/swarm-join.ts` — live swarm join/leave coordination
- `src/schedule.ts` + `src/schedule-store.ts` — cron-style scheduling, persisted to `.pi/subagent-schedules/`

See `docs/architecture.md` for the full module map and data-flow diagram.

## Verification Suite

Ensure you run `npm run typecheck && npm run lint && npm test` before committing.
Currently passing: **1006 tests** across **57 test files**, including performance benchmarks for render, snapshot, and virtual scrolling.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
