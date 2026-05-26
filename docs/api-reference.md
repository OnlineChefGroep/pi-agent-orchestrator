# API Reference

> Publieke API surface van `@onlinechefgroep/pi-subagents`. Private internals (`AgentFieldParser`, `PermissionUtils`, etc.) zijn bewust buiten scope — gebruik de publieke functies.

---

## Extension Entry Point

### `registerCommands(api: ExtensionAPI): void`

**File:** `src/index.ts`

Registers the `/agents` slash command and hooks into the pi-coding-agent lifecycle. Called once during extension load.

### `initSubagents(api: ExtensionAPI): void`

**File:** `src/index.ts`

Initializes the subagent system: loads custom agents, sets up the widget, and registers lifecycle hooks.

---

## Agent Registry

### `reloadCustomAgents(projectDir: string): void`

**File:** `src/agent-registry.ts`

Reloads all `.pi/agents/*.md` files from both the project directory and the user's global agent directory. Call this after creating or editing a custom agent file.

```ts
reloadCustomAgents(process.cwd());
```

### `getAgentConfig(name: string): AgentConfig | undefined`

**File:** `src/agent-types.ts`

Returns the fully resolved agent configuration including inherited permissions. Priority: custom agents → default agents.

### `getAllTypes(): string[]`

**File:** `src/agent-types.ts`

Returns all registered agent type names (defaults + custom + built-in types).

---

## Agent Runner

### `createSubagent(options: SubagentOptions): Promise<AgentSession>`

**File:** `src/agent-runner.ts`

Creates and starts a new subagent session. This is the primary API for spawning agents programmatically.

```ts
interface SubagentOptions {
  type: string;              // "general-purpose", "Explore", custom name, etc.
  description: string;         // Human-readable task description
  parentSession?: AgentSession; // Optional parent for context inheritance
  model?: string;              // Override default model
  maxTurns?: number;           // Override default max turns
  joinMode?: JoinMode;         // "await" | "fire-and-forget" | "notify"
  contextMode?: boolean;       // Enable ctx_* sandbox tools
  level?: number;              // Recursion depth (default 0)
}
```

### `steerAgent(session: AgentSession, instruction: string): void`

**File:** `src/agent-runner.ts`

Sends a steering instruction to a running agent session. Used for mid-flight course correction.

### `getAgentConversation(sessionId: string): CompactableMessage[]`

**File:** `src/agent-runner.ts`

Retrieves the full conversation history of a completed or running agent.

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

### `registerHook(event: HookEvent, handler: HookHandler): () => void`

**File:** `src/hooks.ts`

Registers a lifecycle hook handler. Returns an unsubscribe function.

```ts
import { registerHook } from "@onlinechefgroep/pi-subagents";

const unsubscribe = registerHook("subagent:start", async (payload) => {
  console.log(`Agent ${payload.agentId} started`);
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

### `buildParentContext(parentSession: AgentSession): Message[]`

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
  maxConcurrent: number;        // Max parallel agents (default 3)
  defaultMaxTurns: number;      // 0 = unlimited
  graceTurns: number;           // Turns after wrap-up steer (default 3)
  defaultJoinMode: JoinMode;    // "await" | "fire-and-forget" | "notify"
  schedulingEnabled: boolean;     // Enable cron jobs
  animationStyle: "dots" | "line" | "minimal";
  uiStyle: "premium" | "retro" | "plain" | "cinematic";
}
```

### `saveAndEmitChanged(settings: SubagentsSettings): void`

**File:** `src/settings.ts`

Persists settings to disk and emits a change event for listeners.

---

## Types

### `AgentConfig`

**File:** `src/types.ts`

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

**File:** `src/types.ts`

Runtime state of an agent invocation:

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

**File:** `src/types.ts`

- `"await"` — Wait for completion, return result to parent
- `"fire-and-forget"` — Spawn and immediately return
- `"notify"` — Spawn, return immediately, notify parent on completion

---

## Custom Agent Loading

### `loadCustomAgents(dir: string): Map<string, AgentConfig>`

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
