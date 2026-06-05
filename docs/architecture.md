# // ARCHITECTURE

> HIGH-LEVEL SUBSYSTEM OVERVIEW FOR `@onlinechefgroep/pi-agent-orchestrator`. STRUCTURAL TOPOLOGY AND DATA FLOW DEFINITIONS.

---

## // SYSTEM DIAGRAM

![Pi Agent Orchestrator Architecture](./images/orchestrator_architecture.png)

```text
┌─────────────────────────────────────────────────────────────┐
│                    pi-coding-agent host                     │
│  (loads this extension, provides ExtensionAPI + AgentMgr)   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │    Extension Entry      │
        │    src/index.ts         │
        │  - registerCommands()   │
        │  - initSubagents()      │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │     Agent Registry      │
        │   src/agent-registry.ts │
        │  - load default agents    │
        │  - load custom agents     │
        │  - settings getters       │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │      Agent Types        │
        │   src/agent-types.ts    │
        │  - builtinToolNames     │
        │  - PermissionUtils      │
        │  - partition filtering  │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │      Agent Runner       │
        │   src/agent-runner.ts   │
        │  - createSubagent()     │
        │  - runAgent()           │
        │  - compaction logic     │
        │  - permission inherit   │
        └────────────┬────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───┴────┐    ┌─────┴──────┐  ┌─────┴────────┐
│ Hooks  │    │  Context   │  │   Handoff    │
│hooks.ts│    │ context.ts │  │  handoff.ts  │
└────────┘    └────────────┘  └──────────────┘
    │                │                │
    └────────────────┴────────────────┘
                     │
        ┌────────────┴────────────┐
        │         Usage           │
        │     src/usage.ts        │
        │  - token tracking       │
        │  - session context %    │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │     Output Handler      │
        │  src/output-handler.ts  │
        │  - /agents menu         │
        │  - settings UI          │
        │  - conversation viewer  │
        └────────────┬────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
┌───┴────┐    ┌─────┴──────┐  ┌─────┴────────┐
│ Agent  │    │ Schedule   │  │   Cinematic  │
│ Widget │    │  Menu      │  │   Sidecar    │
│ui/     │    │ui/         │  │cinematic-    │
│agent-  │    │schedule-   │  │renderer/     │
│widget.ts│   │menu.ts     │  │              │
└────────┘    └────────────┘  └──────────────┘
```

---

## // CORE MODULES

### `src/agent-types.ts` — Permission Model

Execution constraints enforce rigid boundaries:

1. **Base primitive array:** Declared in config (`builtinToolNames`).
2. **Parent restriction intersection:** Child agents strictly inherit parent constraint matrices.
3. **Memory partition filtration:** Isolation boundary filter rules applied.
4. **Disallow floor:** Absolute nullification list; constraints scale downward only.

```ts
// Structural execution constraint logic
function resolveAgentTools(config, parentConfig) {
  const base = config.builtinToolNames;
  const filtered = applyPartitionFilter(base, config.contextMode);
  const restricted = PermissionUtils.applyParentRestrictions(filtered, parentConfig);
  const final = subtract(restricted, config.disallowedTools);
  return final;
}
```

### `src/agent-runner.ts` — Lifecycle Execution

```text
spawn → build context → create session → run loop
  │          │              │              │
  │          │              │              └── tool calls, compaction, hooks
  │          │              └── ExtensionAPI.createAgentSession()
  │          └── extractText, buildParentContext, buildCtxInjection
  └── resolveModel, getConfig, apply partition + parent restrictions
```

### `src/context.ts` + `src/context-mode-bridge.ts` — Context Pipeline

- **Phase 1:** Aggregation of parent execution log (`buildParentContext`).
- **Phase 2:** Sandbox boundary injection (`buildCtxInjection`).
- **Phase 3:** Deferred calculation blocks. Generates 15-48% token reduction by executing precisely at session spawn point.

### `src/schedule.ts` + `src/schedule-store.ts` — Temporal Processing

- `SubagentScheduler`: Core chronometer engine.
- `ScheduleStore`: File-backed block persistence (`.pi/subagent-schedules/<sessionId>.json`).
- Disabled blocks isolated; completed blocks explicitly pruned.

### `src/ui/agent-dashboard.ts` — Telemetry Dashboard

High-density interactive metrics overlay:
- **Vim primitives**: `j/k` traversal, `Enter` intervene, `K` terminate, `?` overlay.
- **Visual multiselection**: `v` operator block operations.
- **Permission inspection**: `p` execution matrix view.
- **Swarm topology**: `w` real-time dynamic node join/leave view.
- **Telemetry rendering**: 5 rendering modes (`dots`, `pulse`, `wave`, `bar`, `clock`).
- **Refresh interval**: Programmable MS delay.

### `src/swarm-join.ts` — Swarm Protocol

Dynamic cluster topology control:
- Runtime dynamic node join/leave operations.
- State telemetry surfaced via `w` operator.
- Parallel processing state machine.
- Registry persistence bound to agent lifecycle memory.

### `src/ui/agent-widget.ts` — Legacy Block (Deprecation Pending)

When cinematic rendering engages:
1. Triggers independent binary `@onlinechefgroep/pi-subagents-tui`.
2. Emits JSON heartbeat with vector tree, instruction sets, usage metrics.
3. Suppresses main-thread drawing routines.

---

## // EXECUTION DATA FLOW

