# // PI AGENT ORCHESTRATOR

![Brutalist UI Hero](docs/images/dashboard_preview.gif)


**AUTONOMOUS SUB-AGENTS. TUI DASHBOARD. SWARM COORDINATION.**

![Pi Agent Orchestrator Banner](docs/images/orchestrator_banner.png)

Bring autonomous sub-agents to Pi. Spawn specialized agents, enforce strict budgets, execute structured handoffs, and manage agent swarms. All monitored through a high-density, interactive TUI dashboard. 

**STATUS:** ACTIVE
**VERSION:** 0.11.0
**RUNTIME:** Node.js >= 22
**HOST:** pi >= 0.70.5
**LICENSE:** MIT

---

## // INSTALLATION

Execute the following command to install the extension into the Pi environment:

```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator
```

---

## // FEATURES AND SPECIFICATIONS

| Capability | Technical Description |
|---|---|
| **Autonomous Sub-agents** | Spawn specialized agents (Explore, Plan, Analysis) operating independently to return structured outputs. |
| **Interactive Dashboard** | High-density TUI accessible via `/agents top`. Vim-style hotkeys (`j/k/Enter/K/?`), virtual scrolling, multi-select, live resource stats, and activity heatmaps. |
| **Swarm Mode** | Live `SwarmCoordinator`. Dynamic join/leave operations. Collaborative multi-agent processing (`w` hotkey). |
| **Execution Budgets** | Strict depth limiting (`levelLimit`, default: 5). Bounded concurrent tasks via `taskBudget`. |
| **Adversarial Validation** | Post-completion `Promise.all` validation with deterministic pass/fail states. |
| **Structured Handoff** | Machine-parseable JSON chain-of-agents. Graceful degradation on malformed sequences. |
| **Hook System** | 11 lifecycle event types (spawn, complete, error). 5s execution timeout. Fail-open architecture. |
| **Permission Inheritance** | Directional parent→child tool restriction. Read-only parents yield strictly read-only children. |
| **Partitioned State** | Isolated tool/skill subsets per partition. Zero cross-contamination guarantees. |
| **Deferred Context** | Boundary-level context construction. Token efficiency yields 15-48% savings on queued operations. |
| **Dual-phase Compaction** | Aggressive pruning of legacy tool outputs. Per-agent memory limits (default retention: 5 turns). |
| **Scheduling Engine** | Cron/interval/one-shot jobs. File-backed persistence via `.pi/subagent-schedules/`. |
| **Context-mode Sandbox** | Optional `ctx_*` sandbox injection via `@onlinechef/context-mode` peer dependency. |
| **Cinematic TUI** | Optional visual sidecar via `@onlinechefgroep/pi-subagents-tui`. |

---

## // BUILT-IN AGENT TYPES

| Class | Function | Authorized Tools | Context-Mode |
|---|---|---|---|
| `general-purpose` | Universal execution for complex procedures | All built-in | Opt-in |
| `Explore` | High-speed read-only structural analysis | read, bash, grep, find, ls | No |
| `Plan` | Implementation planning and architectural design | read, bash, grep, find, ls | No |
| `Analysis` | Data processing with sandboxed execution | read, bash, grep, find, ls | Yes |

---

## // CUSTOM AGENT PROFILES

Define project-level overrides in `.pi/agents/<name>.md`. Global definitions reside in `~/.pi/agent/agents/`. Project definitions take strict precedence.

### Example Profile: `security-auditor.md`

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

### Frontmatter Schema

| Directive | Type | Default | Operational Definition |
|---|---|---|---|
| `display_name` | string | filename | Interface identification string |
| `description` | string | filename | Short telemetry description |
| `tools` | CSV / `none` | all | Authorized tool subset |
| `disallowed_tools` | CSV | null | Explicit tool denial list |
| `extensions` | bool / CSV | `true` | Extension access flag |
| `skills` | bool / CSV | `true` | Skill module access flag |
| `model` | string | host default | Model identifier override |
| `thinking` | string | null | Inference effort directive |
| `max_turns` | number | null | Hard execution turn limit |
| `prompt_mode` | `replace` / `append` | `replace` | System prompt integration strategy |
| `inherit_context` | boolean | null | Parent conversation context transmission |
| `run_in_background` | boolean | null | Non-blocking execution flag |
| `isolated` | boolean | null | Strict context isolation |
| `memory` | `user` / `project` / `local` | null | State persistence scope |
| `isolation` | `worktree` | null | Physical directory isolation |
| `enabled` | boolean | `true` | Profile activation state |

---

## // SHOWCASE (v0.11.0 TUI)

Four pipelines (programmatic, live asciinema, Remotion hero, VHS). See [docs/SHOWCASE.md](docs/SHOWCASE.md).

| View | Demo |
|------|------|
| **Dashboard** (swarms, running cards, `?` help) | ![Dashboard](docs/images/showcase_dashboard.gif) |
| **Top view** (`t` / `l` sort) | ![Top view](docs/images/showcase_top_view.gif) |
| **Agent widget** (heatmap) | ![Widget](docs/images/showcase_widget.gif) |
| **Live terminal** (asciinema capture) | ![Live](docs/images/showcase_live.gif) |
| **VHS** (install + demo tape) | ![VHS](docs/images/showcase_vhs.gif) |

