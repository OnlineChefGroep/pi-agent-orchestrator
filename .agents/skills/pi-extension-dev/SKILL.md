---
name: pi-extension-dev
description: "Develop and debug pi extensions that run inside the pi coding agent host. Covers extension registration, command handlers, tool implementations, cross-extension RPC, and host platform integration. Use when building pi extensions, debugging extension load issues, or working with ExtensionAPI and AgentManager."
---

# pi Extension Development

This skill covers VS Code extension development for the pi coding agent host platform.

## Project Architecture

This extension (`@onlinechefgroep/pi-agent-orchestrator`) runs inside the pi host, not standalone.

```
pi-coding-agent host
├── ExtensionAPI (provided by host)
│   ├── createAgentSession()
│   ├── registerCommand()
│   └── events bus
└── This Extension (loaded via pi.extensions in package.json)
    ├── src/index.ts (entry point)
    ├── Commands (/agents, /hooks)
    ├── Tools (spawn, get-result, steer)
    └── UI (dashboard, widget)
```

## Entry Point

`src/index.ts` registers the extension:

```typescript
export function registerCommands(api: ExtensionAPI): void {
  // Register /agents command
  // Register lifecycle hooks
  // Initialize subsystems
}

export function initSubagents(api: ExtensionAPI): void {
  // Load custom agents
  // Setup widget
  // Register hooks
}
```

**package.json entry:**

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

**Never import directly from host packages:**

```typescript
// Correct: Feature detection
const piAi = (globalThis as any)["@earendil-works/pi-ai"];
if (piAi) { /* use feature */ }

// Incorrect: Direct import
import { something } from "@earendil-works/pi-ai";
```

See `src/context-mode-bridge.ts` for the pattern.

## Peer Dependencies

The three host packages are **never direct dependencies**:

```json
{
  "peerDependencies": {
    "@earendil-works/pi-ai": ">=0.72.0",
    "@earendil-works/pi-coding-agent": ">=0.72.0",
    "@earendil-works/pi-tui": "^0.78.0"
  }
}
```

They are the host platform (the parent pi coding agent).

## Command Registration

Commands in `src/commands/`:

```typescript
// src/commands/agents.ts
export function registerAgentsCommand(api: ExtensionAPI): void {
  api.registerCommand("/agents", async (context, args) => {
    // Handle /agents <subcommand>
  });
}
```

**Subcommands:**
- `/agents` - Open dashboard
- `/agents spawn <type>` - Spawn agent
- `/agents list` - List agents
- `/agents settings` - Open settings menu
- `/agents top` - Resource usage view

## Tool Implementation

Tools in `src/tools/`:

```typescript
// src/tools/agent.ts
export function registerAgentTools(api: ExtensionAPI): void {
  api.registerTool("spawn_agent", async (params) => {
    // Implementation
  });
}
```

**Built-in tools:**
- `spawn_agent` - Create sub-agent session
- `get_subagent_result` - Retrieve agent output
- `steer_agent` - Send message to running agent
- `list_agents` - List active agents
- `get_agent_history` - Get conversation log

## Cross-Extension RPC

`src/cross-extension-rpc.ts` provides inter-extension communication:

```typescript
// Standardized request-reply over pi.events bus
const reply = await rpcCall("subagents:rpc:spawn", {
  type: "Explore",
  prompt: "Investigate..."
});
```

**Protocol version:** 2

**Endpoints:**
- `subagents:rpc:ping` - Health check
- `subagents:rpc:spawn` - Fork agent from another extension (rate limit: 10/min)
- `subagents:rpc:stop` - Interrupt agent (rate limit: 10/min)

**Symbol registry:**
- `Symbol.for("pi-subagents:manager")` - Read-only agent manager access
- `Symbol.for("pi-subagents:hooks")` - Hook handler enumeration

## Lifecycle Events

Events broadcast on `pi.events`:

- `subagents:ready` - Boot complete
- `subagents:scheduler_ready` - Jobs loaded
- `subagents:started` - Agent spawn
- `subagents:completed` - Clean termination
- `subagents:failed` - Error termination
- `subagents:compacted` - Context compaction
- `subagents:record` - State persistence write

## Context Mode Bridge

`src/context-mode-bridge.ts` gates sandbox tools behind feature detection:

```typescript
// ctx_read, ctx_write, ctx_list only available when
// @onlinechef/context-mode peer dep is present
if (hasContextMode) {
  // Register sandbox tools
}
```

## Settings System

Settings persist to `.pi/subagents.json`:

