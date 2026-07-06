# Contributing to @onlinechefgroep/pi-agent-orchestrator

Thank you for contributing. This document covers build, test, lint, and PR workflow.

This project is a **pi extension** — it runs inside a [pi coding agent](https://github.com/OnlineChefGroep) host, not standalone. The three `@earendil-works/pi-*` packages are the host platform and are never direct dependencies. See the [README](README.md) for installation options.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## First-Time Contributors

New to the project? Start here:

1. Read [AGENTS.md](AGENTS.md) for architecture, common mistakes, and conventions.
2. Look for issues labeled **good first issue** in the [issue tracker](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues).
3. Run `npm run setup:hooks` after clone to enable pre-commit checks.

---

## Development Environment

- **Node.js:** 22+ (LTS)
- **OS:** Linux, macOS, Windows (CI tests run on ubuntu-latest)

---

## Quick Start

```bash
# Install dependencies
npm install

# Optional: install local git hooks (biome + tsc on commit, full tests on push)
npm run setup:hooks

# TypeScript typecheck
npm run typecheck

# Lint (Biome)
npm run lint

# Run tests
npm test

# Run performance benchmarks
npm run bench:all

# Full verification
npm run typecheck && npm run lint && npm test
```

---

## Project Structure

```
src/
  index.ts                 # Extension entry point
  agent-types.ts           # Permission model
  agent-runner.ts          # Agent lifecycle
  agent-manager.ts         # Manager wrapper
  agent-registry.ts        # Agent registry + settings
  default-agents.ts        # Built-in agent configs
  custom-agents.ts         # Custom .md agent loader
  settings.ts              # Persistent settings
  compaction.ts            # Context pruning
  context.ts               # Parent context
  handoff.ts               # Handoff protocol
  hooks.ts                 # Lifecycle hooks
  memory.ts                # Memory partitions
  prompts.ts               # Prompt templates
  schedule*.ts             # Scheduling engine
  swarm-join.ts            # Swarm coordination
  group-join.ts            # Batch/group manager
  batch-orchestrator.ts    # Parallel agent orchestration
  orchestration-dispatch.ts # Auto mode dispatch
  cross-extension-rpc.ts   # Inter-extension RPC
  validators.ts            # Post-completion validation
  worktree.ts              # Git worktree ops
  debug-capture.ts         # Offline debug capture
  ui/                     # TUI components
    agent-dashboard.ts       # Interactive dashboard
    agent-widget.ts          # Above-editor widget
    conversation-viewer.ts   # Conversation overlay
    agent-top-renderer.ts    # Top view table
    dashboard/               # Dashboard modules
    theme.ts                 # Theme system
    animation.ts             # Spinner animations
    settings-menu.ts         # Settings UI
    schedule-menu.ts         # Schedule management
test/                   # Vitest tests (95 files)
docs/                   # Documentation
.agents/                # Daemon + skill definitions
  daemons/
  skills/
    graphify/
    overdrive/
    showcase/
    testing/
```

---

## Lint & Format

We use **Biome** for both linting and formatting (2-space indent, 120 char width, double quotes).

```bash
# Check (no write)
npm run lint

# Check + auto-fix safe issues
node_modules/.bin/biome check --write src/ test/

# Check + auto-fix unsafe issues too
node_modules/.bin/biome check --write --unsafe src/ test/

# Format only
npm run format
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

**Known issue:** On Windows, `schedule.test.ts` and `schedule-store.test.ts` have pre-existing flaky tests related to temp directory races. CI marks these `continue-on-error`. These failures should not block PRs or dev workflow on Windows.

---

## Pull Request Workflow

1. **Branch:** Create a feature branch from `main`.
2. **Commits:** Use [Conventional Commits](https://www.conventionalcommits.org/) style:
   - `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
3. **Pre-commit:** Ensure `npm run typecheck`, `npm run lint`, and `npm test` pass (Windows schedule flakiness excepted). Git hooks handle this automatically if installed.
4. **PR description:** Reference any related issues or VERVOLG_PLAN items.
5. **Review:** All PRs require at least one review before merge.

---

## Git Hooks (Optional)

The project includes local git hooks that run checks automatically:

| Hook | When | What it runs |
|---|---|---|
| `pre-commit` | Before each `git commit` | Biome lint with auto-fix on staged `.ts/.js/.sh` files + full `tsc --noEmit` typecheck |
| `pre-push` | Before each `git push` | `npm test` (full test suite) |

**Install:** `bash scripts/setup-git-hooks.sh` or `npm run setup:hooks` (run once after clone)

**Skip:** `git commit --no-verify` or `git push --no-verify`

The hooks live in `scripts/git-hooks/` and are copied to `.git/hooks/` during setup. Since `.git/hooks/` is not version-controlled, the setup script ensures new clones can enable them with one command.

---

## Common Pitfalls

Before contributing, read [AGENTS.md → Common Mistakes](AGENTS.md#common-mistakes) for the 15-item checklist of patterns that have caused bugs or wasted review cycles in this codebase. Highlights:

- YAML booleans from `js-yaml` are strings — use the parsing helpers in `src/custom-agents.ts`
- ESM imports need `.js` extensions even in TypeScript
- Tests live in `test/`, not `tests/`
- The `pi-*` peer packages are never direct dependencies
- Biome uses double quotes; formatter is disabled

---

---

## Custom Agent Development

If you add a new built-in agent type, update:

- `src/default-agents.ts` — add the `AgentConfig` to `DEFAULT_AGENTS`
- `test/default-agents.test.ts` — add assertions for the new config
- `README.md` — add to the Agent Types table

If you add new settings, update:

- `src/settings.ts` — add to `SubagentsSettings` interface and defaults
- `src/output-handler.ts` — wire into `buildSettingsSnapshot` and settings menu
- `docs/api-reference.md` — add to the public API settings documentation

---

## Publishing

This package is published to npmjs.org as `@onlinechefgroep/pi-agent-orchestrator`.

1. Ensure you have an `NPM_TOKEN` with publish access for the `@onlinechefgroep` scope.
2. Bump the version in `package.json` and update `CHANGELOG.md`.
3. Create a PR, get it reviewed, and merge to `main`.
4. Tag the release: `git tag v<version> && git push origin v<version>`
5. CI publishes automatically via `publish-npm.yml` (npmjs.org) and `publish.yml` (GitHub Packages mirror).

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

Open an issue or refer to `docs/` for architecture, API reference, and troubleshooting guides.

## Incident Response

If you encounter a production issue (broken publish, CI red on main, security report), follow the [incident response runbooks](docs/runbooks.md). The runbooks define severity levels, investigation steps, and remediation procedures.

## Branch Protection

The `main` branch has protection rules:
- CI must pass before merge
- Branches must be up-to-date before merge
- At least one review recommended (not strictly required for solo maintainer)
