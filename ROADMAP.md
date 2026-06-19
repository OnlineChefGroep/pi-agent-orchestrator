# Roadmap

## Current State

**v0.14.1** — Latest stable release on top of v0.12.1. Adds the
**Tracing master switch** (per-process `tracingEnabled` toggle in
`/agents → Settings`; runtime short-circuits every OTel span helper to
a shared no-op so the cost of span creation is one flag check) plus
**per-agent correlation ids** (8 hex chars from a v4 UUID, generated
at spawn and preserved across `resumeAgent`, attached to the
`agent.run:*` span as the OTel `correlation.id` attribute and echoed
on the helper return value for log helpers to read). Also ships the
**`/agents → Health check` command** — a TUI overlay (read-only
editor buffer) that snapshots the runtime: node version + memory,
tracing state, circuit-breaker state, scheduler (active / job count
/ feature enabled), swarm coordinator (swarms / agents / deliveries),
agent counts by status (with the correlation id of each recent
error), session usage + limits, and the full settings surface —
including the dispatch-decision histogram (see Planned Features
below). The v0.14.1 release also bundles the `SettingsGetters` /
`SettingsSetters` refactor that stops the 14-positional-arg spiral on
`showSettings` and `notifyApplied` (now with the inline
`Coordination` menu entry that surfaces both join mode and
orchestration mode in a single picker — see Planned Features),
a 200-line reduction in `test/handoff-v2.test.ts` benchmark noise,
and a `_tracer` cache reset helper for `resetTracer()` (used after a
`TracerProvider` swap in tests).
**1619 tests** across **90 test files** pass (typecheck ✅, lint ✅).

Prior releases: v0.12.1 — subagent orchestration, TUI dashboard,
swarm coordination, scheduling engine, hooks, permission inheritance,
3-tier prompt compression, daemon integration, schedule UI, thinking
level display, and async performance optimizations. MIT licensed.

## Planned Features

### Orchestration Mode Dispatch
✅ **Done (v0.14.1)** — `OrchestrationMode` runtime dispatch is live.
The Agent tool's execute path calls `resolveOrchestrationMode(...)`
before the background/foreground branch. The dispatcher is a pure
module (`src/orchestration-dispatch.ts`, ~290 lines) with a clear
heuristic + plan-builder split:

- **`analyzePrompt`** — surfaces signals: prompt length, estimated
  numbered/bulleted steps, multiple-file path mentions, plan /
  review / parallel / implement / refactor / test keyword families.
- **`heuristicPickMode`** — plan + review + multi-file +
  refactor-and-test → `crew`; parallel keyword → `swarm`; long
  multi-step implement → `crew`; otherwise → `single`.
- **`buildSwarmPlan`** — N parallel copies of the same prompt with
  distinct descriptions (default 3, clamped to [2, 5]).
- **`buildCrewPlan`** — 3 role-specialized prompts quoting the user
  request verbatim: planner (read-only, draft plan), executor
  (implements end-to-end), reviewer (read-only, PASS/FAIL verdict).
- **`resolveOrchestrationMode`** — `single` / `swarm` / `crew`
  passthrough; `auto` → analyze → heuristic → build.

The agent tool's `runOrchestratedDispatch` helper materializes the
decision into `N` background `manager.spawn` calls with explicit
`joinMode` (`swarm` or `group`), waits for `batchOrchestrator.flush`
so the swarm/group is live before any member can finish, then awaits
each `record.promise`. Foreground aggregates per-member results into
a single text block differentiating `fulfilled` vs `rejected`
promises AND `record.status` (error / aborted / stopped). Background
mode fires a fire-and-forget flush + returns the agent IDs
immediately; members are delivered via the normal
group/swarm notification path.

35 unit tests in `test/orchestration-dispatch.test.ts` cover the
heuristic, plan builders, and resolver edge cases. End-to-end
coverage in `test/orchestration-dispatch-integration.test.ts` drives
a real `tool.execute(...)` through crew / swarm / single /
auto→crew / auto→swarm / auto→single and asserts the
`batchOrchestrator.flush` + `record.promise` ordering (deferred
`runAgent` proves the swarm is finalized before any record
resolves). **1612 tests** across **90 test files** pass.

