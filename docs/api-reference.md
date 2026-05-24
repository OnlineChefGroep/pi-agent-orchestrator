# API Reference

> Publieke API surface van `@onlinechef/pi-subagents`. Private internals (`AgentFieldParser`, `PermissionUtils`, etc.) zijn bewust buiten scope — gebruik de publieke functies.

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
import { registerHook } from "@onlinechef/pi-subagents";

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
