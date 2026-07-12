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
  tracingEnabled?: boolean;           // Master switch for OpenTelemetry span emission in agent-runner (default: true). When false, every span helper in telemetry-otel.ts short-circuits to a shared no-op span.
  animationStyle?: "braille" | "dots" | "lines" | "classic" | "none";  // Spinner style (default: "braille")
  uiStyle?: "premium" | "retro" | "plain";  // UI theme (default: "premium")
  showActivityStream?: boolean;        // Show real-time activity stream in widget (default: true)
  showTokenUsage?: boolean;            // Show token usage and context fill percentage (default: true)
  showTurnProgress?: boolean;          // Show turn progress (current/max) for running agents (default: true)
  orchestrationMode?: "auto" | "single" | "swarm" | "crew";  // Execution topology (default: "auto")
  dashboardRefreshInterval?: number;   // Dashboard refresh interval in ms (default: 750, min: 100, max: 60000)
  sessionMaxSpawns?: number;           // Guardrail: max agents spawned per session
  sessionMaxTurns?: number;            // Guardrail: max cumulative turns per session
  promptCompressionLevel?: PromptCompressionLevel;  // "minimal" | "balanced" | "aggressive" (default: "balanced")
  debugCapture?: boolean;               // **OFF BY DEFAULT.** Master switch for the offline capture sink (default: false). Captures agent events, errors + stacks, schedule executions, RPC audit, and per-agent metrics to a local folder. See the `### DEBUG CAPTURE` section below.
  debugCapturePaths?: DebugCapturePathOverrides;  // Override the two capture roots (default: `<cwd>/.pi/subagent-debug` + `<agent-dir>/subagent-debug`). Absolute paths only; failed validation is silently dropped at enable-time (does not crash startup).
}
```

### `PromptCompressionLevel`

**FILE:** `src/types.ts`

Selects one of three static instruction variants. This setting does not summarize conversation history, compact inherited context, rewrite task prompts, or compress custom-agent prompt bodies.

| Level | Behavior |
|---|---|
| `"minimal"` | Minimal compression: the most explicit read-only and handoff guidance. |
| `"balanced"` | Concise guidance with examples and field descriptions. Default. |
| `"aggressive"` | The shortest read-only guidance and a minimal handoff schema. |

**SCOPE:**
- Regenerates the read-only warning and tool-usage sections for the built-in `Explore`, `Plan`, and `Analysis` agents.
- Changes the handoff instruction block for agents with `handoff: true`.
- Does not change built-in additional workflow sections, parent context, inherited system prompts, task prompts, memory, skills, tool schemas, or custom-agent prompt bodies.
- For a custom agent with the default `handoff: false`, `prompt_compression` currently has no effect on its body.
- For append-mode agents, only an enabled handoff block varies.

**PRECEDENCE:** Per-agent frontmatter `prompt_compression` > global `promptCompressionLevel` setting > default `"balanced"`.

**MEASUREMENT:** Existing UI figures compare static character counts and use a rough characters-to-tokens estimate. They are not exact tokenizer measurements and must not be interpreted as a fixed percentage reduction for a complete request. Measure real workloads with provider-reported input usage or runner telemetry.

**PERSISTENCE:** Stored in `.pi/subagents.json` and managed via `SettingsAppliers.setPromptCompressionLevel`.

See [`prompt-compression.md`](prompt-compression.md) for the scope matrix, quality/safety trade-offs, and measurement guidance.

### `saveAndEmitChanged(settings: SubagentsSettings): void`

**FILE:** `src/settings.ts`

Persists configuration map to block storage and triggers state reload.

### `SettingsGetters`

**FILE:** `src/settings.ts`

Read-side accessors for the settings that the `/agents` menu can change at runtime. The menu uses these to display "current:" labels and `buildSettingsSnapshot` reads from them when persisting the next state. Mirrors the runtime contract that `index.ts` exposes to the menu — keep the two in sync when adding a new menu-editable setting.

```ts
interface SettingsGetters {
  getDefaultMaxTurns: () => number | undefined;
  getGraceTurns: () => number;
  getDefaultJoinMode: () => JoinMode;
  isSchedulingEnabled: () => boolean;
  isTracingEnabled: () => boolean;
}
```

### `SettingsSetters`

**FILE:** `src/settings.ts`

Write-side counterpart to `SettingsGetters`. The `/agents` menu calls these after each user mutation. The setter shape diverges slightly from `SettingsAppliers` because the menu accepts a wider input (e.g. `undefined` for defaultMaxTurns to mean "unmark the default" — a value that `applySettings` would never feed in).

```ts
interface SettingsSetters {
  setDefaultMaxTurns: (n: number | undefined) => void;
  setGraceTurns: (n: number) => void;
  setDefaultJoinMode: (mode: JoinMode) => void;
  setSchedulingEnabled: (b: boolean) => void;
  setTracingEnabled: (b: boolean) => void;
}
```
