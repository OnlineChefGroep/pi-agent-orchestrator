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
  maxConcurrent: number;        // Process threshold (default 3)
  defaultMaxTurns: number;      // Integer limit (0 = disabled)
  graceTurns: number;           // Terminate allowance (default 3)
  defaultJoinMode: JoinMode;    // Topology mode
  schedulingEnabled: boolean;   // Cron toggle
  animationStyle: "dots" | "line" | "minimal";
  uiStyle: "premium" | "retro" | "plain" | "cinematic";
}
```

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

- `"await"` — Synchronous block, wait for return payload.
- `"fire-and-forget"` — Asynchronous fork, detached execution.
- `"notify"` — Asynchronous fork, transmit payload to parent on termination.

---

## // CUSTOM AGENT INGESTION

### `loadCustomAgents(dir: string): Map<string, AgentConfig>`

**FILE:** `src/custom-agents.ts`

Ingests markdown definitions, parsing YAML frontmatter into memory constraints. Validates identifiers and nullifies injection primitives.

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
