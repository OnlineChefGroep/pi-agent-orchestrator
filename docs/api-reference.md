# API Reference

> Public API surface of `@onlinechefgroep/pi-agent-orchestrator`. This extension runs inside the Pi host — most integration happens via registered tools, slash commands, lifecycle events, and the cross-extension RPC protocol documented below.

---

## Extension Entry Point

### Default export: `(pi: ExtensionAPI) => Promise<void>`

**File:** `src/index.ts`

The Pi host loads this extension via `package.json` → `pi.extensions`. On load it:

1. Applies persisted settings from `~/.pi/agent/subagents.json` and `.pi/subagents.json`.
2. Reloads custom agents from `.pi/agents/*.md`.
3. Registers tools: `Agent`, `get_subagent_result`, `steer_subagent`.
4. Registers commands: `/agents`, `/hooks`.
5. Wires lifecycle hooks, the agent dashboard widget, scheduler, and RPC handlers.

There is no separate `registerCommands()` or `initSubagents()` export — initialization happens inside the default-export function.

---

## Agent Registry

### `reloadCustomAgents(): Promise<void>`

**File:** `src/agent-registry.ts`

Reloads all `.pi/agents/*.md` files from both the project directory and the user's global agent directory. Call this after creating or editing a custom agent file.

```ts
await reloadCustomAgents();
```

### `getAgentConfig(name: string): AgentConfig | undefined`

**File:** `src/agent-types.ts`

Returns the fully resolved agent configuration including inherited permissions. Priority: custom agents → default agents.

### `getAllTypes(): string[]`

**File:** `src/agent-types.ts`

Returns all registered agent type names (defaults + custom + built-in types).

---

## Agent Runner

### `runAgent(options: RunOptions): Promise<RunResult>`

**File:** `src/agent-runner.ts`

Creates and runs a subagent session. This is the primary programmatic entry point for spawning agents from within the extension.

Key `RunOptions` fields:

```ts
interface RunOptions {
  type: string;              // "general-purpose", "Explore", custom name, etc.
  description: string;       // Human-readable task description
  parentId?: string;         // Parent agent for context inheritance
  model?: string;            // Override default model
  maxTurns?: number;         // Override default max turns (0 = unlimited)
  joinMode?: JoinMode;       // "async" | "group" | "smart" | "swarm"
  inheritContext?: boolean;
  runInBackground?: boolean;
  isolated?: boolean;
  levelLimit?: number;       // Recursion depth cap (default 5)
  taskBudget?: number;       // Max recursive spawns from this agent
}
```

### `steerAgent(record: AgentRecord, instruction: string): Promise<void>`

**File:** `src/agent-runner.ts`

Sends a steering instruction to a running agent session. Used for mid-flight course correction.

### `getAgentConversation(session: AgentSession): string`

**File:** `src/agent-runner.ts`

Retrieves the full conversation history of a completed or running agent as plain text.

### `getDefaultMaxTurns(): number | undefined`

**File:** `src/agent-runner.ts`

Returns the configured default max turns (undefined = unlimited).

### `getGraceTurns(): number`

**File:** `src/agent-runner.ts`

Returns the number of grace turns after wrap-up steer before forced termination.

---

## Scheduling

### `SubagentScheduler`

**File:** `src/schedule.ts`

Manages cron-like recurring agent jobs.

```ts
const scheduler = new SubagentScheduler(api, manager);

// Schedule a job
scheduler.schedule({
  agentType: "Explore",
  description: "Daily codebase scan",
  cron: "0 9 * * *",  // 9 AM daily
  enabled: true,
});

// List all jobs
const jobs = scheduler.listJobs();

// Cancel a job
scheduler.cancel(jobId);
```

---

## Hooks

### `HookRegistry`

**File:** `src/hooks.ts`

Lifecycle hooks are managed by a `HookRegistry` instance created during extension init. End users register hooks via the `/hooks` command UI. Other extensions can observe hooks read-only via `Symbol.for("pi-subagents:hooks")`.

```ts
// Internal pattern (not a package-level export):
const registry = new HookRegistry();
registry.register("subagent:start", async (payload) => {
  return "allow"; // "allow" | "block" | "modify"
});
```

**Hook events:**
- `subagent:start` — Before agent begins execution
- `subagent:end` — After agent completes
- `subagent:error` — On uncaught error
- `subagent:spawn` — When child agent is spawned
- `subagent:steer` — When steering instruction is sent
- `tool:call` — Before a tool is invoked
- `tool:result` — After a tool returns
- `compaction:start` / `compaction:end`
- `turn:start` / `turn:end`

---

## Context

### `buildParentContext(ctx: ExtensionContext): string`

**File:** `src/context.ts`

Builds a context injection from the parent agent's conversation for the child agent. Enables chain-of-thought continuity.

### `extractText(content: unknown): string`

**File:** `src/context.ts`

Extracts plain text from a message content block (handles string, array, and object shapes).

---

## Settings