### Dispatch-Decision Histogram
✅ **Done (v0.14.1)** — the `/agents → Health check` report now
includes a recurring histogram of orchestration dispatch decisions
over the most recent N spawns (default cap 200), so users can audit
whether the auto-heuristic is firing on prompts that should have
been one-shots or, conversely, is under-fanning-out on prompts that
needed a crew.

- **`src/dispatch-history.ts`** — module-level FIFO ring buffer
  (`recordDispatchDecision`, `getDispatchHistory`,
  `getDispatchHistoryOldestFirst`, `computeDispatchHistogram`,
  `configureDispatchHistory`, `clearDispatchHistory`,
  `resetDispatchHistory` for tests). `computeDispatchHistogram`
  returns `{ total, byKind: {single,swarm,crew}, bySource:
  {explicit, autoHeuristic}, autoPicks: {single,swarm,crew},
  bufferCapacity, lastDecisionAt }` so the user can answer three
  questions at a glance: "how many total spawns did I dispatch?",
  "how many were explicit vs auto-heuristic?", and "of the prompts
  the heuristic saw, how many did it route to each kind?".
- **`src/tools/agent.ts`** — wired `recordDispatchDecision`
  immediately after `resolveOrchestrationMode(...)` returns. Captures
  `{ kind, configuredMode, source: explicit|auto-heuristic,
  promptLength, description }` for EVERY execute() call (including
  `single`) so the histogram carries the user-pinned-vs-heuristic
  ratio at full fidelity.
- **`src/health-report.ts`** — `HealthReport` interface carries
  `dispatchHistogram: DispatchHistogram`; `buildHealthReport`
  snapshots the histogram once at report-build time (race-free with
  the rest of the registry); `formatHealthReport` renders a
  `## Dispatch Decisions (recent)` section with total / byKind /
  bySource / auto-picks subtree (only when auto-heuristic fired) /
  last-decision ISO timestamp. Section header is always present so
  the user knows the feature exists even on a fresh session.

13 unit tests in `test/dispatch-history.test.ts` pin down the ring
buffer + histogram (newest-first ordering, FIFO eviction, low-cap
trim, defensive guard against bad caps, shallow-copy on record, the
out-of-order `lastDecisionAt` regression, clear/reset semantics).
`test/health-report.test.ts` extended with histogram section tests;
all 5 dispatch paths in the integration test anchor before/after
`computeDispatchHistogram()` deltas on both `byKind` AND `bySource`
so a future refactor that drops `recordDispatchDecision` surfaces
immediately rather than silently emptying the runtime histogram.

### Observability
- ✅ **Done (v0.14.1):** `tracingEnabled` master switch with
  short-circuit no-op spans, `correlation.id` attribute on every
  agent lifecycle span, and the `/agents → Health check` command.
- ⏳ **Pending:** structured JSON logging, Prometheus-format metrics
  export, a real local-trace exporter wired to the existing
  `TracerProvider` plumbing, and surfacing the correlation id in
  every log line emitted from the runner so traces and logs share
  the same id.

### Reliability
Exponential backoff retry, dead letter queue for failed agents with replay capability, and saga compensation for multi-agent workflows.

### Security & Governance
Immutable audit logging, cost guards (token/cost budgets), simple RBAC via settings, and secrets redaction.

### Testing & Operations
Chaos engineering tests, performance benchmarks, and health monitoring. (The performance benchmark suite already exists at `test/*.benchmark.test.ts`; the chaos + health-monitoring dashboards are still pending.)

## Out of Scope

- Multi-tenancy
- Horizontal scaling / worker pools
- Redis / RabbitMQ / external message queues
- Distributed tracing backends (Jaeger/Tempo)
- External auth (OAuth/OIDC)
- Kubernetes / container orchestration

This project is a **pi extension** — it runs inside the Pi coding agent host, not as a standalone service.
