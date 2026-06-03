# index.ts God-Object Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1135-line `src/index.ts` god-object into focused command/tool modules, reducing it to ~370 lines of setup + registration.

**Architecture:** Extract tool definitions (`Agent`, `get_subagent_result`, `steer_subagent`) and command handlers (`agents`, `hooks`) into separate modules. Each module exports a factory function that receives a `ToolContext` object containing all dependencies from the extension closure. The `index.ts` retains setup, wiring, and registration calls.

**Tech Stack:** TypeScript 6.0, vitest, Biome, ESM modules

---

## File Impact Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tools/context.ts` | Create | `ToolContext` interface — shared dependency bag |
| `src/tools/agent.ts` | Create | Agent tool definition + execute handler |
| `src/tools/get-result.ts` | Create | get_subagent_result tool definition |
| `src/tools/steer.ts` | Create | steer_subagent tool definition |
| `src/commands/agents.ts` | Create | `/agents` command handler |
| `src/commands/hooks.ts` | Create | `/hooks` command handler |
| `src/index.ts` | Modify | Retain setup + import/register extracted modules |

---

### Task 1: Create ToolContext interface

**Files:**
- Create: `src/tools/context.ts`

- [ ] **Step 1: Create the ToolContext interface**

```typescript
// src/tools/context.ts
/**
 * Shared dependency bag for tool and command modules.
 * Constructed once in index.ts and passed to each factory function.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import type { BatchOrchestrator } from "../batch-orchestrator.js";
import type { HookRegistry } from "../hooks.js";
import type { SubagentScheduler } from "../schedule.js";
import type { SwarmCoordinator } from "../swarm-join.js";
import type { AgentActivity } from "../ui/agent-ui-types.js";
import type { AgentWidget } from "../ui/agent-widget.js";

export interface ToolContext {
  pi: ExtensionAPI;
  manager: AgentManager;
  widget: AgentWidget;
  agentActivity: Map<string, AgentActivity>;
  batchOrchestrator: BatchOrchestrator;
  scheduler: SubagentScheduler;
  swarmJoin: SwarmCoordinator;
  hookRegistry: HookRegistry;
  sendIndividualNudge: (record: any) => void;
  cancelNudge: (key: string) => void;
  scheduleNudge: (key: string, fn: () => void) => void;
  buildEventRecord: (record: any) => any;
}
```

- [ ] **Step 2: Create directories**

```bash
mkdir -p src/tools src/commands
```

- [ ] **Step 3: Run typecheck to verify**

```bash
npm run typecheck
```

Expected: PASS (no errors — file is standalone)

- [ ] **Step 4: Commit**

```bash
git add src/tools/context.ts
git commit -m "feat: add ToolContext interface for tool extraction"
```

---

### Task 2: Extract get_subagent_result tool

**Files:**
- Create: `src/tools/get-result.ts`
- Modify: `src/index.ts:951-1028`

This is the simplest tool to extract — good for validating the pattern.

- [ ] **Step 1: Read the current get_subagent_result implementation**

Read `src/index.ts` lines 951-1028 to capture the full implementation.

- [ ] **Step 2: Create src/tools/get-result.ts**

