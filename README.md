# @onlinechefgroep/pi-agent-orchestrator

> Multi-agent orchestrator for Pi coding agents — sub-agents, handoffs, prompt compression, and clean workflows.

[![npm version](https://img.shields.io/npm/v/@onlinechefgroep/pi-agent-orchestrator)](https://www.npmjs.com/package/@onlinechefgroep/pi-agent-orchestrator)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions)

A Pi extension that adds powerful orchestration capabilities: autonomous sub-agents, structured handoffs, 3-tier prompt compression for token control, custom agent definitions, and polished showcase tooling.

## Features

- **Prompt Compression** — `minimal` / `balanced` / `aggressive` levels with global default + per-agent overrides. Dramatically reduces token usage while keeping essential context.
- **Sub-agent System** — Spawn specialized agents (Explore, Plan, Analysis, custom) with intelligent coordination.
- **Handoff Protocol** — Clean JSON-based handoff system between agents.
- **Custom Agents** — Define via simple frontmatter in `.md` files (supports `prompt_compression`, `handoff`, `enabled`).
- **Settings & TUI** — Full settings UI including live compression level switching.
- **Showcase Pipelines** — tmux recording, programmatic, Remotion and VHS pipelines for high-quality demos.

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
npm run setup:hooks   # git hooks
npm test
npm run lint:fix
```

## License

MIT © OnlineChefGroep