**Hero video (Remotion when available, else programmatic):**

<video src="docs/images/dashboard_preview.mp4" controls width="100%"></video>

```bash
npm run showcase              # all four: C + A + B + D
npm run showcase:ci           # CI-safe only
SKIP_REMOTION=1 npm run showcase   # skip Remotion render
```

---

## // CINEMATIC DASHBOARD (TUI SIDECAR)

The cinematic dashboard provides real-time telemetry rendering via an independent Go Bubble Tea application. It features real-time resource utilization, agent status heatmaps, and smooth virtual scrolling.

![Cinematic Dashboard Preview](docs/images/dashboard_preview.gif)

### Sidecar Installation

Package identifier: `@onlinechefgroep/pi-subagents-tui`

1. Execute: `pi install npm:@onlinechefgroep/pi-subagents-tui`
2. Configure parameter: `subagents.uiStyle = "cinematic"`

Degrades gracefully to the standard terminal display if the sidecar is absent.

### Source Compilation

```bash
git clone https://github.com/OnlineChefGroep/pi-subagents-tui.git
cd pi-subagents-tui
go build -o cinematic-tui .
```

---

## // CONFIGURATION PARAMETERS

Manage via `pi settings` CLI or direct configuration injection.

| Parameter | Default | Function |
|---|---|---|
| `subagents.defaultMaxTurns` | `0` (unlimited) | Maximum turns per agent (`0` = unlimited) |
| `subagents.maxConcurrent` | `4` | Maximum concurrently running agents |
| `subagents.orchestrationMode` | `auto` | Execution topology: `auto`, `single`, `swarm`, `crew` |
| `subagents.dashboardRefreshInterval` | `750` | Dashboard refresh interval in ms (min 100, max 60000) |
| `subagents.maxAgentsPerSession` | — | Optional hard cap on total agents spawned per session |
| `subagents.maxTotalTurnsPerSession` | — | Optional hard cap on cumulative turns across the session |
| `subagents.graceTurns` | `5` | Wrap-up turns before forced termination |
| `subagents.defaultJoinMode` | `smart` | Agent join topology: `async`, `group`, `smart`, `swarm` |
| `subagents.animationStyle` | `"braille"` | Spinner style: `braille`, `dots`, `lines`, `classic`, `none` |
| `subagents.uiStyle` | `"premium"` | UI theme: `premium`, `retro`, `plain`, `cinematic` |
| `subagents.sessionMaxSpawns` | — | Guardrail: max agents spawned per session |
| `subagents.sessionMaxTurns` | — | Guardrail: max cumulative turns per session |
| `subagents.showActivityStream` | `true` | Show real-time activity stream in widget |
| `subagents.showTokenUsage` | `true` | Show token usage and context fill percentage |
| `subagents.showTurnProgress` | `true` | Show turn progress (current/max) for running agents |

---

## // SYSTEM ARCHITECTURE

![Pi Agent Orchestrator Architecture](docs/images/orchestrator_architecture.png)

```text
pi host
  └── pi-agent-orchestrator
        ├── AgentRegistry (defaults + filesystem overrides)
        ├── AgentDashboard (live telemetry, vim navigation)
        ├── AgentRunner (spawn → execute → handoff → validate)
        ├── SwarmCoordinator (cluster topology management)
        ├── ScheduleStore (file-backed persistence, proper-lockfile atomic locks)
        ├── Hooks (lifecycle events)
        └── PartitionedState (strict tool isolation boundaries)

[Optional] pi-subagents-tui sidecar
        └── Go Bubble Tea executable
```

---

## // DEVELOPMENT OPERATIONS

```bash
npm install     # Fetch dependencies
npm run typecheck # Static analysis
npm test        # Run verification suite
npm run lint    # Code style enforcement
```

---

## // HOTKEYS

| Key | Operation |
|---|---|
| `j` / `↓` | Cursor down |
| `k` / `↑` | Cursor up |
| `Enter` | Intervene / steer agent |
| `K` | Terminate process |
| `v` | Visual selection mode |
| `p` | Inspect permission matrix |
| `w` | Inspect swarm topology |
| `?` | Show overlay documentation |
| `q` | Exit interface |

---

## // CHAIN OF AGENTS

Compose multi-agent pipelines where one agent's structured output feeds the next. Each chain below lives in `.pi/agents/` as plain Markdown — no glue code, no orchestration scripts.

### Example 1 — Research → Write → Review

A three-step content pipeline: a read-only researcher hands off findings, a writer drafts the deliverable, and a reviewer validates the result.

**Step 1 — Researcher** (read-only, handoff: true):

```markdown
---
display_name: "Researcher"
description: "Read-only research producing structured handoff"
tools: read, grep, find
handoff: true
prompt_compression: balanced
---

Investigate the codebase and emit a structured handoff JSON with:
- "task": what needs to be done
- "files": affected file paths
- "approach": recommended implementation strategy
- "evidence": supporting code snippets

End your response with the handoff JSON as the LAST thing in your response.
```

