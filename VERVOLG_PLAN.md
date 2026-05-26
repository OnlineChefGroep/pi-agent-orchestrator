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
- [x] **refactor: extract BatchOrchestrator from index.ts** - Moved smart/group/swarm batch finalization into `src/batch-orchestrator.ts`
- [x] **fix: harden ScheduleStore temp-file handling on Windows** - Atomic writes now use a same-directory temp file before rename
- [x] **fix: require host-backed RPC auth when available** - `spawn` and `stop` now use `authProvider(requestId)` and ignore spoofable payload identity
- [x] **fix: enforce schedule input bounds** - `MIN_INTERVAL`, `MAX_SCHEDULES`, and `MAX_PROMPT_SIZE` are enforced in `SubagentScheduler`
- [x] **fix: validate custom agent configs** - Unsafe names, wildcard built-in overrides, overlong prompts, and excessive tool lists disable invalid agents
- [x] **fix: sanitize validator inputs** - Validator prompt inputs are bounded and stripped of control characters
- [x] **chore: make Windows tests blocking again** - Removed the schedule-flakiness `continue-on-error` exception from CI
- [x] **docs: expand api-reference.md with cross-extension RPC contract** - Documented authenticated RPC behavior, legacy mode, rate limits, and request/reply shapes
- [x] **feat: add 5 canonical custom-agent examples** - Added valid `.pi/agents` examples under `examples/agents/`
- [x] **docs: align custom-agent guide with loader format** - Documented snake_case/CSV frontmatter and body-as-system-prompt behavior

---

## Active Priorities (P0-P1)

### P1: Security & Reliability

- [ ] **research: session-wide resource limits**
  - **Context**: Per-agent limits exist, but no session-wide spawn/turn/memory limits
  - **Benefit**: Prevent resource exhaustion from recursive or cross-extension orchestration
  - **Location**: `src/agent-runner.ts`, `src/agent-manager.ts`

- [ ] **fix: replace PID lock with stronger file lock**
  - **Context**: `ScheduleStore` still uses a PID lock file with stale-lock recovery
  - **Benefit**: Removes PID-reuse edge cases and makes multi-process schedule writes more robust
  - **Location**: `src/schedule-store.ts`

---

## Medium Priority (P2)

### Documentation

### Features

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

- [ ] **research: structured logging**
  - **Context**: Current console.log lacks configurable log levels
  - **Benefit**: Better debugging, sensitive info protection
  - **Location**: Multiple files

---

## Backlog Items from Security Audit Verification

> Note: The SECURITY_AUDIT_VERIFICATION_2026-05-23.md document references fabricated CVE numbers. The following items represent real security work based on actual codebase concerns:

- [x] **validate custom agent configs** - Validation disables unsafe configs before they can run
- [x] **rate limit RPC endpoints** - Mutating RPCs are rate-limited per authenticated extension and operation
- [x] **sanitize validator inputs** - Validator inputs are bounded and sanitized
- [x] **schedule input bounds** - `MIN_INTERVAL`, `MAX_SCHEDULES`, and `MAX_PROMPT_SIZE` are enforced
- [ ] **validate tool names** - Unknown custom-agent tool names currently emit telemetry but are still passed through for compatibility

---

## Tracking

- **Last Updated**: 2026-05-26
- **Version**: v0.9.5
- **Next Review**: After P1 items completed
