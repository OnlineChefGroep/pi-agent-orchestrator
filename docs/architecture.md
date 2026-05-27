# Architecture

> High-level overview of `@onlinechefgroep/pi-agent-orchestrator` components and data flow.

---

## System Diagram

```
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

## Key Modules

### `src/agent-types.ts` — Permission Model

The core permission model determines which tools an agent can use:

1. **Base tools** from agent config (`builtinToolNames`)
2. **Parent restrictions** — if spawned by another agent, parent's `allowedTools`/`disallowedTools` are intersected
3. **Partition filter** — some tools are restricted based on memory partition
4. **Disallow floor** — `disallowedTools` is a hard floor that can only shrink, never grow

```ts
// Pseudocode of tool resolution
function resolveAgentTools(config, parentConfig) {
  const base = config.builtinToolNames;
  const filtered = applyPartitionFilter(base, config.contextMode);
  const restricted = PermissionUtils.applyParentRestrictions(filtered, parentConfig);
  const final = subtract(restricted, config.disallowedTools);
  return final;
}
```

### `src/agent-runner.ts` — Agent Lifecycle

```
spawn → build context → create session → run loop
  │          │              │              │
  │          │              │              └── tool calls, compaction, hooks
  │          │              └── ExtensionAPI.createAgentSession()
  │          └── extractText, buildParentContext, buildCtxInjection
  └── resolveModel, getConfig, apply partition + parent restrictions
```

### `src/context.ts` + `src/context-mode-bridge.ts` — Context Building

- **Phase 1:** Gather parent agent context (`buildParentContext`)
- **Phase 2:** Add context-mode tools (`buildCtxInjection`) for `ctx_read`, `ctx_write`, etc.
- **Phase 3:** Deferred context engine saves 15-48% tokens on queued agents by building context at session creation boundary

### `src/schedule.ts` + `src/schedule-store.ts` — Scheduling

- `SubagentScheduler` manages cron-like recurring agent jobs
- `ScheduleStore` persists schedules to `.pi/subagent-schedules/<sessionId>.json`
- Disabled jobs do not fire; jobs are cleaned up on completion

### `src/ui/agent-dashboard.ts` — Interactive Agent Dashboard

Rich interactive TUI dashboard replacing the old agent widget:
- **Vim-style hotkeys**: `j/k` navigate, `Enter` steer, `K` kill, `?` help overlay
- **Visual mode**: `v` multi-select + bulk operations
- **Permissions view**: `p` toggles tool permissions per agent
- **Swarm visibility**: `w` toggles swarm status, live join/leave
- **Live spinners**: 5 animation styles for running agents (`dots`, `pulse`, `wave`, `bar`, `clock`)
- **Auto-refresh**: Configurable dashboard refresh interval

### `src/swarm-join.ts` — Swarm Coordinator

Manages collaborative multi-agent swarms:
- Agents dynamically join/leave swarms at runtime
- Real-time status visible in dashboard via `w` hotkey
- Coordination logic for parallel swarm tasks
- Swarm state persisted alongside agent records

When `getUiStyle() === "cinematic"` and `isCinematicEnabled()`:
1. Uses the optional `@onlinechefgroep/pi-subagents-tui` package (installed separately)
2. Sends JSON payload with agent tree, activity, token usage every tick
3. Sidecar renders rich TUI; main process returns empty widget (to avoid double rendering)

### `src/ui/agent-widget.ts` — Widget (Legacy, superseded by agent-dashboard)

When `getUiStyle()` === "cinematic"` and `isCinematicEnabled()`:
1. Uses the optional `@onlinechefgroep/pi-subagents-tui` package (installed separately)
2. Sends JSON payload with agent tree, activity, token usage every tick
3. Sidecar renders rich TUI; main process returns empty widget (to avoid double rendering)

---

## Data Flow: Running an Agent

```
User command / scheduled trigger
  │
  ▼
ExtensionCommand (src/index.ts)
  │
  ▼
resolveModel() ──→ createSubagent() ──→ runAgent()
  │                      │                  │
  │                      │                  ├── tool call loop
  │                      │                  │      └── validate tool against resolved tools
  │                      │                  ├── compaction (prune old tool outputs)
  │                      │                  ├── hooks (subagent:start, turn:end, ...)
  │                      │                  └── handoff (structured chain-of-agents JSON)
  │                      │
  │                      └── build context
  │                            ├── parent context (if child agent)
  │                            └── context-mode tools (if enabled)
  │
  └── model label → ExtensionAPI.createAgentSession(model)
```

---

