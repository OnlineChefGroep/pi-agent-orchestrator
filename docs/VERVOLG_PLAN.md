# Vervolg Plan — @onlinechefgroep/pi-agent-orchestrator

> Living roadmap for the pi-agent-orchestrator extension. Last updated: 2026-07-02 (v0.16.0).

---

## Status Overview

| Metric | Value |
|---|---|
| **Version** | 0.16.0 |
| **Tests** | 1694 passing, 95 test files |
| **Typecheck** | ✅ Pass |
| **Lint** | ✅ Pass (Biome) |
| **Benchmarks** | ✅ All passing (61/61 under threshold) |
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

- [x] **Public typed API surface** — Formalize cross-extension contracts — _[#137](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/137) closed on `main` (commit `a8de70a5`); `src/public-api.ts` exposes `SubagentsPublicApi` + `SubagentManagerHandle` + `TYPED_HOOK_PAYLOAD_MAP`_
- [x] **Schedule locking hardening** — `proper-lockfile` is in use (CVE-010 fix, merged); see `src/schedule-store.ts` (`withLock`, `removeLegacyFileLock`) and tests in `test/schedule-store.test.ts` (legacy lock recovery, no-deadlock-after-release)
- [x] **Windows CI reliability** — Schedule tests no longer race on `rmSync` — _[#138](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/138) closed on `main`; `maxRetries: 5, retryDelay: 50` on all 4 schedule test cleanup paths + bumped e2e timings for Windows headroom_
- [x] **Example-agent expansion** — Validator chain reviewer published — _[#139](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/139) closed on `main`; `examples/agents/validator-chain-reviewer.md` + `parseValidators` frontmatter wiring in `src/custom-agents.ts`_
- [x] **Manager symbol hoist** — `pi-subagents:manager` exposed on the typed public surface — _[#140](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/140) closed on `main`; `SubagentManagerHandle` + 200-char description cap + sanitized record_
- [x] **CI lowest-peer install version** — _[#142](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/142) closed on `main`; lowest-peer install pinned to `0.78.0` (the actual `package.json` floor) instead of the non-existent `0.72.0`_

---

## Completed P2 (v0.13.0 – v0.14.1)

- [x] **Handoff protocol v2** — Typed artifacts / file references in `AgentHandoff` — _released in v0.13.0_
- [x] **Orchestration mode dispatch** — Auto-heuristic single/swarm/crew dispatch with `src/orchestration-dispatch.ts` (~290 lines) + 35 unit tests + e2e integration tests — _released in v0.14.0_
- [x] **Execution tree visualization** — `/agents tree` command with Mermaid/JSON/text export + dashboard `y` keybinding — _released in v0.14.0_
- [x] **Handoff parse perf** — `safeJsonParse` skip `truncateStrings` tree walk when no strings exceed limit (10x speedup) — _released in v0.14.0_
- [x] **Tracing master switch** — `tracingEnabled` setting + OTel no-op span short-circuit — _released in v0.14.1_
- [x] **Settings UI refactor** — `SettingsGetters`/`SettingsSetters` objects replace 14/11-positional-arg spirals — _released in v0.14.1_
- [x] **Dispatch-decision histogram** — FIFO ring buffer + `/agents → Health check` section auditing auto-heuristic decisions — _released in v0.14.1_
- [x] **Per-agent correlation ids** — 8-hex UUID prefix, attached as OTel `correlation.id`, stable across `resumeAgent` — _released in v0.14.1_
- [x] **Health check command** — `/agents → Health check` TUI overlay snapshotting full runtime — _released in v0.14.1_
- [x] **Agent templates registry** — `src/agent-templates.ts` + `/agents templates` command: list, install, update, remove versioned templates from `.agents/templates/` — _released in v0.14.1_
- [x] **Agentic loop spec** — `docs/agentic-loop-spec.md` (23 sections, 1114 lines) formalizing the fully autonomous agent loop: trigger → dispatch → spawn → batch orchestration → execute → validate → handoff → repeat, plus swarm coordination deep dive, groups vs swarms, worktree isolation, agent state machine, mid-run steering, execution tree, TUI dashboard observer pattern, anti-patterns catalog, and testing strategy — _published 2026-06-18, expanded 2026-06-19_

---

## Pending (P2)

- [ ] **Cost estimation mode** — Dry-run token estimate before launching expensive trees
- [ ] **Dashboard robustness** — Refresh consistency, fallback rendering, graceful degradation across terminal capabilities

---

## Future Exploration (P3)

- [ ] **OpenTelemetry span export** — Full agent lifecycle tracing to external backends
- [ ] **Validator composition** — Multiple validators with voting/chaining
- [ ] **Steer from widget** — Rich live conversation controls in TUI — _partially tracked in [#1](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/1) (thinking-level UI)_
- [ ] **Per-agent persistent memory UI** — Inspection and management commands
- [ ] **Structured JSON logging** — Machine-parseable log output with correlation ids
- [ ] **Prometheus metrics export** — External monitoring of autonomous agent loop

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