### `SubagentsSettings`

**File:** `src/settings.ts`

```ts
interface SubagentsSettings {
  maxConcurrent?: number;
  maxAgentsPerSession?: number;
  maxTotalTurnsPerSession?: number;
  defaultMaxTurns?: number;       // 0 = unlimited
  graceTurns?: number;
  defaultJoinMode?: JoinMode;     // "async" | "group" | "smart" | "swarm"
  schedulingEnabled?: boolean;
  animationStyle?: "braille" | "dots" | "lines" | "classic" | "none";
  uiStyle?: "premium" | "retro" | "plain" | "cinematic";
  cinematicEnabled?: boolean;
  showActivityStream?: boolean;
  showTokenUsage?: boolean;
  showTurnProgress?: boolean;
  orchestrationMode?: "auto" | "single" | "swarm" | "crew";
  dashboardRefreshInterval?: number;  // ms, 100–60000
  sessionMaxSpawns?: number;
  sessionMaxTurns?: number;
}
```

### `saveAndEmitChanged(snapshot, successMsg, emit, cwd?): { message, level }`

**File:** `src/settings.ts`

Persists settings to `.pi/subagents.json` and emits a `subagents:settings_changed` event.

---

## Types

### `AgentConfig`

**File:** `src/types.ts`

```ts
interface AgentConfig {
  name: string;
  displayName?: string;
  description: string;
  builtinToolNames?: string[];
  disallowedTools?: string[];
  extensions: true | string[] | false;
  skills: true | string[] | false;
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  systemPrompt: string;
  promptMode: "replace" | "append";
  inheritContext?: boolean;
  runInBackground?: boolean;
  isolated?: boolean;
  memory?: "user" | "project" | "local";
  isolation?: "worktree";
  useContextMode?: boolean;
  enabled?: boolean;
}
```

### `AgentRecord`

**File:** `src/types.ts`

Runtime state of an agent invocation:

```ts
interface AgentRecord {
  id: string;
  type: string;
  description: string;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error";
  spawnedAt: number;
  startedAt: number;
  completedAt?: number;
  toolUses: number;
  currentLevel: number;
  compactionCount: number;
}
```

### `JoinMode`

**File:** `src/types.ts`

- `"async"` — Spawn and return immediately; parent is notified on completion
- `"group"` — Batch coordination: agents in a group complete together
- `"smart"` — Adaptive join based on task characteristics
- `"swarm"` — Live collaborative swarm with dynamic join/leave

---

## Custom Agent Loading

### `loadCustomAgents(cwd: string): Promise<Map<string, AgentConfig>>`

**File:** `src/custom-agents.ts`

Loads all `.md` files from the given directory and parses their frontmatter into `AgentConfig` objects. Validates names, tool names, and checks for prompt injection patterns.

**Security note:** Symlinks are skipped to prevent directory traversal.

---

## Conversation Viewer

### `ConversationViewer`

**File:** `src/ui/conversation-viewer.ts`

TUI component for live viewing an agent's conversation stream. Used by the "View conversation" menu option.

```ts
const viewer = new ConversationViewer(tui, session, record, activity, theme);
viewer.render(width, height); // Returns string[] lines
```

---

## Usage Tracking

### `getLifetimeTotal(usage?: LifetimeUsage): number`

**File:** `src/usage.ts`

Returns total tokens consumed across all sessions.

### `getSessionContextPercent(session?: SessionLike): number`

**File:** `src/usage.ts`

Returns the percentage of the model's context window currently in use (0–100).

---

## Cross-Extension RPC

### Protocol Overview

**File:** `src/cross-extension-rpc.ts`

The subagents extension exposes a request-reply RPC protocol over the pi.events event bus, allowing other extensions to spawn and control agents without direct coupling.

**Protocol version:** `2` (bumped when envelope or method contracts change)

Mutating RPC calls (`spawn`, `stop`) are authenticated by the host integration when `registerRpcHandlers()` is configured with `authProvider(requestId)`. In that mode, request payload identity is ignored; the provider is the only trusted source of `extensionId`. If no auth provider is configured, the handler keeps legacy in-process compatibility and uses the synthetic `legacy` identity for rate limiting.

### RPC Reply Envelope

All RPC responses follow the pi-mono convention:

```ts
type RpcReply<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };
```

### RPC Methods

#### `subagents:rpc:ping`

Health check endpoint. Returns the current protocol version.

**Request:** `{ requestId: string }`

**Reply:** `{ success: true; data: { version: number } }`

**Example:**
```ts
const requestId = crypto.randomUUID();
pi.events.emit("subagents:rpc:ping", { requestId });

pi.events.once(`subagents:rpc:ping:reply:${requestId}`, (reply) => {
  if (reply.success) {
    console.log(`Protocol version: ${reply.data.version}`);
  }
});
```

#### `subagents:rpc:spawn`

Spawn a new agent from another extension.

