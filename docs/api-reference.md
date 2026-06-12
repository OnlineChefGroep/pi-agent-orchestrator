# // API REFERENCE

> PUBLIC API SURFACE FOR `@onlinechefgroep/pi-agent-orchestrator`. INTERNAL STRUCTURES (`AgentFieldParser`, `PermissionUtils`) EXPLICITLY OMITTED. USE EXPOSED FUNCTIONS ONLY.

---

## // EXTENSION ENTRY POINT

### `registerCommands(api: ExtensionAPI): void`

**FILE:** `src/index.ts`

Registers the `/agents` command and hooks into the `pi-coding-agent` lifecycle. Executes exactly once during extension load.

### `initSubagents(api: ExtensionAPI): void`

**FILE:** `src/index.ts`

Initializes subsystem constraints: custom agent loads, widget setup, lifecycle hook registration.

---

## // AGENT REGISTRY

### `reloadCustomAgents(projectDir: string): void`

**FILE:** `src/agent-registry.ts`

Reloads `.pi/agents/*.md` definitions from local project and global directories. Execute subsequent to filesystem mutations.

```ts
reloadCustomAgents(process.cwd());
```

### `getAgentConfig(name: string): AgentConfig | undefined`

**FILE:** `src/agent-types.ts`

Returns resolved configuration tree, including inherited constraints. Override sequence: Custom profiles → Built-in defaults.

### `getAllTypes(): string[]`

**FILE:** `src/agent-types.ts`

Returns array of all registered type identifiers.

---

## // AGENT RUNNER

### `createSubagent(options: SubagentOptions): Promise<AgentSession>`

**FILE:** `src/agent-runner.ts`

Spawns new execution session. Primary programmatic invocation method.

```ts
interface SubagentOptions {
  type: string;              // Type identifier (e.g., "general-purpose", "Explore")
  description: string;       // Telemetry descriptor
  parentSession?: AgentSession; // Context inheritance reference
  model?: string;            // Model override identifier
  maxTurns?: number;         // Hard turn constraint
  joinMode?: JoinMode;       // "await" | "fire-and-forget" | "notify"
  contextMode?: boolean;     // Sandbox toggle
  level?: number;            // Depth integer (default 0)
}
```

### `steerAgent(session: AgentSession, instruction: string): void`

**FILE:** `src/agent-runner.ts`

Injects mid-flight execution steering instruction.

### `getAgentConversation(sessionId: string): CompactableMessage[]`

**FILE:** `src/agent-runner.ts`

Retrieves immutable conversation log for specified session.

### `getDefaultMaxTurns(): number | undefined`

**FILE:** `src/agent-runner.ts`

Retrieves default depth constraint (undefined = infinite).

### `getGraceTurns(): number`

**FILE:** `src/agent-runner.ts`

Retrieves wrap-up iteration allowance prior to forced kill sequence.

---

## // SCHEDULING

### `SubagentScheduler`

**FILE:** `src/schedule.ts`

Cron-engine manager for recurring autonomous jobs.

```ts
const scheduler = new SubagentScheduler(api, manager);

// Register execution
scheduler.schedule({
  agentType: "Explore",
  description: "Daily codebase scan",
  cron: "0 9 * * *",
  enabled: true,
});

// Enumerate registry
const jobs = scheduler.listJobs();

// Terminate execution cycle
scheduler.cancel(jobId);
```

---

## // HOOKS

### `registerHook(event: HookEvent, handler: HookHandler): () => void`

**FILE:** `src/hooks.ts`

Registers lifecycle interrupt handler. Returns execution terminator function.

```ts
import { registerHook } from "@onlinechefgroep/pi-agent-orchestrator";

const unsubscribe = registerHook("subagent:start", async (payload) => {
  console.log(`Execution spawn: ${payload.agentId}`);
  return "allow"; // "allow" | "block" | "modify"
});
```

**EVENT REGISTRY:**
- `subagent:start` — Pre-execution interrupt
- `subagent:end` — Post-execution interrupt
- `subagent:error` — Uncaught fault interrupt
- `subagent:spawn` — Sub-process fork interrupt
- `subagent:steer` — Instruction injection interrupt
- `tool:call` — Pre-tool execution
- `tool:result` — Post-tool execution
- `compaction:start` / `compaction:end`
- `turn:start` / `turn:end`

---

## // CONTEXT MANAGEMENT

### `buildParentContext(parentSession: AgentSession): Message[]`

**FILE:** `src/context.ts`

Compiles context payload from parent log. Enforces chain-of-thought transmission.

### `extractText(content: unknown): string`

**FILE:** `src/context.ts`

