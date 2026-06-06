---
name: agent-orchestration
description: "Design and debug agent orchestration patterns in pi-agent-orchestrator. Covers swarms, schedules, handoffs, batching, group joins, and lifecycle hooks. Use when implementing multi-agent workflows, debugging spawn/finalize logic, or designing chain-of-agents pipelines."
---

# Agent Orchestration

This skill covers the multi-agent orchestration patterns specific to pi-agent-orchestrator.

## Architecture Overview

```
spawn → build context → create session → run loop
  │          │              │              │
  │          │              │              └── tool calls, compaction, hooks
  │          │              └── ExtensionAPI.createAgentSession()
  │          └── extractText, buildParentContext, buildCtxInjection
  └── resolveModel, getConfig, apply partition + parent restrictions
```

## Join Modes

When spawning an agent via `createSubagent()`, you select a `JoinMode`:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `async` | Fire-and-forget, detached execution | Background tasks |
| `group` | Sync barrier: waits for all in group, single notification | Coordinated batch |
| `smart` | Auto-selects best strategy based on context (default) | Most cases |
| `swarm` | Dynamic collaborative multi-agent with runtime join/leave | Live collaboration |

### Group Join

Fixed-size barrier in `src/group-join.ts`:

```typescript
// Agents spawned in same turn form a group
const manager = new GroupJoinManager();
manager.add(agentId);
// When all complete, single grouped notification emitted
```

### Swarm Coordination

Dynamic swarm in `src/swarm-join.ts`:

```typescript
// Swarms are living organisms - agents join/leave at runtime
const swarm = new SwarmCoordinator(config);
// Strategies: "live" | "quorum" | "vote" | "merge" | "batch"
```

**Swarm strategies:**
- `live` - Deliver results as each agent completes (default)
- `quorum` - Wait for majority before delivering
- `vote` - Aggregate results via voting
- `merge` - Merge all results into single payload
- `batch` - Collect all, deliver once at timeout

## Batching and Debouncing

`BatchOrchestrator` in `src/batch-orchestrator.ts`:

```text
Parallel tool invokes → Buffer lock (100ms) → finalizeBatch() → diff + push
```

**Key behaviors:**
- Rapid-fire tool calls bind to `currentBatchAgents`
- 100ms `batchFinalizeTimer` debounce
- `finalizeBatch()` computes diff against pending results
- Process completion post-buffer hits fallback paths

**Telemetry interruption:** `get_subagent_result` triggers `cancelNudge(agentId)` to prevent state-feedback loops.

## Handoff Protocol

Structured JSON handoff in `src/handoff.ts`:

```typescript
interface AgentHandoff {
  type: "handoff";
  status: "success" | "partial" | "failed";
  summary: string;
  findings: string[];
  nextSteps?: string[];
  confidence?: number;
  evidence?: string[];
  files?: string[];
  artifacts?: HandoffArtifact[];
}
```

**Security limits (CVE-008):**
- Max JSON size: 1MB
- Max nesting depth: 20
- Max keys: 1000
- Max findings: 100
- Max summary length: 10,000 chars
- Max string length: 50,000 chars
- Max files: 200
- Max artifacts: 50

**Enable handoff in custom agents:**

```yaml
---
handoff: true
prompt_compression: minimal  # affects handoff prompt detail
---
```

**Prompt compression levels for handoffs:**
- `minimal` - Full verbose with two examples (+70% tokens)
- `balanced` - Concise with one example (default)
- `aggressive` - One-liner instruction (-44% tokens)

## Scheduling

Cron-style scheduling in `src/schedule.ts`:

```typescript
const scheduler = new SubagentScheduler(api, manager);
scheduler.schedule({
  agentType: "Explore",
  description: "Daily codebase scan",
  cron: "0 9 * * *",
  enabled: true,
});
```

**Persistence:** `ScheduleStore` writes to `.pi/subagent-schedules/<sessionId>.json`.

**Settings:**
- `schedulingEnabled` - Master switch (default: true)
- Jobs are pruned on completion, disabled jobs isolated

## Hooks

Lifecycle hooks in `src/hooks.ts`:

