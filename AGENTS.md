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
Currently passing: **989 tests** across **56 test files**, including performance benchmarks for render, snapshot, and virtual scrolling.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