Extracts raw text primitive from message block structures.

---

## // CONFIGURATION SETTINGS

### `SubagentsSettings`

**FILE:** `src/settings.ts`

```ts
interface SubagentsSettings {
  maxConcurrent?: number;              // Max concurrently running agents (default 4)
  maxAgentsPerSession?: number;         // Hard cap on total agents spawned per session
  maxTotalTurnsPerSession?: number;     // Hard cap on cumulative turns across the session
  defaultMaxTurns?: number;             // Max turns per agent (0 = unlimited)
  graceTurns?: number;                // Wrap-up turns before forced kill (default 5)
  defaultJoinMode?: JoinMode;          // Agent join topology (default: "smart")
  schedulingEnabled?: boolean;         // Master switch for cron scheduling (default: true)
  animationStyle?: "braille" | "dots" | "lines" | "classic" | "none";  // Spinner style (default: "braille")
  uiStyle?: "premium" | "retro" | "plain" | "cinematic";  // UI theme (default: "premium")
  cinematicEnabled?: boolean;          // Enable cinematic Go TUI sidecar when uiStyle is "cinematic" (default: true)
  showActivityStream?: boolean;        // Show real-time activity stream in widget (default: true)
  showTokenUsage?: boolean;            // Show token usage and context fill percentage (default: true)
  showTurnProgress?: boolean;          // Show turn progress (current/max) for running agents (default: true)
  orchestrationMode?: "auto" | "single" | "swarm" | "crew";  // Execution topology (default: "auto")
  dashboardRefreshInterval?: number;   // Dashboard refresh interval in ms (default: 750, min: 100, max: 60000)
  sessionMaxSpawns?: number;           // Guardrail: max agents spawned per session
  sessionMaxTurns?: number;            // Guardrail: max cumulative turns per session
  promptCompressionLevel?: PromptCompressionLevel;  // "minimal" | "balanced" | "aggressive" (default: "balanced")
}
```

### `PromptCompressionLevel`

**FILE:** `src/types.ts`

Controls the verbosity of system prompts injected into agents. Lower compression yields higher-quality instructions at the cost of more tokens; higher compression saves tokens at the cost of instruction detail.

| Level | Behavior | Token Impact |
|---|---|---|
| `"minimal"` | Full verbose prompts with CAPS emphasis, per-tool bash equivalents, two handoff examples. Maximum instruction quality. | +70% vs balanced |
| `"balanced"` | Concise prompts with realistic examples (default). Good trade-off between quality and token usage. | Baseline |
| `"aggressive"` | Ultra-short one-liners for read-only warnings, tool usage, and handoff. Maximum token savings. | −44% vs balanced |

**SCOPE:**
- Affects all `replace`-mode built-in agents (Explore, Plan, Analysis) via lazy runtime regeneration.
- Affects handoff prompt injection for all agents with `handoff: true`.
- Custom agents (`.pi/agents/*.md`) can override per-agent via the `prompt_compression` frontmatter directive.
- Append-mode agents (e.g. `general-purpose`) — only the handoff block varies; the inherited system prompt and bridge are unaffected.

**PRECEDENCE:** Per-agent frontmatter `prompt_compression` > global `promptCompressionLevel` setting > default `"balanced"`.

**PERSISTENCE:** Stored in `.pi/subagents.json` and managed via `SettingsAppliers.setPromptCompressionLevel`.

### `saveAndEmitChanged(settings: SubagentsSettings): void`

**FILE:** `src/settings.ts`

Persists configuration map to block storage and triggers state reload.

---

## // TYPE DEFINITIONS

### `AgentConfig`

**FILE:** `src/types.ts`

```ts
interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  builtinToolNames: string[];
  disallowedTools?: string[];
  extensions?: boolean;
  contextMode?: boolean;
  allowedTools?: string[];
  model?: string;
  temperature?: number;
  parentType?: string;
  handoff?: boolean;          // Produce structured JSON handoff at end of response
  promptCompressionLevel?: PromptCompressionLevel;  // Per-agent compression override
  memory?: "user" | "project" | "local";       // State persistence scope
  isolation?: "worktree";    // Isolation mode
}
```

### `AgentRecord`

**FILE:** `src/types.ts`

Runtime state memory map:

```ts
interface AgentRecord {
  id: string;
  type: string;
  description: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  toolUses: number;
  level: number;
  compactionCount: number;
}
```

### `JoinMode`

**FILE:** `src/types.ts`