```typescript
const unsubscribe = registerHook("subagent:start", async (payload) => {
  console.log(`Spawn: ${payload.agentId}`);
  return "allow"; // "allow" | "block" | "modify"
});
```

**Event registry:**
- `subagent:start` / `subagent:end` / `subagent:error`
- `subagent:spawn` / `subagent:steer`
- `tool:call` / `tool:result`
- `compaction:start` / `compaction:end`
- `turn:start` / `turn:end`

## Context Pipeline

Three-phase context building in `src/context.ts`:

1. **Phase 1:** Aggregate parent execution log (`buildParentContext`)
2. **Phase 2:** Sandbox boundary injection (`buildCtxInjection`)
3. **Phase 3:** Deferred calculation blocks (15-48% token reduction)

**Context mode sandbox tools** (`src/tools/context.ts`): `ctx_read`, `ctx_write`, `ctx_list`

## Common Patterns

### Chain of Agents

```
Researcher (handoff: true) → Implementer → Reviewer
```

1. Researcher investigates, outputs structured handoff JSON
2. Implementer consumes handoff, makes changes
3. Reviewer validates changes

### Swarm for Parallel Analysis

```
Multiple agents spawn → SwarmCoordinator aggregates → Single result
```

Use `swarm` join mode with `vote` or `merge` strategy.

### Scheduled Monitoring

```
Scheduled Explorer (cron: "0 9 * * *") → Daily scan → Report findings
```

## Agent Lifecycle State Machine

```
┌─────────┐    spawn     ┌──────────┐   run loop   ┌──────────┐
│  idle   │ ────────────→│ running  │ ──────────→│ completed│
└─────────┘              └──────────┘              └──────────┘
                              │
                              │ error / abort
                              ▼
                         ┌──────────┐
                         │  failed  │
                         └──────────┘
```

**State transitions:**
1. `idle` → `running`: `spawn()` called
2. `running` → `completed`: Agent finishes successfully
3. `running` → `failed`: Error, abort, or timeout
4. `completed`/`failed` → `idle`: Record purged (configurable)

## Handoff Deep Dive

### Handoff JSON Schema

```typescript
interface AgentHandoff {
  type: "handoff";           // Required discriminator
  status: "success" | "partial" | "failed";
  summary: string;             // Max 10,000 chars
  findings: string[];         // Max 100 items
  nextSteps?: string[];       // Optional follow-up actions
  confidence?: number;        // 0.0-1.0
  evidence?: string[];        // Supporting evidence
  files?: string[];           // Max 200 files
  artifacts?: HandoffArtifact[]; // Max 50 artifacts
}

interface HandoffArtifact {
  type: "code" | "diff" | "test" | "doc" | "config";
  title: string;
  content: string;            // Max 50,000 chars per artifact
  language?: string;          // For syntax highlighting
}
```

### Security Limits (CVE-008)

| Limit | Value | Purpose |
|-------|-------|---------|
| Max JSON size | 1MB | Prevent memory exhaustion |
| Max nesting depth | 20 | Prevent stack overflow |
| Max keys | 1,000 | Prevent object expansion attacks |
| Max findings | 100 | Prevent list flooding |
| Max summary length | 10,000 chars | Prevent string flooding |
| Max string length | 50,000 chars | Per-string limit |
| Max files | 200 | Prevent file enumeration |
| Max artifacts | 50 | Prevent artifact flooding |

### Handoff Prompt Generation

```typescript
// buildHandoffPrompt() generates the system prompt for handoff-aware agents
const prompt = buildHandoffPrompt({
  compressionLevel: "balanced", // minimal | balanced | aggressive
  includeExamples: true,
  maxTokens: 4000,
});
```

**Compression levels:**
- `minimal`: Full verbose with two examples (+70% tokens)
- `balanced`: Concise with one example (default)
- `aggressive`: One-liner instruction (-44% tokens)

### Parse Handoff from LLM Output

```typescript
// LLM may wrap JSON in markdown fences
const text = `Here's my analysis:

\`\`\`json
{"type":"handoff","status":"success","summary":"..."}
\`\`\``;