```text
Input command / temporal trigger
  │
  ▼
ExtensionCommand (src/index.ts)
  │
  ▼
resolveModel() ──→ createSubagent() ──→ runAgent()
  │                      │                  │
  │                      │                  ├── Tool invoke matrix
  │                      │                  │      └── Runtime boundary validation
  │                      │                  ├── Memory compaction prune
  │                      │                  ├── Interrupt hooks
  │                      │                  └── Handoff JSON payload struct
  │                      │
  │                      └── Context payload construction
  │                            ├── Parent vector stack
  │                            └── Sandbox primitives
  │
  └── Hardware identifier → ExtensionAPI.createAgentSession(model)
```

---

## // FILE MAP

| Module Path | Structural Responsibility |
|---|---|
| `src/index.ts` | Execution bootstrap, hook registration |
| `src/agent-types.ts` | Matrix resolution, capability scaling, partitioning |
| `src/agent-runner.ts` | Process instantiation, lifecycle loop |
| `src/agent-manager.ts` | Abstraction envelope for host AgentManager |
| `src/agent-registry.ts` | Definition ingestion, memory lookup |
| `src/custom-agents.ts` | Markdown frontmatter extraction and validation |
| `src/default-agents.ts` | Built-in primitive definitions |
| `src/compaction.ts` | Aggressive context window compression |
| `src/context.ts` | Vector stack payload creation |
| `src/context-mode-bridge.ts` | Sandbox execution primitives |
| `src/handoff.ts` | Unstructured data to JSON state boundary |
| `src/hooks.ts` | Execution interrupt bus |
| `src/memory.ts` | Physical boundary isolation definitions |
| `src/model-resolver.ts` | Identifier normalization layer |
| `src/output-handler.ts` | CLI standard output routines |
| `src/schedule.ts` | Chronometric execution pipeline |
| `src/schedule-store.ts` | Temporal persistent state blocks |
| `src/settings.ts` | Parameter dictionary |
| `src/swarm-join.ts` | Swarm node linkage state |
| `src/types.ts` | Type primitives (`AgentConfig`, `AgentRecord`) |
| `src/usage.ts` | Cost and threshold metrics |
| `src/validators.ts` | Adversarial output logic checks |
| `src/worktree.ts` | Disk partition handling |
| `src/cross-extension-rpc.ts` | Inter-module bus interface |
| `src/env.ts` | Target platform capability detection |
| `src/group-join.ts` | Batch synchronization protocol |
| `src/invocation-config.ts` | Override context definition |
| `src/output-file.ts` | Physical report generation |
| `src/prompts.ts` | Template block constants |
| `src/skill-loader.ts` | External module ingestion |
| `src/telemetry.ts` | Activity datalogging pipeline |
| `src/batch-orchestrator.ts` | Manages smart/group/swarm batch finalization and update debouncing |
| `src/ui/agent-dashboard.ts` | Primary interactive telemetry view with list and top modes |
| `src/ui/agent-top-renderer.ts` | Columns rendering, sorting, and pagination logic for resource top view |
| `src/ui/agent-widget.ts` | Running subagents widget overlay above the editor |
| `src/ui/conversation-viewer.ts` | Stream block trace |
| `src/ui/schedule-menu.ts` | Temporal task list view |
| `src/ui/animation.ts` | Execution feedback visual primitives |
| `src/ui/theme.ts` | Constant mapping for visual output |
| `src/ui/agent-format.ts` | Standard output data formatting |
| `src/ui/agent-ui-types.ts` | Display constraints definition |
| `src/ui/agent-widget-renderer.ts` | Widget render sequence with virtual scrolling and batch safety caps |
| `src/ui/agent-dashboard-renderer.ts` | Dashboard render sequence with details panel, help, and empty states |
| `src/ui/notification-renderer.ts` | State change visual logic |
| `src/ui/dashboard/` | Directory containing modular dashboard components (compact rows, progress bars, etc.) |

---

## // SYNCHRONIZATION STATE MACHINE

Batched telemetry protocol avoids execution-thread blockages when concurrent children terminate.

### Components

- **pendingNudges** (`src/index.ts`): Pointer array with 200ms flush boundary.
- **GroupJoinManager** (`src/group-join.ts`): Sync barrier block. Emits single matrix on resolve.
- **SwarmCoordinator** (`src/swarm-join.ts`): Dynamic runtime node state logic.
- **currentBatchAgents** (`src/index.ts`): Execution window buffer array.

### State Diagram

```text
Agent completes
  │
  ├─→ Result already consumed?
  │    └─ Yes → Halt propagation
  │
  ├─→ Existing in currentBatchAgents window?
  │    └─ Yes → Hold for finalizeBatch
  │
  ├─→ Member of GroupJoinManager barrier?
  │    └─ Yes → Execute barrier logic
  │              ├─ Full clear? → Emit immediately
  │              └─ Partial? → Reset 30s hardware timeout
  │
  ├─→ Member of SwarmCoordinator topology?
  │    └─ Yes → Execute node check
  │
  └─→ Else → scheduleNudge(200ms) → Flush single payload
```

### Debounce Pipeline

1. **Parallel tool invokes**: Rapid-fire instructions bind to `currentBatchAgents`.
2. **Buffer lock**: Return block forces a 100ms `batchFinalizeTimer`.
3. **Retroactive dispatch**: `finalizeBatch()` computes diff against pending results and pushes single unified object.
4. **Latency bleed handling**: Process completion post-buffer hits fallback paths.

### Telemetry Interruption

Calling `get_subagent_result` triggers explicit `cancelNudge(agentId)`. Telemetry object explicitly deleted before 200ms tick executes. Prevents state-feedback loop on manual read operations.