```typescript
interface SubagentsSettings {
  maxConcurrent?: number;           // Default: 4
  maxAgentsPerSession?: number;   // Session spawn cap
  maxTotalTurnsPerSession?: number;
  defaultMaxTurns?: number;       // 0 = unlimited
  graceTurns?: number;            // Default: 5
  defaultJoinMode?: JoinMode;       // "smart"
  schedulingEnabled?: boolean;    // Default: true
  animationStyle?: string;         // "braille" | "dots" | ...
  uiStyle?: string;                // "premium" | "retro" | ...
  promptCompressionLevel?: PromptCompressionLevel;
  // ... more fields
}
```

## Common Tasks

### Adding a New Command

1. Create file in `src/commands/`
2. Register in `src/index.ts`
3. Add to output handler for menu display
4. Update `docs/api-reference.md`

### Adding a New Tool

1. Create file in `src/tools/`
2. Register in `src/index.ts`
3. Add tool description for agent config
4. Update settings if tool has config options

### Debugging Extension Load

1. Check `pi.extensions` in package.json points to correct file
2. Verify peer dependency versions are compatible
3. Check host console for load errors
4. Verify entry file exports `registerCommands` and `initSubagents`

### Publishing

Published to GitHub Packages, not npmjs:

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

## Extension Lifecycle

### Load Sequence

```
pi host starts
    ↓
Read package.json → pi.extensions
    ↓
Dynamic import("./src/index.ts")
    ↓
Call registerCommands(api)
    ↓
Call initSubagents(api)
    ↓
Extension ready → emit "subagents:ready"
```

### Shutdown Sequence

```
Host signals shutdown
    ↓
Dispose all active agents
    ↓
Cancel pending schedules
    ↓
Unregister RPC handlers
    ↓
Emit "subagents:shutdown"
    ↓
Unload extension
```

## ExtensionAPI Interface

```typescript
interface ExtensionAPI {
  // Agent management
  createAgentSession(config: AgentConfig): AgentSession;

  // Command registration
  registerCommand(name: string, handler: CommandHandler): void;

  // Tool registration
  registerTool(name: string, handler: ToolHandler): void;

  // Event bus
  events: EventBus;

  // Context
  getContext(): ExtensionContext;

  // UI
  registerComponent(component: Component): void;
}
```

## Command Handler Pattern

```typescript
// src/commands/agents.ts
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function registerAgentsCommand(api: ExtensionAPI): void {
  api.registerCommand("/agents", async (context: ExtensionCommandContext, args: string[]) => {
    const [subcommand, ...rest] = args;

    switch (subcommand) {
      case "spawn":
        return handleSpawn(context, rest);
      case "list":
        return handleList(context);
      case "settings":
        return handleSettings(context);
      case "top":
        return handleTop(context);
      case undefined:
        // No subcommand → open dashboard
        return openDashboard(context);
      default:
        return { text: `Unknown subcommand: ${subcommand}` };
    }
  });
}
```

## Tool Handler Pattern

```typescript
// src/tools/agent.ts
import type { ToolParams } from "../types.js";

export function registerAgentTools(api: ExtensionAPI): void {
  api.registerTool("spawn_agent", async (params: ToolParams) => {
    const { type, prompt, maxTurns = 0 } = params;

    // Validate
    if (!type || typeof type !== "string") {
      return { error: "Missing required parameter: type" };
    }

    // Execute
    const agentId = await spawnAgent({ type, prompt, maxTurns });

    // Return
    return {
      agentId,
      status: "spawned",
    };
  });
}
```

## Event Bus Patterns

### Subscribe to Events

```typescript
const unsubscribe = api.events.on("subagent:completed", (payload) => {
  console.log(`Agent ${payload.agentId} completed`);
});

// Cleanup on shutdown
unsubscribe();
```

### Emit Custom Events

```typescript
api.events.emit("my-extension:event", {
  type: "custom",
  data: { foo: "bar" },
});
```

### Event Registry

| Event | Payload | When |
|-------|---------|------|
| `subagents:ready` | `{ timestamp: number }` | Extension boot complete |
| `subagents:scheduler_ready` | `{ jobCount: number }` | Jobs loaded |
| `subagents:started` | `{ agentId: string }` | Agent spawned |
| `subagents:completed` | `{ agentId: string, result: unknown }` | Clean termination |
| `subagents:failed` | `{ agentId: string, error: string }` | Error termination |
| `subagents:compacted` | `{ agentId: string, linesRemoved: number }` | Context compaction |
| `subagents:record` | `{ agentId: string, state: AgentRecord }` | State persistence write |
| `subagents:stopped` | `{ agentId: string }` | Agent stopped by user |
| `subagents:steered` | `{ agentId: string, message: string }` | Agent steered |

