# Vervolg Plan — @onlinechefgroep/pi-agent-orchestrator

> Living roadmap for the pi-agent-orchestrator extension. Last updated: 2026-06-04 (v0.10.3).

---

## Status Overview

| Metric | Value |
|---|---|
| **Version** | 0.10.3 |
| **Tests** | 795 passing, 46 test files |
| **Typecheck** | ✅ Pass |
| **Lint** | ✅ Pass (Biome) |
| **Branch** | `main` |

---

## Completed (P0 — Done)

- [x] **Core agent orchestration** — spawn, run, handoff, validate
- [x] **Permission model** — parent→child restrictions, partition filtering, disallow floor
- [x] **Interactive TUI dashboard** — vim hotkeys, live telemetry, multi-select, bulk kill
- [x] **Swarm mode** — dynamic join/leave with real-time topology
- [x] **Scheduling engine** — cron/interval/one-shot with file-backed persistence
- [x] **Hook system** — 11 lifecycle events, 5s timeout, fail-open
- [x] **Cross-extension RPC** — authenticated mutations, rate limiting
- [x] **Deferred context** — 15-48% token savings on queued agents
- [x] **Dual-phase compaction** — per-agent memory limits (default keep 5 turns)
- [x] **Worktree isolation** — safe parallel file modifications
- [x] **Custom agent loader** — `.pi/agents/*.md` frontmatter profiles
- [x] **Settings persistence** — global + project-local JSON overrides
- [x] **Batch orchestrator** — smart/group/swarm finalization extracted from index.ts
- [x] **Structured logger** — `src/logger.ts` with warn/info/debug levels
- [x] **Tool context extraction** — `tools/agent.ts`, `tools/get-result.ts`, `tools/steer.ts`
- [x] **Commands extraction** — `commands/agents.ts`, `commands/hooks.ts`

---

## In Progress / Near-Term (P1)

- [ ] **Public typed API surface** — Formalize cross-extension contracts (currently behind Symbols + events)
- [ ] **Schedule locking hardening** — `proper-lockfile` is now in use; monitor for edge cases
- [ ] **Windows CI reliability** — Schedule tests are blocking again; watch for regressions
- [ ] **Example-agent expansion** — Keep `examples/agents/` current as new patterns stabilize

---

## Medium-Term (P2)

- [ ] **Handoff protocol v2** — Typed artifacts / file references in `AgentHandoff`
- [ ] **Execution tree visualization** — `/agents tree` command with Mermaid/JSON/text export
- [ ] **Agent templates registry** — Versioned, updatable templates beyond raw `.md` files
- [ ] **Cost estimation mode** — Dry-run token estimate before launching expensive trees
- [ ] **Cinematic sidecar robustness** — Version handshake, auto-restart, graceful degradation

---

## Future Exploration (P3)

- [ ] **OpenTelemetry span export** — Full agent lifecycle tracing
- [ ] **Validator composition** — Multiple validators with voting/chaining
- [ ] **Steer from widget** — Rich live conversation controls in TUI
- [ ] **Per-agent persistent memory UI** — Inspection and management commands

---

## Out of Scope (P4)

- Pi host platform changes
- Grok skills system
- Azure / cloud-specific integrations
- General-purpose agent frameworks outside pi ecosystem

---

## How to Update This Plan

1. Edit this file directly on `main`
2. Use Conventional Commits: `docs: update VERVOLG_PLAN.md`
3. Move items between tiers as priorities shift
4. Link to GitHub issues when items become scheduled work

---

*This document is intended to be a living reference. Future PRs should reference or update it.*
