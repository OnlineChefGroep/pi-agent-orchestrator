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
