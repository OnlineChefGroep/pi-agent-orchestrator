# VERVOLG_PLAN - Living Roadmap

> This document tracks ongoing priorities and improvement items for `@onlinechefgroep/pi-agent-orchestrator`. Items are linked to GitHub Issues where possible for traceability.

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
- [x] **feat: add session-wide resource limits** - Added per-session spawn and cumulative-turn caps with settings UI and persisted settings
- [x] **fix: replace PID lock with atomic lock directory** - ScheduleStore now uses atomic lock-directory acquisition with stale-lock recovery
- [x] **feat: handoff protocol v2 typed artifacts** - Handoffs now accept typed file, branch, URL, and note artifacts while staying backward-compatible
- [x] **feat: add Agent estimate-only mode** - The Agent tool can return launch estimates without spawning work
- [x] **chore: install Graphify project support** - Added project Graphify skill/hook configuration and kept generated graph output local
- [x] **chore: rebrand for private 0.10.0 release** - Renamed the package surface to `@onlinechefgroep/pi-agent-orchestrator`

---

## Active Priorities (P0-P1)

### P1: Security & Reliability

- [ ] **release: add GitHub Packages provenance workflow**
  - **Context**: 0.10.0 can be released manually, but repeatable releases need a workflow
  - **Benefit**: Consistent private package publishing, tags, release notes, and provenance
  - **Location**: `.github/workflows/`

- [ ] **test: add concurrency stress coverage for ScheduleStore locks**
  - **Context**: Lock-directory acquisition is covered at unit level; concurrent writer stress should be exercised separately
  - **Benefit**: Better confidence on Windows and networked workspaces
  - **Location**: `test/schedule-store.test.ts`

---

## Medium Priority (P2)

### Documentation

### Features

- [ ] **feat: /agents tree command**
  - **Approach**: Wire `src/agent-tree.ts` into `/agents` command/menu output with Mermaid/JSON export
  - **Benefit**: Enormous value for complex orchestrations
  - **Location**: `src/output-handler.ts`, `src/agent-tree.ts`

- [ ] **docs: document 0.10.0 migration from pi-subagents**
  - **Approach**: Add a short migration note covering package rename, repo rename, and compatibility namespace stability
  - **Benefit**: Existing private users can upgrade without guessing what changed
  - **Location**: `README.md`, `docs/`

---

## Low Priority (P3-P4)

### P3: Quality of Life

- [ ] **feat: typed public API surface**
  - **Approach**: Formalize cross-extension contracts behind Symbols and events in documented interface
  - **Benefit**: Makes extension a better platform for ecosystem integration

### P4: Future Considerations

- [ ] **research: structured logging adoption**
  - **Context**: A small logger exists, but most legacy warning paths still use console warnings
  - **Benefit**: Better debugging, sensitive info protection, and quieter host output
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

- **Last Updated**: 2026-05-27
- **Version**: v0.10.0
- **Next Review**: After private 0.10.0 release validation