```typescript
// src/tools/get-result.ts
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentConversation } from "../agent-runner.js";
import { getLifetimeTotal, getSessionContextPercent } from "../usage.js";
import { formatDuration, formatMs, formatTurns, getDisplayName } from "../ui/agent-format.js";
import type { ToolContext } from "./context.js";

export function createGetResultTool(ctx: ToolContext) {
  return defineTool({
    name: "get_subagent_result",
    label: "Get Agent Result",
    description:
      "Check status and retrieve results from a background agent. Use the agent ID returned by Agent with run_in_background.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to check.",
      }),
      wait: Type.Optional(
        Type.Boolean({
          description: "If true, wait for the agent to complete before returning. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, include the agent's full conversation (messages + tool calls). Default: false.",
        }),
      ),
    }),

    renderCall(args, theme) {
      return theme.fg("muted", `  ⎿  Checking agent ${args.agent_id}...`);
    },

    renderResult(result, _state, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const lines = text.split("\n");
      const header = lines[0] ?? "";
      if (header.includes("still running")) {
        return theme.fg("muted", `  ⎿  ${header}`);
      }
      return theme.fg("success", `  ⎿  ${header}`);
    },

    execute: async (_toolCallId, params) => {
      const id = params.agent_id as string;
      const record = ctx.manager.getRecord(id);

      if (!record) {
        return {
          content: [{ type: "text", text: `No agent found with ID "${id}". It may have been cleaned up or the session was restarted.` }],
        };
      }

      if (record.status === "running" || record.status === "queued") {
        const elapsed = Date.now() - record.startedAt;
        const statusLine = record.status === "queued"
          ? `Agent is queued (position: ${ctx.manager.getQueuePosition(id) ?? "?"}).`
          : `Agent is still running (${formatDuration(elapsed)}, ${record.toolUses} tool uses).`;
        return {
          content: [{ type: "text", text: statusLine + "\nUse wait: true to block until completion." }],
        };
      }

      const elapsed = (record.completedAt ?? Date.now()) - record.startedAt;
      const parts: string[] = [];
      parts.push(`Agent ${record.status === "error" ? "failed" : "completed"} in ${formatMs(elapsed)}`);
      parts.push(`${record.toolUses} tool uses`);
      parts.push(`${formatTurns(record.turnCount)} turns`);
      const totalTokens = getLifetimeTotal(record);
      if (totalTokens > 0) parts.push(`${totalTokens.toLocaleString()} tokens`);
      parts.push(`status: ${record.status}`);

      if (record.error) {
        parts.push(`\nError: ${record.error}`);
      }
      if (record.result?.trim()) {
        parts.push(`\n${record.result.trim()}`);
      }

      if (params.verbose) {
        const conversation = getAgentConversation(id);
        if (conversation) {
          parts.push(`\n--- Full Conversation ---\n${conversation}`);
        }
      }

      return {
        content: [{ type: "text", text: parts.join(" · ") }],
        details: {
          agentId: id,
          displayName: getDisplayName(record.type),
          status: record.status,
          description: record.description,
          durationMs: elapsed,
          toolUses: record.toolUses,
          turnCount: record.turnCount,
          tokens: totalTokens > 0 ? `${totalTokens.toLocaleString()} tokens` : "",
          contextPercent: getSessionContextPercent(record),
          outputSize: record.result?.length ?? 0,
        } as any,
      };
    },
  });
}
```

- [ ] **Step 3: Replace in index.ts**

In `src/index.ts`, replace lines 951-1028 (the `get_subagent_result` tool registration) with:

```typescript
  // ---- get_subagent_result tool ----
  pi.registerTool(createGetResultTool(toolCtx));
```

And add the import at the top:

```typescript
import { createGetResultTool } from "./tools/get-result.js";
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All 748 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-result.ts src/index.ts
git commit -m "refactor: extract get_subagent_result tool to tools/get-result.ts"
```

---

### Task 3: Extract steer_subagent tool

**Files:**
- Create: `src/tools/steer.ts`
- Modify: `src/index.ts:1030-1083`

- [ ] **Step 1: Read the current steer_subagent implementation**

Read `src/index.ts` lines 1030-1083 to capture the full implementation.

- [ ] **Step 2: Create src/tools/steer.ts**

```typescript
// src/tools/steer.ts
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { steerAgent } from "../agent-runner.js";
import type { ToolContext } from "./context.js";

export function createSteerTool(ctx: ToolContext) {
  return defineTool({
    name: "steer_subagent",
    label: "Steer Agent",
    description: "Send a mid-run message to a running background agent. Use this to redirect, update context, or provide feedback to a background agent you spawned with Agent tool.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The background agent ID to steer.",
      }),
      message: Type.String({
        description: "The message to send to the agent. Be specific about what you want it to do differently.",
      }),
    }),

    renderCall(args, theme) {
      return theme.fg("muted", `  ⎿  Steering agent ${args.agent_id}`);
    },

    renderResult(result, _state, theme) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const isError = text.toLowerCase().includes("not found") || text.toLowerCase().includes("not running");
      return isError
        ? theme.fg("warning", `  ⎿  ${text}`)
        : theme.fg("success", `  ⎿  ${text}`);
    },

    execute: async (_toolCallId, params) => {
      const id = params.agent_id as string;
      const message = params.message as string;

      const record = ctx.manager.getRecord(id);
      if (!record) {
        return {
          content: [{ type: "text", text: `No agent found with ID "${id}". It may have been cleaned up.` }],
        };
      }

      if (record.status !== "running") {
        return {
          content: [{ type: "text", text: `Agent "${id}" is not running (status: ${record.status}). Cannot steer a completed or queued agent.` }],
        };
      }

      try {
        await steerAgent(id, message);
        return {
          content: [{ type: "text", text: `Message sent to agent "${id}". It will process this on its next turn.` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to steer agent "${id}": ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  });
}
```

- [ ] **Step 3: Replace in index.ts**

In `src/index.ts`, replace lines 1030-1083 (the `steer_subagent` tool registration) with:

```typescript
  // ---- steer_subagent tool ----
  pi.registerTool(createSteerTool(toolCtx));
```

And add the import at the top:

```typescript
import { createSteerTool } from "./tools/steer.js";
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All 748 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/steer.ts src/index.ts
git commit -m "refactor: extract steer_subagent tool to tools/steer.ts"
```

---

### Task 4: Extract Agent tool