**Step 2 — Writer** (write-enabled, inherits researcher's context):

```markdown
---
display_name: "Writer"
description: "Implements the changes from researcher's handoff"
tools: read, write, edit, bash
inherit_context: true
prompt_compression: minimal
---

You receive a structured handoff from a researcher. Implement the changes
described in the handoff's "task" field, following the "approach" strategy.
Use the "files" list to locate code. Validate your implementation compiles.
```

**Step 3 — Reviewer** (read-only, handoff: true):

```markdown
---
display_name: "Reviewer"
description: "Reviews implementation, produces sign-off handoff"
tools: read, grep, find
handoff: true
prompt_compression: minimal
---

Review the implementation produced by the Writer agent. Emit a structured
handoff with:
- "verdict": "approve" | "request_changes"
- "findings": issues found, if any
- "evidence": file paths and line numbers
- "nextSteps": remediation tasks for the Writer
```

**Spawn order:** `@Researcher investigate the auth middleware` → reviewer-style handoff → `@Writer` (receives handoff via context) → `@Reviewer`.

### Example 2 — Test → Fix → Verify (CI Repair Loop)

A bounded repair loop where the same fix attempts cycle until tests pass or the turn budget is exhausted. Compression levels matter here: tests need full context (minimal), the fix can be terse (balanced).

**Step 1 — Test Runner** (read-only, minimal compression for full diagnostic detail):

```markdown
---
display_name: "Test Runner"
description: "Runs the test suite, reports failures"
tools: read, bash
prompt_compression: minimal
---

Run `npm test` and parse the output. For each failing test, capture:
- test name and file path
- expected vs actual
- stack trace summary
- any related source files (use grep)

Return your findings as a regular assistant message. Do NOT attempt to fix.
```

**Step 2 — Fixer** (write-enabled, balanced compression for terse patching):

```markdown
---
display_name: "Fixer"
description: "Applies minimal patch based on test failures"
tools: read, write, edit, bash
inherit_context: true
prompt_compression: balanced
max_turns: 8
---

You receive a test failure report from Test Runner. Apply the smallest
change that makes the failing test pass. Re-run only the affected test
file to verify. Do not refactor unrelated code.
```

**Step 3 — Verifier** (read-only, balanced):

```markdown
---
display_name: "Verifier"
description: "Confirms the fix is correct, no regressions"
tools: read, bash
prompt_compression: balanced
---

Re-run the full test suite. Confirm:
1. Originally failing test now passes
2. No previously-passing test now fails

Report `pass` or `regression: <details>`.
```

The parent orchestrator runs the loop with a turn budget — typically 3-5 fix attempts before escalating.

### Example 3 — Multi-perspective Analysis (3 Parallel → Synthesizer)

Spawn three analysts with different perspectives in parallel, then synthesize their findings. This is the "swarm" pattern with a deterministic aggregation step.

**Analyst 1 — Performance** (read-only, aggressive compression for speed):

```markdown
---
display_name: "Performance Analyst"
description: "Analyzes performance characteristics"
tools: read, grep, find
handoff: true
prompt_compression: aggressive
---

Find performance hotspots: O(n²) loops, redundant I/O, blocking calls,
missing memoization. Return a structured handoff with "findings" array.
```

**Analyst 2 — Security** (read-only, minimal for thoroughness):

```markdown
---
display_name: "Security Analyst"
description: "Identifies security vulnerabilities"
tools: read, grep, find
handoff: true
prompt_compression: minimal
---

Find injection sinks (SQL, shell, eval), unvalidated input paths, auth
bypass opportunities, hardcoded secrets. Return a structured handoff.
```

**Analyst 3 — Maintainability** (read-only, balanced):

```markdown
---
display_name: "Maintainability Analyst"
description: "Evaluates code health"
tools: read, grep, find
handoff: true
prompt_compression: balanced
---

Find code smells: long functions, deep nesting, duplicated logic, missing
tests, undocumented public APIs. Return a structured handoff.
```

**Synthesizer** (write-enabled, balanced):

```markdown
---
display_name: "Synthesizer"
description: "Combines analyst handoffs into prioritized report"
tools: read, write
inherit_context: true
prompt_compression: balanced
---

You receive three handoffs (Performance, Security, Maintainability).
Cross-reference findings. Identify:
1. Critical issues (must-fix blockers)
2. High-priority issues (security, performance regressions)
3. Quality issues (maintainability, tech debt)

Write a markdown report grouped by severity. Cite file paths from
the handoffs' "evidence" arrays. Do not duplicate findings.
```

The parent spawns the three analysts in parallel (via the swarm `w` hotkey or the `JoinMode: "group"` setting), waits for all handoffs, then spawns the Synthesizer with the unioned context.

---

## // REFERENCE MATERIAL

- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Security Audit**: [SECURITY_AUDIT_REPORT.md](docs/SECURITY_AUDIT_REPORT.md)
- **Mitigation Verification**: [SECURITY_AUDIT_VERIFICATION_2026-05-23.md](docs/SECURITY_AUDIT_VERIFICATION_2026-05-23.md)

**LICENSE:** MIT — OnlineChef