const handoff = parseHandoff(text);
// Returns AgentHandoff | null
// Handles: fenced JSON, raw JSON, malformed input
```

## Scheduling Deep Dive

### Cron Expression Format

```typescript
// Standard cron: minute hour day month weekday
scheduler.schedule({
  agentType: "Explore",
  description: "Daily codebase scan",
  cron: "0 9 * * *",     // 9:00 AM every day
  enabled: true,
});

// Examples:
// "*/15 * * * *"   — Every 15 minutes
// "0 */6 * * *"    — Every 6 hours
// "0 9 * * 1-5"    — 9 AM weekdays
// "0 0 * * 0"      — Midnight Sundays
```

### Schedule Store Persistence

```typescript
// Storage location
.pi/subagent-schedules/<sessionId>.json

// Format:
{
  "jobs": [
    {
      "id": "job-123",
      "agentType": "Explore",
      "cron": "0 9 * * *",
      "enabled": true,
      "lastRun": "2024-01-15T09:00:00Z",
      "nextRun": "2024-01-16T09:00:00Z"
    }
  ]
}
```

### Schedule Lifecycle

```
schedule() called
    ↓
Parse cron expression
    ↓
Calculate next run time
    ↓
Persist to ScheduleStore
    ↓
Start timer (setTimeout to next run)
    ↓
At next run:
  - Spawn agent
  - Record lastRun
  - Calculate next nextRun
  - Persist updated schedule
  - Set next timer
    ↓
On disable: Cancel timer, keep record
On prune: Remove completed one-time jobs
```

## Swarm Coordination Details

### SwarmAgentState

```typescript
interface SwarmAgentState {
  agentId: string;
  status: SwarmAgentStatus; // idle | running | completed | failed | timeout | left
  joinedAt: number;         // Timestamp
  lastHeartbeatAt: number;
  completedAt?: number;
  record?: AgentRecord;
  priority: number;         // Leader election priority (higher = more likely)
  meta: Record<string, unknown>;
}
```

### Delivery Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `live` | Deliver results as each agent completes | Real-time monitoring |
| `quorum` | Wait for majority before delivering | Consensus required |
| `vote` | Aggregate results via voting | Decision making |
| `merge` | Merge all results into single payload | Data aggregation |
| `batch` | Collect all, deliver once at timeout | Final reports |

### Quorum Calculation

```typescript
function isQuorumMet(agents: SwarmAgentState[]): boolean {
  const total = agents.length;
  const completed = agents.filter(a => a.status === "completed").length;
  return completed > total / 2; // Simple majority
}
```

### Leader Election

```typescript
// Highest priority agent becomes leader
const leader = agents
  .filter(a => a.status !== "left")
  .sort((a, b) => b.priority - a.priority)[0];
```

## Batch Orchestrator

### Batch Lifecycle

```
Agent spawn requested
    ↓
Add to currentBatch[]
    ↓
Start/reset batchFinalizeTimer (100ms)
    ↓
More spawns within 100ms?
  ├─ Yes → Add to batch, reset timer
  └─ No → finalizeBatch() after timeout
    ↓
finalizeBatch():
  - Group by joinMode
  - Form smart groups (≥2 agents)
  - Form swarms (≥1 agent with swarm mode)
  - Emit notifications
    ↓
Process completion:
  - Post-buffer agents hit fallback
  - Diff against pending results
  - Push updates to widget
```

### Telemetry Interruption

```typescript
// get_subagent_result triggers cancelNudge()
// Prevents state-feedback loops where:
// 1. Agent completes
// 2. Result consumed
// 3. Completion triggers notification
// 4. Notification requests result again
// 5. Loop!
```

## Context Pipeline

### Three-Phase Building

```typescript
// Phase 1: Parent execution log
const parentContext = buildParentContext(parentLog);

// Phase 2: Sandbox boundary injection
const sandboxContext = buildCtxInjection({
  allowedTools: ["ctx_read", "ctx_write", "ctx_list"],
  worktreePath: "/tmp/agent-worktree",
});