## Context Mode Bridge

### Feature Detection

```typescript
// src/context-mode-bridge.ts
const hasContextMode = Boolean(
  (globalThis as any)["@onlinechef/context-mode"]
);

if (hasContextMode) {
  // Register sandbox tools (ctx_read, ctx_write, ctx_list)
  registerSandboxTools(api);
} else {
  // Graceful degradation
  console.log("Context mode not available, skipping sandbox tools");
}
```

### Peer Dependency Pattern

```typescript
// NEVER import directly from host packages
// import { something } from "@earendil-works/pi-ai"; // WRONG

// DO use feature detection
const piAi = (globalThis as any)["@earendil-works/pi-ai"];
if (piAi) {
  // Use feature safely
}
```

## Settings Integration

### Adding a New Setting

```typescript
// 1. Update interface in src/settings.ts
interface SubagentsSettings {
  // ... existing settings
  myNewSetting?: string;    // New setting
}

// 2. Update defaults
const defaultSettings: Required<SubagentsSettings> = {
  // ... existing defaults
  myNewSetting: "default-value",
};

// 3. Update validation
function validateSettings(settings: unknown): SubagentsSettings {
  // ... existing validation
  if ("myNewSetting" in settings) {
    // Validate type
  }
}

// 4. Update buildSettingsSnapshot in src/output-handler.ts
function buildSettingsSnapshot(settings: SubagentsSettings) {
  return {
    // ... existing fields
    myNewSetting: settings.myNewSetting ?? "default-value",
  };
}

// 5. Add to settings menu
function renderSettingsMenu() {
  return [
    // ... existing items
    { key: "myNewSetting", label: "My New Setting", value: settings.myNewSetting },
  ];
}

// 6. Update docs/api-reference.md
```

## Debugging Extension Issues

### Extension Not Loading

```
1. Check package.json → pi.extensions points to correct file
2. Verify entry file exists and exports registerCommands + initSubagents
3. Check peer dependency versions are compatible
4. Look for TypeScript compilation errors: npx tsc --noEmit
5. Check host console for load errors
```

### Command Not Found

```
1. Verify registerCommand() was called during init
2. Check command name matches exactly ("/agents" not "/Agents")
3. Ensure command handler doesn't throw during registration
4. Check if another extension registered same command
```

### Tool Not Available

```
1. Verify registerTool() was called
2. Check tool name matches agent config
3. Ensure tool handler is async (returns Promise)
4. Check tool permissions in agent-types.ts
```

### RPC Call Failing

```
1. Check both extensions loaded successfully
2. Verify event bus is connected
3. Check rate limits not exceeded
4. Verify protocol version compatibility
5. Check authentication/authorization
```

### Settings Not Persisting

```
1. Check saveSettings() is called after mutation
2. Verify .pi/subagents.json is writable
3. Check if project-level or global settings are being used
4. Verify JSON is valid (no circular references)
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module` | Missing `.js` extension | Add `.js` to import |
| `is not a function` | Using jest.fn() instead of vi.fn() | Import from vitest |
| `Cannot read properties of undefined` | Mock not set up | Add vi.mock() |
| `Extension not found` | pi.extensions path wrong | Check package.json |
| `Command already registered` | Double registration | Guard with flag |
| `Rate limit exceeded` | Too many RPC calls | Add delays or batch |
| `Unauthorized` | Missing auth | Check caller identity |
| `Context too large` | Too much history | Use compression |

## Publishing Checklist

```bash
# 1. Run full verification
npm run typecheck && npm run lint && npm test

# 2. Build
npm run build

# 3. Verify dist/ exists and is correct
ls dist/

# 4. Bump version
npm version patch  # or minor, major

# 5. Publish to GitHub Packages
npm publish

# 6. Verify package is available
npm view @onlinechefgroep/pi-agent-orchestrator versions
```

**Registry config:**
```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

**Authentication:**
```bash
# Login to GitHub Packages
npm login --registry=https://npm.pkg.github.com
# Use personal access token with `read:packages` and `write:packages`
```

## When to Use This Skill

Invoke this skill when:
- User mentions "extension", "pi extension", or "ExtensionAPI"
- User mentions "command", "/agents", or "registerCommand"
- User mentions "tool", "spawn_agent", or "registerTool"
- User mentions "RPC", "cross-extension", or "pi.events"
- User is debugging extension load or host integration
- User wants to add new commands or tools
- User wants to publish or version the extension
- User mentions "feature detection" or "peer dependencies"
- User mentions "context mode" or "sandbox tools"
- User wants to add a new setting
- User mentions "extension lifecycle" or "shutdown"