- `"async"` — Asynchronous fork, detached execution (default).
- `"group"` — Synchronous barrier: waits for all agents in the group to finish, then emits a single grouped notification.
- `"smart"` — Smart selection: automatically chooses the best join strategy based on context.
- `"swarm"` — Swarm mode: dynamic collaborative multi-agent processing with runtime join/leave.

---

## // CUSTOM AGENT INGESTION

### `loadCustomAgents(dir: string): Map<string, AgentConfig>`

**FILE:** `src/custom-agents.ts`

Ingests markdown definitions, parsing YAML frontmatter into memory constraints. Validates identifiers and nullifies injection primitives.

**FRONTMATTER DIRECTIVES** (parsed in `src/custom-agents.ts`):

| Directive | Type | Default | Effect |
|---|---|---|---|
| `display_name` | string | filename | UI label override |
| `description` | string | filename | Telemetry description |
| `tools` | CSV / `none` | all built-in tools | Authorized tool subset |
| `disallowed_tools` | CSV | none | Explicit denylist (partition floor) |
| `extensions` | bool / CSV | `true` | Extension module access |
| `skills` | bool / CSV | `true` | Skill module access |
| `model` | string | host default | Model override (e.g. `anthropic/claude-sonnet-4-5`) |
| `thinking` | string | null | Inference effort: `low` / `medium` / `high` |
| `max_turns` | number | null | Hard execution turn limit |
| `prompt_mode` | `replace` / `append` | `replace` | System prompt integration strategy |
| `inherit_context` | bool (or string `"true"`/`"false"`) | null | Parent conversation context |
| `run_in_background` | bool (or string) | null | Non-blocking execution |
| `isolated` | bool (or string) | null | Strict context isolation |
| `memory` | `user` / `project` / `local` | null | State persistence scope |
| `isolation` | `worktree` | null | Physical directory isolation |
| `handoff` | bool (or string) | `false` | Produce structured JSON handoff at end of response |
| `prompt_compression` | `minimal` / `balanced` / `aggressive` | inherits global | Per-agent compression override |
| `enabled` | bool (or string) | `true` | Profile activation state |

All boolean fields accept either native YAML booleans or string-encoded booleans
(`"true"` / `"false"`, case-insensitive). They are parsed via `parseBooleanOptional`
and `parseBooleanWithDefault` in `src/custom-agents.ts`, which throw on any
unrecognised input (numbers, arbitrary strings) so YAML schema errors surface
at load time rather than being silently coerced.

**FRONTMATTER EXAMPLE (handoff):**

```markdown
---
display_name: "Chain Reviewer"
description: "Code review that hands off structured findings"
tools: read, grep, find
handoff: true
prompt_compression: minimal
---

Perform a thorough code review and produce a structured handoff JSON
with your findings for downstream agents.
```

When `handoff: true` is set, the agent produces a structured JSON handoff at the end of its response, enabling chain-of-agents workflows where one agent's output feeds directly into the next.

**SECURITY DIRECTIVE:** Symlinks are explicitly ignored to prevent LFI vulnerabilities.

---

## // TELEMETRY VIEWER

### `ConversationViewer`

**FILE:** `src/ui/conversation-viewer.ts`

TUI rendering block for real-time log stream tracking.

```ts
const viewer = new ConversationViewer(tui, session, record, activity, theme);
viewer.render(width, height); // Returns string[] display buffer
```

---

## // USAGE METRICS

### `getLifetimeTotal(usage?: LifetimeUsage): number`

**FILE:** `src/usage.ts`

Retrieves global token execution count.

### `getSessionContextPercent(session?: SessionLike): number`

**FILE:** `src/usage.ts`

Retrieves saturation metric (0-100) of context window.

---

## // PUBLIC TYPED API

Single entry point for peer extensions and tests that want a stable, typed
contract against the orchestrator. Re-exports the RPC + hook types from one
place and adds Symbol-based discovery for the runtime handle.

**FILE:** `src/public-api.ts`

### // SYMBOL DISCOVERY

The orchestrator publishes its typed API on two well-known `globalThis` keys:

| Symbol | Returns | Notes |
|---|---|---|
| `Symbol.for("pi-subagents:api")` | `SubagentsPublicApi \| undefined` | New — typed RPC + typed event subscription |
| `Symbol.for("pi-subagents:hooks")` | `HookRegistry \| undefined` | Documented but previously unimplemented; now published |

Use the safe accessors `getSubagentsApi()` / `getSubagentsHooks()` (both return
`undefined` when the extension is not loaded). Clear with `clearSubagentsApi()`
in test teardown.

### // REGISTRATION

Called once by the extension on load. **Idempotent** — last registration wins,
matching the contract documented for `registerRpcHandlers` in
`src/cross-extension-rpc.ts`.