**Files:**
- Create: `src/tools/agent.ts`
- Modify: `src/index.ts:420-949`

This is the largest extraction — the Agent tool has ~530 lines.

- [ ] **Step 1: Read the full Agent tool implementation**

Read `src/index.ts` lines 420-949 to capture the complete implementation including schedule params, renderCall, renderResult, and execute.

- [ ] **Step 2: Create src/tools/agent.ts**

The file will contain:
- `createAgentTool(ctx: ToolContext)` factory function
- All the schedule parameter logic
- The full execute handler (background + foreground paths)

Copy the implementation from index.ts, adapting:
- Remove the `pi.registerTool(defineTool({...}))` wrapper — just return the tool definition
- Replace closure variables with `ctx.*` references:
  - `manager` → `ctx.manager`
  - `widget` → `ctx.widget`
  - `agentActivity` → `ctx.agentActivity`
  - `batchOrchestrator` → `ctx.batchOrchestrator`
  - `scheduler` → `ctx.scheduler`
  - `swarmJoin` → `ctx.swarmJoin`
  - `sendIndividualNudge` → `ctx.sendIndividualNudge`
  - `scheduleNudge` → `ctx.scheduleNudge`
  - `buildEventRecord` → `ctx.buildEventRecord`
  - `pi` → `ctx.pi`
- Import all needed functions from existing modules

The imports section should be:

```typescript
import { defineTool, type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { isSchedulingEnabled, reloadCustomAgents, getDefaultJoinMode } from "../agent-registry.js";
import { getDefaultMaxTurns, normalizeMaxTurns } from "../agent-runner.js";
import { getAgentConfig, getAvailableTypes, resolveType } from "../agent-types.js";
import { buildAgentEstimate } from "../estimate.js";
import { resolveAgentInvocationConfig, resolveJoinMode } from "../invocation-config.js";
import { resolveModel } from "../model-resolver.js";
import { createOutputFilePath, streamToOutputFile, writeInitialEntry } from "../output-file.js";
import {
  buildDetails, buildNotificationDetails, createActivityTracker, formatLifetimeTokens,
  formatTaskNotification, getStatusNote, textResult,
} from "../tool-result-helpers.js";
import type { AgentInvocation, AgentRecord, NotificationDetails, SubagentType } from "../types.js";
import { buildInvocationTags, describeActivity, formatDuration, formatMs, formatTurns, getDisplayName, getPromptModeLabel } from "../ui/agent-format.js";
import type { AgentActivity, AgentDetails, UICtx } from "../ui/agent-ui-types.js";
import type { ToolContext } from "./context.js";
```

- [ ] **Step 3: Replace in index.ts**

In `src/index.ts`, replace lines 420-949 (the entire Agent tool block including `scheduleParamShape`, `scheduleParam`, `scheduleGuideline`, and the `pi.registerTool(defineTool({...}))` call) with:

```typescript
  // ---- Agent tool ----
  pi.registerTool(createAgentTool(toolCtx));
```

And add the import:

```typescript
import { createAgentTool } from "./tools/agent.js";
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All 748 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/agent.ts src/index.ts
git commit -m "refactor: extract Agent tool to tools/agent.ts"
```

---

### Task 5: Extract commands

**Files:**
- Create: `src/commands/agents.ts`
- Create: `src/commands/hooks.ts`
- Modify: `src/index.ts:1085-1135`

- [ ] **Step 1: Read the current command implementations**

Read `src/index.ts` lines 1085-1135 to capture both command handlers.

- [ ] **Step 2: Create src/commands/agents.ts**

```typescript
// src/commands/agents.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { showAgentsMenu } from "../output-handler.js";
import type { AgentManager } from "../agent-manager.js";
import type { AgentWidget } from "../ui/agent-widget.js";

export function registerAgentsCommand(
  pi: ExtensionAPI,
  manager: AgentManager,
  widget: AgentWidget,
  callbacks: {
    applyAndEmitLoaded: () => void;
    reloadCustomAgents: () => void;
    setCinematicEnabled: (v: boolean) => void;
    setAnimationStyle: (v: string) => void;
    setOrchestrationMode: (v: string) => void;
    setShowActivityStream: (v: boolean) => void;
    setShowTokenUsage: (v: boolean) => void;
    setShowTurnProgress: (v: boolean) => void;
    setDashboardRefreshInterval: (v: number) => void;
    setDefaultJoinMode: (v: string) => void;
    setSchedulingEnabled: (v: boolean) => void;
  },
) {
  pi.registerCommand("agents", {
    description: "Manage sub-agents, settings, and scheduled jobs",
    handler: async (_args, _ctx) => {
      await showAgentsMenu(pi, manager, widget, callbacks);
    },
  });
}
```

- [ ] **Step 3: Create src/commands/hooks.ts**

