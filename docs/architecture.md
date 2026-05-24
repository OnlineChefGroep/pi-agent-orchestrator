# Architecture

> High-level overview of `@onlinechef/pi-subagents` components and data flow.

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

### `src/ui/agent-widget.ts` — Widget & Sidecar

When `getUiStyle() === "cinematic"` and `isCinematicEnabled()`:
1. Spawns `cinematic-renderer/cinematic-tui[.exe]` as child process
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
| `src/types.ts` | Shared interfaces: AgentConfig, AgentRecord, JoinMode |
| `src/usage.ts` | Token and turn tracking, session context percentage |
| `src/validators.ts` | Post-completion adversarial validation |
| `src/worktree.ts` | Git worktree creation and cleanup |
| `src/cross-extension-rpc.ts` | RPC between pi extensions |
| `src/ui/agent-widget.ts` | Persistent widget + cinematic sidecar |
| `src/ui/conversation-viewer.ts` | Live conversation overlay |
| `src/ui/schedule-menu.ts` | Schedule management menu |