```ts
import {
  registerSubagentsApi,
  HookRegistry,
  type SubagentsPublicApi,
} from "@onlinechefgroep/pi-agent-orchestrator/public-api";

export function init(api: ExtensionAPI): SubagentsPublicApi {
  const hooks = new HookRegistry();
  // ... register pi-extension handlers on the hook registry ...
  return registerSubagentsApi(api.events, hooks, { extensionId: "my-extension" });
}
```

### // TYPED EVENT SUBSCRIPTION

The `TypedEventSubscription` returned via `api.hooks` gives handlers a
discriminated payload — `data` is shaped by the subscribed event name, not
the previous `Record<string, unknown>` black box.

```ts
import {
  getSubagentsApi,
  type TypedHookPayload,
} from "@onlinechefgroep/pi-agent-orchestrator/public-api";

const api = getSubagentsApi();
if (!api) throw new Error("pi-agent-orchestrator extension is not loaded");

// Single typed event — handler gets the exact data shape for "subagent:start"
const off = api.hooks.on("subagent:start", async (payload) => {
  //    ^? TypedHookPayload<"subagent:start"> → { event, agentId, data: AgentStartData, ... }
  console.log(payload.data.type, payload.data.description);
  return "allow";
});

// Every event with a union payload
const offAll = api.hooks.onAll((payload) => {
  if (payload.event === "subagent:end" && payload.data.status === "completed") {
    // ... payload.data is narrowed to AgentEndData here
  }
});
```

`TYPED_HOOK_PAYLOAD_MAP` maps every `HookEvent` to its specific data shape
(`AgentStartData`, `AgentEndData`, `ToolCallData`, etc.) and is exhaustiveness-
checked against the `HookEvent` union via `satisfies Record<HookEvent, unknown>`
— adding a new event without a row in the map fails the build.

### // TYPED RPC

The `api.rpc` field is a `SubagentsRpcClient` (same shape as the existing
`createSubagentsRpcClient` factory), with the four supported operations:

- `ping()` → `{ version: number }`
- `spawn({ type, prompt, options? })` → `{ id: string }`
- `stop({ agentId })` → `void`
- `sessionUsage()` → `{ usage, limits }`

The rate-limit, authentication, and audit-trail guarantees documented in
`// CROSS-EXTENSION RPC` below apply unchanged.

### // MANAGER HANDLE

`api.manager` is a read-only `SubagentManagerHandle` over the orchestrator's
`AgentManager`. It is also published under `Symbol.for("pi-subagents:manager")`
and exposed via the safe accessor `getSubagentsManager()`.

The handle exposes four observation methods only — every mutating surface
(`spawn`, `stop`, `abort`, `clearCompleted`, etc.) is intentionally **not**
exposed, so peer extensions can monitor agents without gaining the ability
to create or stop them.

```ts
import {
  getSubagentsApi,
  getSubagentsManager,
  type SubagentManagerHandle,
  type SubagentManagerRecord,
} from "@onlinechefgroep/pi-agent-orchestrator/public-api";

// Via the typed API
const api = getSubagentsApi();
if (api) {
  await api.manager.waitForAll();
  const rec: SubagentManagerRecord | undefined = api.manager.getRecord("agent-123");
  const exploreIds: string[] = api.manager.listAgentIds("Explore");
}

// Or via the safe accessor
const mgr: SubagentManagerHandle | undefined = getSubagentsManager();
if (mgr) {
  const running = mgr.hasRunning();
}
```

**METHOD SHAPE (`SubagentManagerHandle`):**

| Method | Returns | Purpose |
|---|---|---|
| `waitForAll()` | `Promise<void>` | Resolve when every currently-running agent reaches a terminal state |
| `hasRunning()` | `boolean` | Whether any agent is currently running |
| `getRecord(id)` | `SubagentManagerRecord \| undefined` | Sanitized record for an agent, or `undefined` if absent |
| `listAgentIds(type)` | `string[]` | All known agent ids of the given type |

**SANITIZATION CONTRACT (`SubagentManagerRecord`):**

The record returned by `getRecord(id)` is a *projection* of the internal
`AgentRecord`. Only `id`, `type`, `status`, and a truncated `description`
are exposed. Sensitive fields (full prompt, result, error stack, internal
flags) are intentionally omitted — consumers that need the full record
should use the `Agent` tool or RPC instead.

The `description` field is truncated to
`SUBAGENT_MANAGER_MAX_DESCRIPTION_CHARS` (currently `200`) characters
to avoid leaking long context (full file contents, transcripts, etc.) to
peer extensions in the process.

### // RE-EXPORTS

