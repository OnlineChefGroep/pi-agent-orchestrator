# @onlinechefgroep/pi-agent-orchestrator

> Multi-agent orchestrator for Pi coding agents — sub-agents, handoffs, prompt compression, scheduling, and an interactive TUI dashboard.

[![npm version](https://img.shields.io/npm/v/@onlinechefgroep/pi-agent-orchestrator)](https://www.npmjs.com/package/@onlinechefgroep/pi-agent-orchestrator)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions)
[![Tests](https://img.shields.io/badge/tests-1667%20passed-brightgreen)](https://github.com/OnlineChefGroep/pi-agent-orchestrator)

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

## Opt-in debug capture

For evals and post-mortem debugging, set `debugCapture: true` in `.pi/subagents.json` and the extension writes a strictly-local, append-only folder of agent lifecycle events, error stacks, schedule firings, cross-extension RPC audit entries, and per-agent metrics to `<cwd>/.pi/subagent-debug` + `<agent-dir>/subagent-debug` (both paths overridable via `debugCapturePaths`). **OFF BY DEFAULT.** Per-file **25 MiB tail-aware rotation** keeps disk usage bounded while preserving the most recent activity; rotation is atomic via temp+rename so a crash mid-rotation cannot leave a half-truncated file. The feature is **best-effort** — a capture failure never breaks the agent runtime, dashboard, or scheduler. **PII warning:** captured content includes full agent prompts, error stacks with absolute source paths, and tool arguments that frequently contain pasted-from-clipboard secrets, API tokens, or session-scoped credentials — enable only on workloads where you trust the local filesystem with the captured contents. Full schema, capture folder layout, rotation + atomicity guarantees, and PII implications are documented in the [API Reference → Debug Capture](docs/api-reference.md#debug-capture) section.

## What's new in v0.16.0

- **CHEF-100 Workspace Context RFC**: Introduced Phase 1 of the dual-read context adapter (`buildEnvFromContext`), covering 5 distinct environment scenarios.
- **Overdrive Pattern Catalogue**: Added reusable linter rules (P3, P4, P5) for performance optimization audits.
- **`agent-runner` Compaction Hook**: Fixed the `onCompaction` hook in `agent-runner`.
- **Overdrive False Positive Removal**: Defeated the Overdrive P4 detector false positive through helper extraction in environment resolving.
- **1694 tests** across **95 test files**. Typecheck ✅, lint ✅.

## Showcase

![Dashboard Preview](docs/images/dashboard_preview.svg)

Rendered from the extension's actual dashboard renderers via `npm run screenshots` (real terminal output, not a mockup).

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
npm test              # 1694 tests across 95 test files
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