// Phase 3: Deferred calculation blocks
const deferredBlocks = buildDeferredBlocks([
  { label: "file_list", calculate: () => listFiles() },
  { label: "git_status", calculate: () => getGitStatus() },
]);
// 15-48% token reduction by not including unused blocks
```

### Context Mode Sandbox Tools

Available when `@onlinechef/context-mode` peer dep is present:

| Tool | Purpose | Security |
|------|---------|----------|
| `ctx_read` | Read files in sandbox | Restricted to worktree |
| `ctx_write` | Write files in sandbox | Restricted to worktree |
| `ctx_list` | List files in sandbox | Restricted to worktree |

## Advanced Patterns

### Dynamic Swarm Resize

```typescript
// Agents can join/leave at runtime
swarm.addAgent(agentId, { priority: 5 });
swarm.removeAgent(agentId);

// Swarm adapts delivery strategy based on size
if (swarm.size < 3) {
  swarm.setStrategy("live");
} else {
  swarm.setStrategy("quorum");
}
```

### Custom Hook Chain

```typescript
// Hooks can modify, block, or allow events
registerHook("subagent:start", async (payload) => {
  // Check permissions
  if (!hasPermission(payload.agentType)) {
    return "block";
  }

  // Modify context
  payload.context.extraData = "injected";
  return "modify";
});

registerHook("subagent:end", async (payload) => {
  // Log completion
  analytics.track("agent_completed", payload);
  return "allow";
});
```

### Conditional Scheduling

```typescript
// Schedule with predicate
scheduler.schedule({
  agentType: "Monitor",
  cron: "*/5 * * * *",
  enabled: true,
  predicate: (ctx) => ctx.agentCount > 0, // Only run if agents active
});
```

## Debugging Flowchart

```
Agent not spawning?
  ├─ Check sessionLimits (maxAgentsPerSession)
  ├─ Check partition filter (agent-types.ts)
  ├─ Check parent restrictions
  └─ Check hook "block" response

Agent stuck in "running"?
  ├─ Check maxTurns (default vs per-agent)
  ├─ Check graceTurns
  ├─ Check for infinite tool loops
  └─ Check if session was aborted

Swarm not coordinating?
  ├─ Check joinMode: "swarm"
  ├─ Check SwarmConfig.strategy
  ├─ Check agent heartbeats
  └─ Verify swarmId matches

Handoff rejected?
  ├─ Run validateHandoffShape()
  ├─ Check JSON size < 1MB
  ├─ Check depth < 20
  ├─ Check key count < 1000
  └─ Check all required fields present

Schedule not firing?
  ├─ Check schedulingEnabled setting
  ├─ Check cron expression validity
  ├─ Check job.enabled flag
  └─ Verify system time correct

Batch missing agents?
  ├─ Check debounce window (100ms)
  ├─ Check if agents spawned in same turn
  ├─ Verify joinMode matches
  └─ Check smartGroupThreshold
```

## Performance Considerations

### Spawn Latency

```bash
# Benchmark spawn time
npx vitest run test/spawn-latency-bench.test.ts

# Target: < 50ms per spawn
```

### Context Size

| Compression Level | Token Reduction | Quality |
|-------------------|-----------------|---------|
| minimal | 0% (baseline) | Full detail |
| balanced | ~20% | Good detail |
| aggressive | ~44% | Minimal detail |

### Swarm Overhead

| Swarm Size | Coordination Overhead | Recommended Strategy |
|------------|----------------------|---------------------|
| 2-3 | Low | `live` |
| 4-7 | Medium | `quorum` |
| 8+ | High | `batch` or `merge` |

## When to Use This Skill

Invoke this skill when:
- User mentions "swarm", "group join", or "batch"
- User mentions "handoff", "chain", or "pipeline"
- User mentions "schedule", "cron", or "recurring"
- User mentions "hooks", "lifecycle", or "events"
- User wants to design multi-agent workflows
- User is debugging spawn/finalize logic
- User wants to implement context mode sandboxing
- User mentions "CVE-008" or handoff security limits
- User mentions "quorum", "leader election", or "swarm strategy"
- User mentions "deferred context" or "token reduction"
- User mentions "telemetry interruption" or "cancelNudge"