For convenience, the following types and helpers are re-exported from a
single import path:

- **RPC:** `PROTOCOL_VERSION`, `createSubagentsRpcClient`, `EventBus`,
  `SubagentsRpcClient`, `RpcReply`, `SpawnRpcRequest`, `StopRpcRequest`,
  `PingRpcReply`, `SessionUsageRpcReply`, `SpawnCapable`, `SessionCapable`,
  `SwarmCapable`, `AuthContext`, `RateLimitConfig`
- **Hooks:** `HookRegistry`, `HookEvent`, `HookPayload`, `HookHandler`,
  `HookResponse`, `composeHandlers`
- **This module:** `TYPED_HOOK_PAYLOAD_MAP`, `TypedHookPayload`,
  `TypedHookHandler`, `TypedEventSubscription`, `SubagentsPublicApi`,
  `SUBAGENTS_API_SYMBOL`, `SUBAGENTS_HOOKS_SYMBOL`, `SUBAGENTS_MANAGER_SYMBOL`,
  `SUBAGENT_MANAGER_MAX_DESCRIPTION_CHARS`, all event-payload
  data interfaces (`AgentStartData`, `AgentEndData`, `ToolCallData`, etc.),
  `registerSubagentsApi`, `getSubagentsApi`, `getSubagentsHooks`,
  `getSubagentsManager`, `clearSubagentsApi`, `SubagentManagerHandle`,
  `SubagentManagerRecord`, `SubagentManagerLike`

---

## // CROSS-EXTENSION RPC

### // PROTOCOL DEFINITION

**FILE:** `src/cross-extension-rpc.ts`

Standardized request-reply event structure over the `pi.events` bus. Designed for decoupled multi-extension operation.

**PROTOCOL VERSION:** `2`

Mutating parameters (`spawn`, `stop`) are hardware-authenticated when `authProvider` is defined. Unauthenticated requests strictly rejected unless legacy fallback is enabled.

### // RPC PAYLOAD ENVELOPE

Conforms to structural guarantees:

```ts
type RpcReply<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

### // RPC ENDPOINTS

#### `subagents:rpc:ping`

System health check and protocol discovery.

**REQUEST:** `{ requestId: string }`
**REPLY:** `{ success: true; data: { version: number } }`

#### `subagents:rpc:spawn`

Fork detached process from alternate module.

**REQUEST:**
```ts
{
  requestId: string;
  type: string;
  prompt: string;
  options?: {
    model?: string;
    maxTurns?: number;
    isolated?: boolean;
    inheritContext?: boolean;
  };
}
```

**REPLY:** `{ success: true; data: { id: string } }`

**RATE LIMITING:** 10 forks/minute per authenticated module ID.

#### `subagents:rpc:stop`

Force execution interrupt on specified PID.

**REQUEST:** `{ requestId: string; agentId: string }`
**REPLY:** `{ success: true }`

**RATE LIMITING:** 10 interrupts/minute per authenticated module ID.

### // SYMBOL REGISTRY

Exposes read-only telemetry by passing globally registered symbols.

#### `Symbol.for("pi-subagents:manager")`

```ts
const manager = (globalThis as any)[Symbol.for("pi-subagents:manager")];

await manager.waitForAll();
const record = manager.getRecord("agent-123");
const ids = manager.listAgentIds("Explore");
```

> **Status:** published via `registerSubagentsApi(...)` (see `// PUBLIC TYPED API` above). Peer extensions should prefer the safe accessor `getSubagentsManager()` or `api.manager` over the raw symbol read.

**SECURITY DIRECTIVE:** Write functions physically detached from registry pointer.

#### `Symbol.for("pi-subagents:hooks")`

```ts
const hooks = (globalThis as any)[Symbol.for("pi-subagents:hooks")];
const handlers = hooks.getHandlers();
```

### // LIFECYCLE BROADCASTS

Event bus emission standards for external monitoring.

- **`subagents:ready`** — Boot sequence complete.
- **`subagents:scheduler_ready`** — Job registry loaded.
- **`subagents:started`** — Execution unblocked.
- **`subagents:completed`** — Clean termination.
- **`subagents:failed`** — Unclean fault.
- **`subagents:compacted`** — Buffer compaction cycle execution.
- **`subagents:record`** — Persistent memory write.

### // SECURITY CONSTRAINTS

- **Rate execution limits:** Hard throttle at 10/min per ID for destructive parameters.
- **Authentication checks:** `authProvider` overrides explicit payload identifiers.
- **Read-only execution:** Symbol mapping provides immutable pointers to memory maps.
- **Model boundary enforcement:** String resolution blocks external credential injections.
