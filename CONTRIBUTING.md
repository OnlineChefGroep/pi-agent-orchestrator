# Contributing to @onlinechefgroep/pi-agent-orchestrator

Thank you for contributing. This document covers build, test, lint, and PR workflow.

---

## Development Environment

- **Node.js:** 20+ (LTS)
- **OS:** Linux, macOS, Windows (CI tests run on ubuntu-latest)

---

## Quick Start

```bash
# Install dependencies
npm install

# TypeScript typecheck
npm run typecheck

# Lint (Biome)
npm run lint

# Run tests
npm test

# Full verification
npm run typecheck && npm run lint && npm test
```

---

## Project Structure

```
src/
  index.ts                 # Public API exports
  agent-*.ts               # Core agent logic (types, runner, registry, manager)
  custom-agents.ts         # Load user-defined .md agents
  default-agents.ts        # Embedded default agent configs
  compaction.ts            # Conversation pruning
  context*.ts              # Context building and deferred context
  handoff.ts               # Structured agent handoff protocol
  hooks.ts                 # Lifecycle hook system
  memory.ts                # Memory partition management
  model-resolver.ts        # Model name resolution
  output-handler.ts        # /agents menu, settings, conversation viewer
  schedule*.ts             # Subagent scheduling
  settings.ts              # Persistent settings
  types.ts                 # Shared type definitions
  usage.ts                 # Token/turn tracking
  validators.ts            # Post-completion validation
  worktree.ts              # Git worktree operations
  cross-extension-rpc.ts   # Inter-extension RPC
  ui/                      # TUI components (widget, menus, viewer)
```

---

## Lint & Format

We use **Biome** for both linting and formatting.

```bash
# Check (no write)
npm run lint

# Check + auto-fix safe issues
node_modules/.bin/biome check --write src/ test/

# Check + auto-fix unsafe issues too
node_modules/.bin/biome check --write --unsafe src/ test/
```

**Never run Prettier or ESLint** — they have been removed from the project.

---

## Testing

We use **Vitest**.

```bash
# All tests
npm test

# Watch mode during development
npm test -- --watch

# Single file
npm test -- test/default-agents.test.ts

# With coverage (if configured)
npm test -- --coverage
```

**Known issue:** On Windows, `schedule.test.ts` and `schedule-store.test.ts` have pre-existing flaky tests related to temp directory races. These are tracked separately and should not block PRs.

---

## Pull Request Workflow

1. **Branch:** Create a feature branch from `main`.
2. **Commits:** Use [Conventional Commits](https://www.conventionalcommits.org/) style:
   - `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
3. **Pre-commit:** Ensure `npm run typecheck`, `npm run lint`, and `npm test` pass (Windows schedule flakiness excepted).
4. **PR description:** Reference any related issues or VERVOLG_PLAN items.
5. **Review:** All PRs require at least one review before merge.

---

## Custom Agent Development

If you add a new built-in agent type, update:

- `src/default-agents.ts` — add the `AgentConfig` to `DEFAULT_AGENTS`
- `test/default-agents.test.ts` — add assertions for the new config
- `README.md` — add to the Agent Types table

If you add new settings, update:

- `src/settings.ts` — add to `SubagentsSettings` interface and defaults
- `src/output-handler.ts` — wire into `buildSettingsSnapshot` and settings menu

---

## Questions?

Open an issue or refer to `docs/` for architecture, API reference, and troubleshooting guides.
