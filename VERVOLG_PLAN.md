# VERVOLG_PLAN - Living Roadmap

> This document tracks ongoing priorities and improvement items for `@onlinechefgroep/pi-subagents`. Items are linked to GitHub Issues where possible for traceability.

---

## Priority Levels

- **P0** - Critical security or blocking issues
- **P1** - High priority, affects core functionality
- **P2** - Medium priority, quality of life improvements
- **P3** - Low priority, nice-to-have features
- **P4** - Future considerations, research items

---

## Completed Items ✅

- [x] **fix: correct depth-tracking in safeJsonParse (handoff.ts)** - Renamed MAX_JSON_DEPTH to MAX_JSON_KEYS for clarity, as the implementation counts total keys not nesting depth
- [x] **docs: complete module table + batch/nudge state notes in architecture.md** - Added missing UI modules and documented batch/nudge state machine with state diagram
- [x] **chore: restore VERVOLG_PLAN.md as living document** - Created this file and unignored from .gitignore

---

## Active Priorities (P0-P1)

### P0: Security Hardening

- [ ] **fix: harden ScheduleStore temp-file handling on Windows (atomic rename)**
  - **Issue**: Race conditions in temp-directory handling on Windows cause test flakiness
  - **Location**: `src/schedule-store.ts`
  - **Approach**: Add os.tmpdir() fallback with atomic write operations (fs.writeFileSync → tmp file, then fs.renameSync)
  - **Benefit**: Makes store crash-proof on abrupt process termination, fixes Windows CI flakiness
  - **Related**: test/schedule.test.ts marked continue-on-error on Windows

### P1: Architecture Improvements

- [ ] **refactor: extract BatchOrchestrator from index.ts**
  - **Issue**: `src/index.ts` is a god-module (1370 lines) with batch/nudge state machine spread over ~200 lines
  - **Location**: `src/index.ts` (currentBatchAgents, batchFinalizeTimer, pendingNudges, GroupJoinManager, SwarmCoordinator)
  - **Approach**: Create `BatchOrchestrator` class that owns batch state and finalizeBatch logic
  - **Benefit**: Makes state machine testable in isolation, reduces index.ts complexity
  - **Related**: Currently only tested indirectly via integration tests

---

## Medium Priority (P2)

### Documentation

- [ ] **docs: expand api-reference.md with cross-extension RPC contract**
  - **Issue**: globalThis[Symbol.for("pi-subagents:...")] used for cross-extension discovery is undocumented
  - **Location**: `src/cross-extension-rpc.ts`, telemetry registry
  - **Approach**: Document which Symbols exist, which events are emitted, protocol version expectations
  - **Benefit**: Makes extension a better platform citizen for ecosystem integrations

### Features

- [ ] **feat: add 4-5 canonical .pi/agents/ examples**
  - **Issue**: Low discoverability of unique capabilities
  - **Approach**: Create example agents demonstrating:
    - Handoff chains
    - Adversarial validators
    - Scheduled explorer
    - Worktree-isolated editor
  - **Benefit**: Dramatically increases discoverability of extension capabilities
  - **Location**: `.pi/agents/` directory

- [ ] **feat: handoff protocol v2 — optional typed artifacts**
  - **Approach**: Add optional typed artifacts to AgentHandoff interface (files: string[], artifacts: { type, path }[])
  - **Benefit**: Enables richer multi-agent workflows, backward-compatible via extra field
  - **Location**: `src/handoff.ts`

- [ ] **feat: /agents tree command**
  - **Approach**: Render full parent→child execution graph with token/turn counts (exportable as Mermaid/JSON)
  - **Benefit**: Enormous value for complex orchestrations
  - **Location**: `src/output-handler.ts`

---

## Low Priority (P3-P4)

### P3: Quality of Life

- [ ] **feat: dry-run mode**
  - **Approach**: Add `estimate_only: true` flag on Agent tool to estimate token usage before launch
  - **Benefit**: Useful for budget-conscious orchestrating

- [ ] **feat: typed public API surface**
  - **Approach**: Formalize cross-extension contracts behind Symbols and events in documented interface
  - **Benefit**: Makes extension a better platform for ecosystem integration

### P4: Future Considerations

- [ ] **research: session-wide resource limits**
  - **Context**: Per-agent limits exist, but no session-wide spawn/turn/memory limits
  - **Benefit**: Prevent resource exhaustion attacks
  - **Location**: `src/agent-runner.ts`

- [ ] **research: structured logging**
  - **Context**: Current console.log lacks configurable log levels
  - **Benefit**: Better debugging, sensitive info protection
  - **Location**: Multiple files

---

## Backlog Items from Security Audit Verification

> Note: The SECURITY_AUDIT_VERIFICATION_2026-05-23.md document references fabricated CVE numbers. The following items represent real security work based on actual codebase concerns:

- [ ] **validate custom agent configs** - Add validation to prevent override of built-in agents with wildcard tools
- [ ] **rate limit RPC endpoints** - Add per-extension rate limiting (10 spawns/minute already implemented, verify)
- [ ] **sanitize validator inputs** - Remove prompt injection patterns from validator criteria
- [ ] **schedule input bounds** - Add MIN_INTERVAL (60s), MAX_SCHEDULES (100), MAX_PROMPT_SIZE (50KB) - already implemented, verify
- [ ] **validate tool names** - Check against known tool set to catch typos/malicious names

---

## Tracking

- **Last Updated**: 2026-05-26
- **Version**: v0.9.2
- **Next Review**: After P0/P1 items completed