```typescript
// src/commands/hooks.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HookRegistry } from "../hooks.js";

export function registerHooksCommand(pi: ExtensionAPI, hookRegistry: HookRegistry) {
  pi.registerCommand("hooks", {
    description: "Manage hooks",
    handler: async (_args, _ctx) => {
      const handlerMap = hookRegistry.getHandlers();
      const entries = [...handlerMap.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      );

      if (entries.length === 0) {
        pi.sendMessage({
          customType: "hooks-list",
          content: "No hooks registered.",
          display: true,
        });
        return;
      }

      const lines: string[] = ["## Registered Hooks\n"];
      for (const [event, handlers] of entries) {
        lines.push(`- **${event}**: ${handlers.length} handler${handlers.length === 1 ? "" : "s"}`);
      }
      lines.push(`\n*Total: ${entries.reduce((sum, [, h]) => sum + h.length, 0)} handler(s) across ${entries.length} event(s)*`);

      pi.sendMessage({
        customType: "hooks-list",
        content: lines.join("\n"),
        display: true,
      });
    },
  });
}
```

- [ ] **Step 4: Replace in index.ts**

In `src/index.ts`, replace lines 1085-1135 (both command registrations) with:

```typescript
  // ---- Commands ----
  registerAgentsCommand(pi, manager, widget, {
    applyAndEmitLoaded,
    reloadCustomAgents,
    setCinematicEnabled,
    setAnimationStyle,
    setOrchestrationMode,
    setShowActivityStream,
    setShowTokenUsage,
    setShowTurnProgress,
    setDashboardRefreshInterval,
    setDefaultJoinMode,
    setSchedulingEnabled,
  });
  registerHooksCommand(pi, hookRegistry);
```

And add the imports:

```typescript
import { registerAgentsCommand } from "./commands/agents.js";
import { registerHooksCommand } from "./commands/hooks.js";
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: All 748 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/agents.ts src/commands/hooks.ts src/index.ts
git commit -m "refactor: extract agents and hooks commands to commands/"
```

---

### Task 6: Create toolCtx object and wire everything

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add toolCtx construction**

In `src/index.ts`, after all the setup code (after the batch orchestrator creation, before the tool registrations), add the `toolCtx` construction:

```typescript
  // ---- Tool context — shared dependency bag for extracted tool modules ----
  const toolCtx: import("./tools/context.js").ToolContext = {
    pi,
    manager,
    widget,
    agentActivity,
    batchOrchestrator,
    scheduler,
    swarmJoin,
    hookRegistry,
    sendIndividualNudge,
    cancelNudge,
    scheduleNudge,
    buildEventRecord,
  };
```

- [ ] **Step 2: Verify all tool registrations use the extracted factories**

Confirm that the tool registrations now look like:

```typescript
  pi.registerTool(createAgentTool(toolCtx));
  pi.registerTool(createGetResultTool(toolCtx));
  pi.registerTool(createSteerTool(toolCtx));
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: No warnings

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: All 748 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor: wire tool context for extracted modules"
```

---

### Task 7: Clean up unused imports in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Remove imports that are now only used in extracted modules**

After the extraction, many imports in `index.ts` are no longer needed directly — they're used in the extracted modules instead. Run:

```bash
npx biome check src/index.ts --write
```

Or manually remove unused imports. The remaining imports in `index.ts` should only be for setup code that stays (AgentManager, BatchOrchestrator, SwarmCoordinator, GroupJoinManager, HookRegistry, SubagentScheduler, etc.).

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "chore: clean up unused imports after tool extraction"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full verification**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: All pass, 748 tests

- [ ] **Step 2: Verify file sizes**

```bash
wc -l src/index.ts src/tools/agent.ts src/tools/get-result.ts src/tools/steer.ts src/commands/agents.ts src/commands/hooks.ts src/tools/context.ts
```

Expected:
- `src/index.ts` — ~370 lines (down from 1135)
- `src/tools/agent.ts` — ~550 lines
- `src/tools/get-result.ts` — ~100 lines
- `src/tools/steer.ts` — ~65 lines
- `src/commands/agents.ts` — ~35 lines
- `src/commands/hooks.ts` — ~35 lines
- `src/tools/context.ts` — ~25 lines

- [ ] **Step 3: Verify no regressions**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: All 748 tests pass

- [ ] **Step 4: Final commit (if needed)**

```bash
git add -A
git commit -m "refactor: complete index.ts god-object split

- Extract Agent tool to src/tools/agent.ts
- Extract get_subagent_result to src/tools/get-result.ts
- Extract steer_subagent to src/tools/steer.ts
- Extract /agents command to src/commands/agents.ts
- Extract /hooks command to src/commands/hooks.ts
- Add ToolContext interface in src/tools/context.ts
- Reduce index.ts from 1135 to ~370 lines

Refs: audit plan task 14"
```