## File Overview

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Extension entry point, command registration |
| `src/agent-types.ts` | Tool resolution, permission inheritance, partition filtering |
| `src/agent-runner.ts` | Agent lifecycle, session creation, run loop |
| `src/agent-manager.ts` | Manager wrapper around ExtensionAPI's AgentManager |
| `src/agent-registry.ts` | Load default + custom agents, settings getters |
| `src/custom-agents.ts` | Parse `.pi/agents/*.md` frontmatter into AgentConfig |
| `src/default-agents.ts` | Embedded defaults: general-purpose, Explore, Plan, Analysis |
| `src/compaction.ts` | Prune old tool outputs to free context window |
| `src/context.ts` | Build parent context, extract text from messages |
| `src/context-mode-bridge.ts` | Inject `ctx_*` tools when contextMode is enabled |
| `src/handoff.ts` | Structured JSON handoff between agents |
| `src/hooks.ts` | Lifecycle hook registry with timeout protection |
| `src/memory.ts` | Memory partition types and resolution |
| `src/model-resolver.ts` | Resolve model aliases to full model names |
| `src/output-handler.ts` | `/agents` menu, settings, conversation viewer |
| `src/schedule.ts` | Scheduler for recurring agent jobs |
| `src/schedule-store.ts` | File-backed persistence for schedules |
| `src/settings.ts` | Typed settings with defaults and change emission |
| `src/swarm-join.ts` | SwarmCoordinator: live join/leave collaborative swarms |
| `src/types.ts` | Shared interfaces: AgentConfig, AgentRecord, JoinMode |
| `src/usage.ts` | Token and turn tracking, session context percentage |
| `src/validators.ts` | Post-completion adversarial validation |
| `src/worktree.ts` | Git worktree creation and cleanup |
| `src/cross-extension-rpc.ts` | RPC between pi extensions |
| `src/env.ts` | Environment detection and feature gating |
| `src/group-join.ts` | Batch/group manager for background agent coordination |
| `src/invocation-config.ts` | Per-invocation configuration resolution |
| `src/output-file.ts` | Output file generation for completed agents |
| `src/prompts.ts` | Prompt template system with placeholders |
| `src/skill-loader.ts` | Skill loading for agent contexts |
| `src/telemetry.ts` | Telemetry and metrics collection |
| `src/ui/agent-dashboard.ts` | Rich interactive dashboard with vim hotkeys & swarm view |
| `src/ui/agent-widget.ts` | Legacy persistent widget |
| `src/ui/conversation-viewer.ts` | Live conversation overlay |
| `src/ui/schedule-menu.ts` | Schedule management menu |
| `src/ui/animation.ts` | Shared animation utilities (spinners, timing) |
| `src/ui/theme.ts` | Theme system for dashboard/widget rendering |
| `src/ui/agent-format.ts` | Formatting utilities for tokens, turns, durations |
| `src/ui/agent-ui-types.ts` | Shared UI type definitions |
| `src/ui/agent-widget-renderer.ts` | Widget rendering logic (delegated from agent-widget.ts) |
| `src/ui/agent-dashboard-renderer.ts` | Dashboard rendering logic (delegated from agent-dashboard.ts) |
| `src/ui/notification-renderer.ts` | Custom notification renderer for agent completions |

---

## Batch/Nudge State Machine

The extension uses a debounced notification system to avoid spamming the main agent with individual completion messages when multiple agents finish in quick succession.

### Components

- **pendingNudges** (in `src/index.ts`): Map of agent IDs to setTimeout handles, holds notifications for 200ms to allow cancellation
- **GroupJoinManager** (`src/group-join.ts`): Batches agents registered as a group, delivers single consolidated notification
- **SwarmCoordinator** (`src/swarm-join.ts`): Similar to GroupJoinManager but for dynamic collaborative swarms
- **currentBatchAgents** (in `src/index.ts`): Tracks agents spawned in the current tool call for debounced finalization

### State Diagram

```
Agent completes
  │
  ├─→ Is result already consumed?
  │    └─ Yes → Skip notification, mark finished
  │
  ├─→ Is in pending batch (currentBatchAgents)?
  │    └─ Yes → Wait for finalizeBatch (debounce window)
  │
  ├─→ Is in a registered group?
  │    └─ Yes → GroupJoinManager.onAgentComplete()
  │              ├─ All complete? → Deliver immediately
  │              └─ Partial? → Start 30s timeout (or 15s straggler timeout)
  │
  ├─→ Is in a swarm?
  │    └─ Yes → SwarmCoordinator.onAgentComplete()
  │              (similar logic to GroupJoinManager)
  │
  └─→ Otherwise → scheduleNudge(200ms) → emitIndividualNudge()
```

### Debounce Flow

1. **Parallel tool calls**: When the main agent calls `Agent` multiple times in parallel, all spawned agents are added to `currentBatchAgents`
2. **Batch finalization**: After the tool call returns, a 100ms `batchFinalizeTimer` fires, calling `finalizeBatch()`
3. **Retroactive delivery**: `finalizeBatch()` checks which agents in the batch are already complete and sends a consolidated notification
4. **Straggler handling**: If an agent completes after the batch window, it falls through to individual or group notification paths

### Notification Cancellation

The `get_subagent_result` tool can cancel pending notifications by calling `cancelNudge(agentId)` before the 200ms hold expires. This prevents duplicate notifications when the main agent explicitly polls for results.
