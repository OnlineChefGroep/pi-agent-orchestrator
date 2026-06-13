<div align="center">

![Pi Agent Orchestrator Banner](docs/images/orchestrator_banner.png)

# 🤖 @onlinechefgroep/pi-agent-orchestrator

**Autonomous sub-agents + cinematic TUI dashboard + swarm coordination for the Pi coding agent**

[![CI](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.10.2-blue)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

Bring Claude Code-style autonomous sub-agents to Pi. Spawn specialized agents, enforce budgets, chain them with structured handoffs, swarm agents together, and watch a rich interactive TUI dashboard render their progress in real time.

**Repository:** [`OnlineChefGroep/pi-agent-orchestrator`](https://github.com/OnlineChefGroep/pi-agent-orchestrator)

---

## Install

```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator
```

Requires Node.js >= 22.19 and pi >= 0.70.5.

---

## Features

| Feature | Description |
|---------|-------------|
| **Autonomous sub-agents** | Spawn specialized agents (Explore, Plan, Analysis) that run independently and return structured results |
| **Rich interactive dashboard** | Vim-style hotkeys (`j/k/Enter/K/?`), multi-select, bulk kill, permissions view, spinners |
| **Swarm mode** | Live SwarmCoordinator with dynamic join/leave, collaborative multi-agent swarms, `w` hotkey |
| **Task budget & depth limiting** | Prevent runaway agent trees with configurable `levelLimit` (default 5) and `taskBudget` |
| **Adversarial validators** | Post-completion `Promise.all` validation with pass/fail indicators |
| **Structured handoff protocol** | JSON machine-parseable chain-of-agents with graceful degrade on malformed data |
| **Hook system** | 11 lifecycle event types (spawn, complete, error, etc.) with 5s timeout, fail-open |
| **Permission inheritance** | Directional parent→child tool restriction — a read-only parent forces a read-only child |
| **Partitioned agent state** | Isolated tool/skill subsets per partition — no cross-contamination |
| **Deferred context engine** | Build context at session boundary, saving 15-48% tokens on queued agents |
| **Dual-phase compaction** | Prune old tool outputs + per-agent memory limits (default keep 5 turns) |
| **Scheduling** | Cron/interval/one-shot recurring agent jobs with file-backed persistence |
| **Context-mode sandbox** | Optional `ctx_*` sandbox tool injection via `@onlinechef/context-mode` peer dependency |
| **Cinematic TUI dashboard** | Optional rich visual sidecar via `@onlinechefgroep/pi-subagents-tui` |

---

## Built-in Agent Types

| Type | Description | Tools | Context-mode |
|------|-------------|-------|-------------|
| `general-purpose` | All-rounder for complex multi-step tasks | all built-in | opt-in |
| `Explore` | Fast read-only codebase exploration | read, grep | no |
| `Plan` | Software architect and implementation planner | read, grep | no |
| `Analysis` | Data analysis with sandboxed code execution | read, grep | yes |

---

## Custom Agents

Create `.pi/agents/<name>.md` in your project (or globally in `~/.pi/agent/agents/`). Project-level agents override global ones.

### Example: `.pi/agents/security-auditor.md`

```markdown
---
display_name: "Security Auditor"
description: "Audit code for common security issues"
tools: read, grep, find
model: anthropic/claude-sonnet-4-5-20250901
extensions: false
skills: false
max_turns: 20
---
You are a security auditor. Review the provided code for:
- SQL injection
- XSS vulnerabilities
- Path traversal
- Hardcoded secrets

Output findings as a markdown list with severity (Critical / High / Medium / Low) and suggested fix.
```

### Frontmatter reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `display_name` | string | agent name | Human-readable name |
| `description` | string | agent name | Short description shown in UI |
| `tools` | CSV or `none` | all built-in | Allowed tools |
| `disallowed_tools` | CSV | — | Explicitly forbidden tools |
| `extensions` | `true` / `false` / CSV | `true` | Extension access |
| `skills` | `true` / `false` / CSV | `true` | Skill access |
| `model` | string | (host default) | LLM model override |
| `thinking` | string | — | Thinking level hint |
| `max_turns` | number | — | Turn limit |
| `prompt_mode` | `"replace"` / `"append"` | `"replace"` | How system prompt is applied |
| `inherit_context` | boolean | — | Inherit parent conversation context |
| `run_in_background` | boolean | — | Run without blocking parent |
| `isolated` | boolean | — | Run in isolated context |
| `memory` | `"user"` / `"project"` / `"local"` | — | Memory scope |
| `isolation` | `"worktree"` | — | Worktree isolation |
| `enabled` | boolean | `true` | Enable/disable this agent |

---

## Cinematic Dashboard (TUI Sidecar)

The cinematic dashboard is an **optional** Go Bubble Tea application that renders agent status in real time with animated backgrounds.

![Cinematic Dashboard Preview](docs/images/dashboard_preview.png)

### Installation

The TUI sidecar is now a separate package: **[@onlinechefgroep/pi-subagents-tui](https://github.com/OnlineChefGroep/pi-subagents-tui)**

To enable cinematic mode:

1. Install the TUI package: `pi install npm:@onlinechefgroep/pi-subagents-tui`
2. Set `uiStyle` to `"cinematic"` in subagents settings (via `/agents` → Settings)

Without the TUI package installed, cinematic mode will gracefully fall back to the standard TUI display.

### Manual Build

If you prefer to build from source:

```bash
git clone https://github.com/OnlineChefGroep/pi-subagents-tui.git
cd pi-subagents-tui
go build -o cinematic-tui .
```

---

## Configuration

Settings are managed via `/agents` → Settings or by editing `.pi/subagents.json` (project) or `~/.pi/agent/subagents.json` (global defaults):

| Setting | Default | Description |
|---------|---------|-------------|
| `maxConcurrent` | `3` | Maximum parallel agents |
| `defaultMaxTurns` | unlimited (`0`) | Default turn limit per agent (`0` = unlimited) |
| `graceTurns` | `3` | Extra turns after wrap-up steer before forced stop |
| `defaultJoinMode` | `async` | Default join mode: `async`, `group`, `smart`, or `swarm` |
| `orchestrationMode` | `auto` | Coordination mode: `auto`, `single`, `swarm`, or `crew` |
| `schedulingEnabled` | `true` | Enable cron/interval scheduled agent jobs |
| `animationStyle` | `braille` | Dashboard spinner: `braille`, `dots`, `lines`, `classic`, `none` |
| `uiStyle` | `premium` | UI theme: `premium`, `retro`, `plain`, or `cinematic` |
| `cinematicEnabled` | `false` | Enable Go TUI sidecar (requires `uiStyle: "cinematic"`) |
| `showActivityStream` | `true` | Show live tool-call activity in the dashboard |
| `showTokenUsage` | `true` | Show token usage and context fill percentage |
| `showTurnProgress` | `true` | Show turn progress for running agents |
| `dashboardRefreshInterval` | `750` | Dashboard refresh interval in ms (100–60000) |
| `maxAgentsPerSession` | unlimited | Hard cap on agents spawned in one pi session |
| `maxTotalTurnsPerSession` | unlimited | Hard cap on cumulative agent turns per session |
| `sessionMaxSpawns` | unlimited | Guardrail for total spawns in a session |
| `sessionMaxTurns` | unlimited | Guardrail for cumulative turns in a session |

Per-invocation parameters on the `Agent` tool (not persisted settings): `levelLimit` (default 5), `taskBudget`, `join_mode`, `model`, `max_turns`, and others — see [docs/api-reference.md](docs/api-reference.md).

---

## Architecture

![Pi Agent Orchestrator Architecture](docs/images/orchestrator_architecture.png)

```
pi host
  └── pi-agent-orchestrator extension
        ├── AgentRegistry (defaults + custom .md agents)
        ├── AgentDashboard (live TUI with vim hotkeys, swarm view)
        ├── AgentRunner (spawn → execute → handoff → validate)
        ├── SwarmCoordinator (live join/leave, collaborative swarms)
        ├── ScheduleStore (file-backed persistence, PID-locked)
        ├── Hooks (lifecycle events)
        └── PartitionedState (isolated tool/skill subsets)

[Optional] pi-subagents-tui sidecar
        └── Go Bubble Tea cinematic dashboard
```

---

## Development

```bash
# Install dependencies
npm install

# Typecheck
npm run typecheck

# Run tests
npm test

# Lint
npm run lint
```

---

## Hotkeys (AgentDashboard)

| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | Steer selected agent |
| `K` | Kill selected agent |
| `v` | Visual mode (multi-select) |
| `p` | Toggle permissions view |
| `w` | Toggle swarm view |
| `?` | Show help overlay |
| `q` | Close dashboard / quit view |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Commands

| Command | Description |
|---------|-------------|
| `/agents` | Open the agent dashboard, settings, schedules, and conversation viewer |
| `/hooks` | Manage lifecycle hook handlers |

---

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting process and security model.

---

## License

MIT — [OnlineChefGroep](https://github.com/OnlineChefGroep)
