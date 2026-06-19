# CLAUDE.md

## Quick Reference

```bash
npm install                  # install deps (needs access to GitHub Packages for peer deps)
npm run build                # compile TypeScript → dist/
npm test                     # run all tests (vitest run --retry=2, 1035 tests across 58 files)
npm test -- path/to.test.ts  # single test file
npm test -- --watch          # watch mode
npm run typecheck            # tsc --noEmit (no output, type errors only)
npm run lint                 # biome check src/ test/
npm run lint:fix             # biome check --fix src/ test/
npm run typecheck && npm run lint && npm test   # full verification
```

## What This Is

A **Pi extension** (not standalone) that adds autonomous sub-agent orchestration to `pi-coding-agent`. It runs inside the Pi host platform — the `@earendil-works/pi-*` host-platform packages are never bundled with this extension. `@earendil-works/pi-tui` is no longer a direct dependency — its API surface is mirrored locally in `src/ui/pi-tui-compat.ts` (see Common Mistake #4 in `AGENTS.md` for the rule across all three categories).

Entry point is declared in `package.json` → `pi.extensions` as `./src/index.ts`. Published to **GitHub Packages** (`npm.pkg.github.com`), not npmjs.

## Architecture

```
src/
  index.ts              Extension entry — registers tools (Agent, get_subagent_result, steer_subagent),
                        commands (/agents), hooks, and the widget lifecycle
  agent-types.ts        Permission model: base tools → parent restrictions → partition filter → disallow floor
  agent-runner.ts       Agent lifecycle: spawn → build context → create session → run loop
  agent-manager.ts      Manager wrapper around ExtensionAPI's AgentManager
  agent-registry.ts     Load default + custom agents, runtime settings getters/setters
  default-agents.ts     Four embedded agents: general-purpose, Explore, Plan, Analysis
  custom-agents.ts      Parse .pi/agents/*.md frontmatter into AgentConfig
  types.ts              Shared interfaces: AgentConfig, AgentRecord, JoinMode, SubagentType

  schedule.ts           SubagentScheduler — cron/recurrence via croner
  schedule-store.ts     File-backed schedule persistence (.pi/subagent-schedules/)
  hooks.ts              Lifecycle hook registry with timeout protection
  handoff.ts            Structured JSON handoff between agents
  context.ts            Build parent context, extract text from messages
  context-mode-bridge.ts  Inject ctx_* tools when context-mode is enabled
  compaction.ts         Prune old tool outputs to free context window
  settings.ts           Typed settings with defaults, validation, and change emission
  model-resolver.ts     Resolve model aliases to full model names
  validators.ts         Post-completion adversarial validation
  memory.ts             Memory partition types and resolution
  prompts.ts            Prompt template system with placeholders
  cross-extension-rpc.ts  RPC between Pi extensions
  swarm-join.ts         SwarmCoordinator — live join/leave collaborative swarms
  group-join.ts         Batch/group manager for background agent coordination
  batch-orchestrator.ts Batch orchestration for parallel agent spawns
  worktree.ts           Git worktree creation and cleanup
  env.ts                Environment detection and feature gating
  skill-loader.ts       Skill loading for agent contexts
  telemetry.ts          Telemetry and metrics collection
  output-file.ts        Output file generation for completed agents
  output-handler.ts     /agents menu, settings UI, conversation viewer
  usage.ts              Token and turn tracking, session context percentage

  ui/                   TUI components (declarative Component-based, see src/ui/pi-tui-compat.ts)
    agent-dashboard.ts      Rich interactive dashboard: list, top, schedules (z), perf (/perf), help (?)
    agent-widget.ts         Above-editor widget with virtual scrolling, thinking level, compact batches
    conversation-viewer.ts  Live conversation overlay
    schedule-menu.ts        Schedule management menu
    settings-menu.ts        Settings UI
    theme.ts                Theme system
    animation.ts            Spinner animations (braille, dots, lines, classic, none)
    dashboard/              Modular dashboard components (swarm-section, schedules-section, 
                            compact-row, panels, header, body, helpers, progress)

test/                   Vitest test suite (1035 tests across 58 files)
docs/                   Architecture, API reference, troubleshooting, custom agents guide
examples/agents/        Example agent definition files
.agents/                Agent definitions: 4 daemons + 6 skills (graphify, overdrive, showcase, testing, autoresearch, infrastructure)
```

## Key Patterns

**ESM only.** `"type": "module"` — all imports use `.js` extensions, no CommonJS.

**TypeBox for tool schemas.** `@sinclair/typebox` defines runtime-validated parameter schemas for Pi tools (see `index.ts` tool registration). `Type.Object({ ... })` with `Type.String()`, `Type.Optional()`, `Type.Boolean()`, `Type.Number()`.

**Module-level state with getter/setter pairs.** Not classes — most modules (agent-runner, agent-registry, settings) export module-scoped `let` variables with exported get/set functions. Example: `getDefaultMaxTurns()` / `setDefaultMaxTurns()`. This is the standard pattern here, not singletons.

**Settings cascade.** Global settings from `~/.pi/agent/subagents.json`, overridden by project-level `.pi/subagents.json`. The `settings.ts` `sanitize()` function validates all values against ceilings before applying.

**Extension entry pattern.** `index.ts` default-exports a function `(pi: ExtensionAPI) => void` — the Pi host calls this to initialize the extension. All tools and commands are registered inside this function closure.

**Custom agents from Markdown.** `.pi/agents/*.md` files with YAML frontmatter are parsed by `custom-agents.ts` into `AgentConfig` objects. Security validation in `validateAgentConfig()`.

## Conventions

- **TypeScript strict mode** (`tsconfig.json` → `strict: true`)
- **Target ES2022**, module ES2022, bundler resolution
- **Biome for linting** (ESLint/Prettier removed). Formatter is disabled in Biome (`biome.json` → `formatter.enabled: false`) — formatting is manual.
- **Vitest for tests**, with `--retry=2` for flake resilience. Tests in `test/` directory.
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **`.js` extensions in imports** — required for ESM resolution: `import { foo } from "./bar.js"`
- **No `any` suppression needed** — `noExplicitAny` is off in Biome config
- **Memory heap**: build/test/typecheck scripts run Node with `--max-old-space-size=4096`

## Common Pitfalls

1. **Peer deps not installed.** This extension cannot run without the Pi host packages. For local development, link them via `npm link` or ensure they're in the GitHub Packages registry.

2. **CommonJS assumptions.** No `require()`, no `module.exports`, no `.cjs` files. Everything is ESM.

3. **Module-level state.** Don't assume classes are instantiated — most state lives at module scope with getter/setter exports. Mock carefully in tests.

4. **Test flakiness on Windows.** `schedule.test.ts` and `schedule-store.test.ts` have known temp directory race conditions on Windows. CI marks them `continue-on-error`.

5. **Schedule minimum interval.** Schedules enforce a 60-second minimum interval (1 second in test/VITEST environment). See `MIN_INTERVAL` in `schedule.ts`.

6. **Adding built-in agents.** Update `default-agents.ts` + `test/default-agents.test.ts` + `README.md`.

7. **Adding settings.** Update `settings.ts` (interface + defaults + sanitize function) + `output-handler.ts` (buildSettingsSnapshot + settings menu).

8. **Optional peer deps.** `@onlinechef/context-mode` is optional — its code path is gated behind feature detection, not a hard import.

9. **Security fixes.** CVE-002 through CVE-005 fixes are in place (input validation, size limits, control char sanitization). Don't weaken these guards.

10. **Async performance.** The UI uses O(N) single-pass rendering, Set-based cleanup (not O(N×M) some()), and inline category iteration (no wrapper objects). See `docs/PERFORMANCE.md` for the full performance architecture.

## Recent Features (v0.12.1)

- **Daemon Integration**: All 4 daemons have Pi Orchestra Integration sections in their DAEMON.md files with schedule info, monitoring, and toggle docs.
- **Schedule UI**: `z` keybinding in dashboard shows daemon schedules as a compact table (status, name, interval, type, runs).
- **Thinking Level**: `🧠` indicator in widget, dashboard rows, and detail panel showing agent invocation thinking level.
- **Async Perf Optimizations**: O(N×M)→O(N+M) cleanup, removed intermediate array allocations, direct category iteration for virtual scrolling.

## Showcase

Showcase media (GIFs, MP4s) for README are generated by the **showcase** skill (`.agents/skills/showcase/SKILL.md`). Do not document showcase pipelines in README or docs — the skill is the single source of truth. The showcase is a separate concern from pi-orchestrator itself.
