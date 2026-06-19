# @onlinechefgroep/pi-agent-orchestrator

> Multi-agent orchestrator for Pi coding agents — sub-agents, handoffs, prompt compression, scheduling, and cinematic TUI dashboard.

[![npm version](https://img.shields.io/npm/v/@onlinechefgroep/pi-agent-orchestrator)](https://www.npmjs.com/package/@onlinechefgroep/pi-agent-orchestrator)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions)
[![Tests](https://img.shields.io/badge/tests-1619%20passed-brightgreen)](https://github.com/OnlineChefGroep/pi-agent-orchestrator)

A Pi extension that adds powerful orchestration capabilities: autonomous sub-agents, structured handoffs, 3-tier prompt compression, cron scheduling, swarm coordination, and a vim-style interactive TUI dashboard.

## Features

- **Interactive TUI Dashboard** — Vim-style hotkeys (`j/k` navigate, `z` schedules, `t` top view, `?` help, `/perf` metrics). 6 interactive views: list, resource top, daemon schedules, performance metrics, help overlay, settings.
- **Sub-agent System** — Spawn specialized agents (Explore, Plan, Analysis, general-purpose, custom) with intelligent coordination, permission inheritance, and partition filtering.
- **Thinking Level Display** — `🧠` indicator in widget, dashboard rows, and detail panel showing agent invocation thinking level (low/medium/high).
- **Prompt Compression** — `minimal` / `balanced` / `aggressive` levels with global default + per-agent overrides. Dramatically reduces token usage while keeping essential context.
- **Scheduling Engine** — Cron-style scheduling for recurring autonomous agent jobs with persistent store and daemon schedule view (`z` key).
- **Daemon Integration** — 4 autonomous daemons with Pi Orchestra Integration docs: github-activity-digest, js-ts-dependency-upgrades, linear-issue-labeler, pr-check-repair.
- **Handoff Protocol** — Clean JSON-based handoff system between agents enabling chain-of-agents workflows.
- **Custom Agents** — Define via simple frontmatter in `.md` files (supports `prompt_compression`, `handoff`, `thinking`, `enabled`).
- **Swarm Coordination** — Dynamic multi-agent swarm join/leave with real-time status in dashboard (`w` key).
- **Performance Skills** — `overdrive` skill for performance auditing with benchmark suite (61 benchmarks, adaptive refresh, O(N) rendering).
- **Showcase Pipelines** — tmux recording, programmatic, Remotion, VHS, and live asciinema pipelines for high-quality demos.

## What's new in v0.14.x

- **Agentic Loop (fully autonomous)**: The orchestrator now runs fully autonomous agent workflows — trigger (user/schedule/handoff) → heuristic dispatch (single/swarm/crew/auto) → spawn with permission inheritance → execute with resource quotas → self-healing validation → structured handoff → repeat. See [`docs/agentic-loop-spec.md`](docs/agentic-loop-spec.md) for the full specification.
- **Orchestration dispatch**: New `auto` mode runs keyword-based prompt analysis to pick `single` / `swarm` / `crew` without human intervention. Crew mode spawns 3 role-specialized agents (planner → executor → reviewer). 35 unit tests + e2e integration tests.
- **Health check command**: `/agents → Health check` snapshots the full runtime — process, tracing, circuit breaker, schedule, swarm, agents by status with correlation ids, settings, recent errors, and a dispatch-decision histogram so you can audit the auto-heuristic.
- **Tracing master switch (OpenTelemetry)**: New `tracingEnabled` setting (default `true`). When disabled, every span helper short-circuits to a shared no-op span. Toggle from `/agents → Settings → Tracing`.
- **Agent templates**: `/agents templates` command — browse, install, update, and remove versioned agent templates from the built-in registry. 6 templates ship out of the box.
- **Execution tree visualization**: `/agents tree` command with Mermaid/Unicode/JSON export + dashboard `y` keybinding.
- **Settings UI args refactor**: `showSettings()` and `notifyApplied()` now take `SettingsGetters` + `SettingsSetters` objects instead of 14/11 positional args.
- **1619 tests** across **90 test files**. Typecheck ✅, lint ✅.

## Showcase

![Dashboard Preview](docs/images/showcase_dashboard.gif)

The project includes a full showcase pipeline that generates high-quality terminal recordings:

| Pipeline | Command | Output |
|---|---|---|
| **Full pipeline** | `npm run showcase` | All assets (C→A→B→T→D) |
| **Tmux recording** | `npm run showcase:tmux` | `showcase_tmux.gif` + `.mp4` |
| **CI-safe assets** | `npm run showcase:ci` | Programmatic GIFs (no tmux needed) |
| **Live capture** | `npm run showcase:live` | `showcase_live.gif` |
| **Remotion hero** | `npm run showcase:remotion` | `dashboard_preview_remotion.mp4` |
| **VHS tape** | `npm run showcase:vhs` | `showcase_vhs.gif` |

All showcase assets live in `docs/images/`.

## Installation

```bash
npm install @onlinechefgroep/pi-agent-orchestrator
```

Requires compatible Pi packages (`@earendil-works/pi-coding-agent` etc.).

## Quick Start

```bash
# Run the full showcase
npm run showcase

# Or specific pipelines
npm run showcase:tmux
npm run showcase:ci
```

See the `docs/` folder for architecture, custom agent examples, handoff workflows and compression details.

## Development

```bash
npm install
npm run setup:hooks   # git hooks (opt-in)
npm test              # 1619 tests across 90 test files
npm run lint:fix
npm run typecheck
npm run bench:all     # 61 performance benchmarks
```

## Chain of Agents

Three canonical patterns for multi-agent workflows:

1. **Research → Write → Review** — Explore researches codebase, general-purpose implements, Analysis reviews the result.
2. **Test → Fix → Verify** — Analysis finds failures, general-purpose fixes, Explore verifies no regressions.
3. **Multi-perspective Analysis** — 3 parallel Explore agents analyze different subsystems, synthesizer merges findings.

## License

MIT © OnlineChefGroep
