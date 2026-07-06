# @onlinechefgroep/pi-agent-orchestrator

> Multi-agent orchestrator for Pi coding agents -- sub-agents, handoffs, prompt compression, scheduling, and an interactive TUI dashboard.

[![npm version](https://img.shields.io/npm/v/@onlinechefgroep/pi-agent-orchestrator)](https://www.npmjs.com/package/@onlinechefgroep/pi-agent-orchestrator)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions)

## What is this?

A Pi extension that adds autonomous sub-agent orchestration to Pi coding agents. Spawn specialized agents (Explore, Plan, Analysis, general-purpose, or custom), chain them via structured handoffs, schedule recurring jobs, and coordinate multi-agent swarms -- all from a vim-style interactive TUI dashboard.

## Dashboard Preview

![Dashboard Preview](docs/images/dashboard_preview.svg)

## Installation

**Prerequisites:** A working Pi host environment with `@earendil-works/pi-coding-agent`.

Install the extension globally into your Pi environment:

```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator
```

Or install it locally for the current project only:

```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator -l
```

## Quick Start

After installation, start a Pi session and type `/agents` to open the dashboard.

- Press `t` for the resource top view, `?` for the help overlay, `z` for daemon schedules.
- Navigate the agent list with `j`/`k` or the arrow keys.
- Create a custom agent by creating `.pi/agents/my-agent.md` with frontmatter (see [Custom Agents](docs/custom-agents.md) for details).

## Keyboard Cheatsheet

| Key | Action |
|-----|--------|
| `j`/`k` or `Up`/`Down` | Navigate agent list |
| `t` | Toggle top/resource view |
| `z` | Toggle schedule view |
| `?` | Help overlay |
| `/perf` | Performance metrics |
| `Shift+K` | Kill selected agent(s) |
| `Space` | Multi-select |
| `g`/`G` | Jump to first/last |
| `Esc`/`q` | Close overlay or dashboard |

## Features

- **Interactive TUI Dashboard** -- 6 views: agent list, resource top, daemon schedules, performance metrics, help overlay, and settings.
- **Sub-agent System** -- Spawn specialized agents (Explore, Plan, Analysis, general-purpose, custom) with permission inheritance and partition filtering.
- **Prompt Compression** -- Three tiers (minimal, balanced, aggressive) with global defaults and per-agent overrides to reduce token usage.
- **Cron Scheduling** -- Schedule recurring autonomous agent jobs with a persistent store and daemon schedule view.
- **Handoff Protocol** -- JSON-based handoff system enabling chain-of-agents workflows.
- **Custom Agents** -- Define agents via Markdown frontmatter in `.pi/agents/*.md` files.
- **Swarm Coordination** -- Dynamic multi-agent swarm join/leave with real-time dashboard status.
- **Cross-extension RPC** -- Peer extension integration for composable tool chains.

## Custom Agents Example

Create `.pi/agents/typescript-reviewer.md`:

```markdown
---
display_name: "TypeScript Reviewer"
description: "Read-only reviewer for TypeScript changes"
tools: read, grep, find, ls, bash
disallowed_tools: write, edit
extensions: false
skills: true
max_turns: 20
prompt_mode: replace
---
You are a senior TypeScript code reviewer.

Focus on type safety, error handling, async control flow, and maintainability.
Report findings with severity, exact file paths, and actionable fixes.
Never modify files.
```

See [Custom Agents](docs/custom-agents.md) for the full authoring guide.

## Development

```bash
npm install
npm run setup:hooks   # git hooks (opt-in)
npm test
npm run lint:fix
npm run typecheck
```

## License

MIT (c) OnlineChefGroep

## Operations

For incident response procedures, deployment health checks, and operational runbooks, see [docs/runbooks.md](docs/runbooks.md).
