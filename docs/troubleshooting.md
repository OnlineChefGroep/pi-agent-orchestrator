# // TROUBLESHOOTING

> COMMON FAULT CONDITIONS, CAUSAL ANALYSIS, AND RECOVERY PROCEDURES.

---

## // INSTALLATION

### `npm install` fails with peer dependency errors

**CAUSE:** Hard peer constraints on `@earendil-works/pi-*` packages. (`@earendil-works/pi-tui` is no longer declared — it resolves transparently as a transitive of `pi-coding-agent`.)

**RECOVERY:** Execute installation inside pi-coding-agent environment boundary, or override constraint checks:

```bash
npm install --legacy-peer-deps
```

---

## // AGENT SUBSYSTEM

### Custom definition absent from `/agents` enumeration

**SYMPTOM:** Target `.pi/agents/my-agent.md` fails injection logic.

**VALIDATION MATRIX:**
1. Extension strict match: `.md` (not `.txt` or `.markdown`).
2. Placement constraint: Top-level `.pi/agents/` (recursive search disabled).
3. YAML boundary 1: `---` at line 1.
4. YAML boundary 2: `---` on isolated line.
5. Identifier rules: alphanumeric + hyphens, zero whitespace.
6. YAML syntax: Well-formed.

**FORCED RELOAD:** Execute `/agents` → "Reload custom agents".

**TELEMETRY:** Review extension output log for deterministic parse exceptions (includes trace lines).

---

### Agent faults with "tool not allowed"

**SYMPTOM:** Capability requested, constraint enforced, execution denied.

**CAUSAL VECTORS:**
1. Capability absent from `tools` array.
2. Capability present in `disallowed_tools` nullification list.
3. Parent hierarchy enforces strict inheritance limitation.
4. Memory partition filters dropped capability via `contextMode`.

**RECOVERY:** Audit configuration matrix and parent hierarchy. Programmatic inspection via `getAgentConfig(name)`.

---

### Infinite loop state execution

**SYMPTOM:** Agent cycles capabilities without objective termination.

**CAUSAL VECTORS & RECOVERY:**

| Vector | Recovery Protocol |
|---|---|
| Unbounded `maxTurns` limit | Enforce `defaultMaxTurns` or parameterize `maxTurns` explicitly. |
| Boundary definition failure | Refine `description` prompt telemetry. |
| Opaque tool payloads | LLM lacks state feedback. Inject validation blocks. |
| Compaction engine halted | Audit `compactionCount` integer increment in session record. |

**EMERGENCY INTERRUPT:** Execute `/agents` → "Running agents" → Select PID → "Cancel".

---

## // SCHEDULING ENGINE

### Temporal triggers fail execution

**SYMPTOM:** Scheduled cron definition silently skips trigger.

**VALIDATION MATRIX:**
1. `schedulingEnabled` == true.
2. Target `enabled` == true.
3. Cron definition string mathematically valid.
4. Core chronometer process active (`SubagentScheduler` initialized).
5. Error bus silent.

**PERSISTENCE NOTICE:** Jobs require active PI session. Memory persistence strictly requires `schedule-store.ts` file-backed storage flag active.

---

### Storage locks stall on Windows OS

**SYMPTOM:** `ENOENT`, stale lock handle, or atomic rename fault in `schedule.ts`.

**CAUSE:** Project-local atomic writes use same-dir temp + rename execution. Abrupt termination strands `.lock` physical files.

**RECOVERY:** Wait for stale recovery interval trigger, or manually unlink `.lock` artifacts in `.pi/subagent-schedules/` if target process is verified dead.

---

## // UI / TELEMETRY VIEWS

### Widget block fails render

**SYMPTOM:** Telemetry overlay absent.

**VALIDATION MATRIX:**
1. Agent session minimum: >= 1 (running or cached).
2. Configuration state: `getUiStyle() !== "plain"` when agents = 0.
3. Terminal geometry: Check column width minimum constraint.
4. Event bus silent on `agent-widget.ts` faults.

---

## // TEST SUITE

### Persistence test faults on Windows (`schedule.test.ts`)

**SYMPTOM:** Lock contention, atomic rename lag, or temporal jitter in suite execution.

**STATE:** Execution writes utilize same-dir temp buffering. Treat consistent failures as structural regressions. Capture physical `.lock` state.

**RECOVERY:** Isolate target sequence (`npm test -- test/schedule-store.test.ts`) to bisect temporal vs. storage faults.

---

### Test framework faults on module import

**SYMPTOM:** `Cannot find module '@earendil-works/pi-coding-agent'`

**RECOVERY:** Target package represents a peer constraint. Vitest runs via `deps.inline`. Run framework strictly within PI extension envelope, or inject mock dependencies.

---

## // PERFORMANCE METRICS

### Token consumption over thresholds

**SYMPTOM:** Saturation metric significantly exceeds projection.

**VALIDATION MATRIX:**
1. `compactionCount` incrementing (pruning active)?
2. Parent payload injection excessive? Enforce `levelLimit`.
3. Tool block caching failing? Validate `DEFAULT_KEEP_TURNS`.
4. Concurrency limit saturated? Validate `maxConcurrent`.

**MITIGATION DIRECTIVES:**
- Clamp `maxTurns` parameter.
- Toggle `contextMode` for payload reduction logic.
- Route detached tasks via `fire-and-forget` join topology (strips parent injection).

---

## // SOURCE CONTROL

### Worktree isolation faults

**SYMPTOM:** Shell exception executing `git worktree`.

**CAUSE:** Target topology conflict (path exists) or base directory lacks `.git` subsystem.

**RECOVERY:** System defaults to in-place mutation. Parse `src/worktree.ts` telemetry logs for state analysis.

---

## // SUBSYSTEM DOCUMENTATION

1. **Topology & Vectors**: `docs/architecture.md`
2. **Interface Definitions**: `docs/api-reference.md`
3. **Configuration Schema**: `docs/custom-agents.md`
4. **State Deltas**: `CHANGELOG.md`
5. **Deep Trace**: Enable verbose telemetry in PI settings block.