**Request:**
```ts
{
  requestId: string;
  type: string;           // Agent type (e.g., "general-purpose", "Explore")
  prompt: string;         // Task description
  options?: {
    model?: string;       // Model override (provider/modelId or fuzzy name)
    maxTurns?: number;
    isolated?: boolean;
    inheritContext?: boolean;
    // ... other Agent tool options
  };
}
```

**Reply:** `{ success: true; data: { id: string } }` or `{ success: false; error: string }`

**Authentication:** when `authProvider` is configured, `authProvider(requestId)` must return `{ extensionId }`; otherwise the request fails with `Unauthorized RPC request`.

**Rate limiting:** 10 spawn requests per minute per authenticated extension ID.

**Example:**
```ts
const requestId = crypto.randomUUID();
pi.events.emit("subagents:rpc:spawn", {
  requestId,
  type: "Explore",
  prompt: "Search for TODO comments in src/",
  options: { maxTurns: 10 },
});

pi.events.once(`subagents:rpc:spawn:reply:${requestId}`, (reply) => {
  if (reply.success) {
    console.log(`Agent spawned with ID: ${reply.data.id}`);
  } else {
    console.error(`Spawn failed: ${reply.error}`);
  }
});
```

#### `subagents:rpc:stop`

Abort a running agent.

**Request:** `{ requestId: string; agentId: string }`

**Reply:** `{ success: true }` or `{ success: false; error: string }`

**Authentication:** same as `spawn`. A stop request from an unauthenticated caller is rejected when `authProvider` is configured.

**Rate limiting:** 10 stop requests per minute per authenticated extension ID.

**Example:**
```ts
const requestId = crypto.randomUUID();
pi.events.emit("subagents:rpc:stop", { requestId, agentId: "agent-123" });

pi.events.once(`subagents:rpc:stop:reply:${requestId}`, (reply) => {
  if (!reply.success) {
    console.error(`Stop failed: ${reply.error}`);
  }
});
```

### Global Symbol Registry

The extension exposes read-only APIs via `globalThis[Symbol.for(...)]` for cross-package discovery:

#### `Symbol.for("pi-subagents:manager")`

Read-only manager access for querying agent state:

```ts
const manager = (globalThis as any)[Symbol.for("pi-subagents:manager")];

// Wait for all running agents to complete
await manager.waitForAll();

// Check if any agents are running
const hasRunning = manager.hasRunning();

// Get safe record metadata (no sensitive data)
const record = manager.getRecord("agent-123");
// Returns: { id, type, status, description } or undefined

// List agent IDs by type
const ids = manager.listAgentIds("Explore");
```

**Security note:** Only read-only methods are exposed. No `spawn`, `listAgents`, or mutation methods.

#### `Symbol.for("pi-subagents:hooks")`

Read-only hook registry access for discovering registered handlers:

```ts
const hooks = (globalThis as any)[Symbol.for("pi-subagents:hooks")];

// Get all registered hook handlers
const handlers = hooks.getHandlers();
// Returns: Map<HookEvent, HookHandler[]>
```

**Security note:** No `register`, `unregister`, or `dispatch` methods are exposed.

### Lifecycle Events

The extension emits the following events on `pi.events` for telemetry and cross-extension coordination:

#### `subagents:ready`

Broadcast when the extension is fully initialized and ready to handle RPC calls.

**Payload:** `{}`

#### `subagents:scheduler_ready`

Emitted when the scheduler is active and has loaded persisted jobs.

**Payload:** `{ sessionId: string; jobCount: number }`

#### `subagents:started`

Emitted when an agent transitions to running state (including from queue).

**Payload:** `{ id: string; type: string; description: string }`

#### `subagents:completed`

Emitted when an agent completes successfully.

**Payload:**
```ts
{
  id: string;
  type: string;
  description: string;
  result?: string;
  status: "completed";
  toolUses: number;
  durationMs: number;
  tokens?: { input: number; output: number; total: number };
}
```

#### `subagents:failed`

Emitted when an agent errors, stops, or is aborted.

**Payload:** Same as `subagents:completed`, plus `error?: string`.

#### `subagents:compacted`

Emitted when an agent's session compacts (preserves conversation count).

**Payload:**
```ts
{
  id: string;
  type: string;
  description: string;
  reason: string;
  tokensBefore: number;
  compactionCount: number;
}
```

#### `subagents:record`

Emitted on agent completion and persisted to pi's entry log for cross-session history reconstruction.

**Payload:**
```ts
{
  id: string;
  type: string;
  description: string;
  status: string;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}
```

### Security Considerations

- **Rate limiting:** Mutating RPC calls are rate-limited to 10 per minute per authenticated extension ID and operation.
- **Authentication:** When an `authProvider` is configured, RPC identity comes from `authProvider(requestId)`. Payload-provided identity is ignored.
- **Read-only globals:** Symbol registry exposes only read-only APIs; mutation methods are intentionally omitted.
- **Model resolution:** RPC callers can specify models as strings; the extension resolves them to Model instances to avoid auth errors.
