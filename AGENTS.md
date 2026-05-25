# AGENTS.md

## Quick commands

```bash
npm run typecheck && npm run lint && npm test   # full verification
npm run lint:fix                                # auto-fix Biome warnings
npm test -- test/some-file.test.ts              # run a single test file
npm test -- --watch                             # watch mode
```

## Project nature

This is a **pi extension** — it runs inside a pi coding agent host, not standalone. The three peer dependencies (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`) are the host platform and are never direct dependencies. The entry point is declared in `package.json` → `pi.extensions` as `./src/index.ts`.

Published to **GitHub Packages** (`npm.pkg.github.com`), not npmjs.

ES modules only (`"type": "module"`). No CommonJS.

## Lint

**Biome only.** ESLint and Prettier were deliberately removed. The Biome formatter is disabled (`biome.json` formatter.enabled = false). Run `npm run lint` (check) or `npm run lint:fix` (auto-fix).

## Test flakiness

`test/schedule.test.ts` and `test/schedule-store.test.ts` are known-flaky on **Windows** due to temp directory races. CI marks these `continue-on-error`. These failures should not block PRs or dev workflow on Windows.

## Adding built-in agents or settings

- New agent type → update `src/default-agents.ts` + `test/default-agents.test.ts` + `README.md`
- New setting → update `src/settings.ts` (interface + defaults) + `src/output-handler.ts` (`buildSettingsSnapshot` + settings menu)

## Commit style

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

## Optional peer deps

`@onlinechef/context-mode` enables `ctx_*` sandbox tools. `@onlinechefgroep/pi-subagents-tui` enables the cinematic TUI sidecar. Code paths for both are gated behind feature detection (`src/context-mode-bridge.ts`, `src/ui/agent-widget.ts`).

## Architecture at a glance

- `src/agent-types.ts` — permission model (base tools → parent restrictions → partition filter → disallow floor)
- `src/agent-runner.ts` — agent lifecycle: spawn → build context → create session → run loop
- `src/index.ts` — extension entry point, command registration, batch/group coordination
- `src/ui/agent-dashboard.ts` — vim-hotkey interactive TUI (supersedes legacy agent-widget)
- `src/swarm-join.ts` — live swarm join/leave coordination
- `src/schedule.ts` + `src/schedule-store.ts` — cron-style scheduling, persisted to `.pi/subagent-schedules/`

See `docs/architecture.md` for the full module map and data-flow diagram.
