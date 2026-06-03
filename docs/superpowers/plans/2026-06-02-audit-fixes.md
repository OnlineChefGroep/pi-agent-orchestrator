# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 98 findings from the multi-agent audit (2 critical, 13 high, 39 medium, 44 low)

**Architecture:** Incremental fixes in priority order. Each task is self-contained and produces a passing test suite. The god-object `index.ts` split (Task 9) is the largest change and should be done last since other fixes touch the same file.

**Tech Stack:** TypeScript 6.0, vitest, Biome, @sinclair/typebox, ESM modules

---

## File Impact Map

| File | Tasks | Change Type |
|------|-------|-------------|
| `src/cross-extension-rpc.ts` | 1, 2 | Modify |
| `src/agent-types.ts` | 3 | Modify |
| `src/index.ts` | 4, 5, 9, 11 | Modify (split in Task 9) |
| `src/agent-runner.ts` | 5, 6, 8, 11 | Modify |
| `src/hooks.ts` | 5 | Modify |
| `src/model-resolver.ts` | 7 | Modify |
| `src/ui/conversation-viewer.ts` | 8, 12 | Modify |
| `src/ui/agent-detail.ts` | 8 | Modify |
| `src/telemetry.ts` | 10 | Modify |
| `src/settings.ts` | 11 | Modify |
| `src/schedule.ts` | 11 | Modify |
| `src/ui/agent-dashboard-renderer.ts` | 12 | Modify |
| `src/ui/animation.ts` | 12 | Modify |
| `src/group-join.ts` | 12 | Modify |
| `src/ui/settings-menu.ts` | 12 | Modify |
| `src/agent-manager.ts` | 12 | Modify |
| `test/schedule.test.ts` | 13 | Modify |
| `test/agent-runner-settings.test.ts` | 13 | Modify |
| `test/settings.test.ts` | 13 | Modify |
| `test/task-budget.test.ts` | 14 | Modify |
| `test/e2e-chain.test.ts` | 14 | Modify |
| `test/swarm-join.test.ts` | 14 | Modify |
| `test/context-mode-bridge.test.ts` | 14 | Modify |
| `test/agent-registry.test.ts` | 14 | Modify |
| `test/validators.test.ts` | 14 | Modify |
| `src/types.ts` | 12 | Modify |
| `src/handoff.ts` | 12 | Modify |
| New: `src/rpc-validation.ts` | 1 | Create |
| New: `src/errors.ts` | 5 | Create |
| New: `src/commands/spawn.ts` | 9 | Create |
| New: `src/commands/status.ts` | 9 | Create |
| New: `src/commands/result.ts` | 9 | Create |
| New: `src/commands/steer.ts` | 9 | Create |
| New: `src/commands/schedule-cmd.ts` | 9 | Create |
| New: `src/rpc-setup.ts` | 9 | Create |
| New: `test/rpc-validation.test.ts` | 1 | Create |
| New: `test/errors.test.ts` | 5 | Create |

---

## Task 1: RPC Input Validation (Security — High)

**Files:**
- Create: `src/rpc-validation.ts`
- Create: `test/rpc-validation.test.ts`
- Modify: `src/cross-extension-rpc.ts:193`

- [ ] **Step 1: Write failing tests for RPC validation**

```typescript
// test/rpc-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateRpcParams, validateSpawnParams } from "../src/rpc-validation.js";

describe("validateRpcParams", () => {
  it("rejects missing requestId", () => {
    expect(() => validateRpcParams({})).toThrow("requestId");
  });

  it("rejects non-string requestId", () => {
    expect(() => validateRpcParams({ requestId: 123 })).toThrow("requestId");
  });

  it("rejects empty requestId", () => {
    expect(() => validateRpcParams({ requestId: "" })).toThrow("requestId");
  });

  it("accepts valid params", () => {
    const result = validateRpcParams({ requestId: "abc-123", data: "hello" });
    expect(result.requestId).toBe("abc-123");
  });
});

describe("validateSpawnParams", () => {
  it("rejects missing type", () => {
    expect(() => validateSpawnParams({ requestId: "r1", prompt: "hi" })).toThrow("type");
  });

  it("rejects missing prompt", () => {
    expect(() => validateSpawnParams({ requestId: "r1", type: "default" })).toThrow("prompt");
  });

  it("rejects empty prompt", () => {
    expect(() => validateSpawnParams({ requestId: "r1", type: "default", prompt: "" })).toThrow("prompt");
  });

  it("accepts valid spawn params", () => {
    const result = validateSpawnParams({ requestId: "r1", type: "default", prompt: "do something" });
    expect(result.type).toBe("default");
    expect(result.prompt).toBe("do something");
  });

  it("passes through options", () => {
    const result = validateSpawnParams({ requestId: "r1", type: "default", prompt: "hi", options: { maxTurns: 5 } });
    expect(result.options).toEqual({ maxTurns: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/rpc-validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validation module**

```typescript
// src/rpc-validation.ts
export interface ValidatedRpcParams {
  requestId: string;
  [key: string]: unknown;
}

export interface ValidatedSpawnParams {
  requestId: string;
  type: string;
  prompt: string;
  options?: Record<string, unknown>;
}

export function validateRpcParams(raw: unknown): ValidatedRpcParams {
  if (!raw || typeof raw !== "object") {
    throw new Error("RPC params must be an object");
  }
  const params = raw as Record<string, unknown>;
  if (typeof params.requestId !== "string" || params.requestId.length === 0) {
    throw new Error("RPC params must include a non-empty requestId string");
  }
  return params as ValidatedRpcParams;
}

export function validateSpawnParams(raw: unknown): ValidatedSpawnParams {
  const base = validateRpcParams(raw);
  if (typeof base.type !== "string" || base.type.length === 0) {
    throw new Error("Spawn params must include a non-empty type string");
  }
  if (typeof base.prompt !== "string" || base.prompt.length === 0) {
    throw new Error("Spawn params must include a non-empty prompt string");
  }
  return {
    requestId: base.requestId,
    type: base.type,
    prompt: base.prompt,
    options: base.options as Record<string, unknown> | undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/rpc-validation.test.ts`
Expected: PASS

- [ ] **Step 5: Wire validation into RPC handler**

In `src/cross-extension-rpc.ts:193`, replace:
```typescript
const params = raw as P;
```
With:
```typescript
import { validateRpcParams } from "./rpc-validation.js";
// ...
const params = validateRpcParams(raw) as P;
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: 737+ tests pass

- [ ] **Step 7: Commit**

```bash
git add src/rpc-validation.ts test/rpc-validation.test.ts src/cross-extension-rpc.ts
git commit -m "fix(security): add runtime validation for RPC params

Validates requestId is a non-empty string before processing RPC messages.
Prevents undefined channel replies from malformed events.

Refs: audit Finding 3 (high)"
```

---

## Task 2: Spawn Authorization (Security — High)

**Files:**
- Modify: `src/cross-extension-rpc.ts:351-385`
- Modify: `test/cross-extension-rpc.test.ts`

- [ ] **Step 1: Write failing test for spawn authorization**

```typescript
// Add to test/cross-extension-rpc.test.ts
it("rejects spawn from non-allowed extension when allowlist configured", async () => {
  const events = createMockEvents();
  const manager = createMockManager();
  registerRpcHandlers({
    events,
    pi: createMockPi(),
    getCtx: () => createMockCtx(),
    manager,
    allowedExtensions: ["trusted-ext"],
  });

  // Simulate spawn from unknown extension
  const handler = getRegisteredHandler(events, "spawn");
  await expect(
    handler({ requestId: "r1", type: "default", prompt: "hi" }, { extensionId: "malicious-ext" })
  ).rejects.toThrow("not authorized");
});

it("allows spawn from listed extension", async () => {
  const events = createMockEvents();
  const manager = createMockManager();
  registerRpcHandlers({
    events,
    pi: createMockPi(),
    getCtx: () => createMockCtx(),
    manager,
    allowedExtensions: ["trusted-ext"],
  });

  const handler = getRegisteredHandler(events, "spawn");
  const result = await handler(
    { requestId: "r1", type: "default", prompt: "hi" },
    { extensionId: "trusted-ext" }
  );
  expect(result.id).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/cross-extension-rpc.test.ts`
Expected: FAIL — `allowedExtensions` not recognized

- [ ] **Step 3: Implement authorization check**

In `src/cross-extension-rpc.ts`, add `allowedExtensions?: string[]` to `RpcDeps` interface and add check in spawn handler:

```typescript
// In RpcDeps interface:
allowedExtensions?: string[];

// In spawn handler, after authentication:
if (deps.allowedExtensions && !deps.allowedExtensions.includes(extensionId)) {
  throw new RpcError("Extension not authorized to spawn agents", "FORBIDDEN");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cross-extension-rpc.ts test/cross-extension-rpc.test.ts
git commit -m "fix(security): add per-extension spawn authorization

Adds optional allowedExtensions config to RpcDeps. Unauthorized
extensions are blocked from spawning agents with shell access.

Refs: audit Finding 4 (high)"
```

---

## Task 3: Remove bash from Safe Fallback (Security — Medium)

**Files:**
- Modify: `src/agent-types.ts:90`
- Modify: `test/agent-types.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// Add to test/agent-types.test.ts
it("SAFE_FALLBACK_TOOL_NAMES does not include bash", () => {
  // Access via the module's resolveToolsForType for an unknown agent type
  const tools = resolveToolsForType("nonexistent-type", {});
  const toolNames = tools.map(t => t.name);
  expect(toolNames).not.toContain("bash");
  expect(toolNames).toContain("read");
  expect(toolNames).toContain("grep");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/agent-types.test.ts`
Expected: FAIL — bash is in fallback list

- [ ] **Step 3: Remove bash from fallback**

In `src/agent-types.ts:90`, change:
```typescript
const SAFE_FALLBACK_TOOL_NAMES: readonly string[] = ["read", "bash", "grep"];
```
To:
```typescript
const SAFE_FALLBACK_TOOL_NAMES: readonly string[] = ["read", "grep"];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent-types.ts test/agent-types.test.ts
git commit -m "fix(security): remove bash from safe fallback tool list

The fallback for unknown agent types claimed to be read-only but
included bash which provides arbitrary shell access. Now truly read-only.

Refs: audit Finding 6 (medium)"
```

---

## Task 4: get_subagent_result Timeout (API Design — High)

**Files:**
- Modify: `src/index.ts:953-967`
- Modify: `test/` (relevant tool tests)

- [ ] **Step 1: Write failing test**

```typescript
// Add to relevant test file
it("get_subagent_result respects timeout parameter", async () => {
  // Spawn an agent that takes a long time
  const spawnResult = await invokeTool("subagent_spawn", {
    subagent_type: "default",
    prompt: "wait for a long time",
  });

  // Call get_subagent_result with a short timeout
  const start = Date.now();
  const result = await invokeTool("get_subagent_result", {
    agent_id: spawnResult.id,
    wait: true,
    timeout: 1, // 1 second
  });

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000); // Should not hang
  expect(result.status).toMatch(/timeout|pending/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/` (relevant file)
Expected: FAIL — timeout param not recognized

- [ ] **Step 3: Add timeout parameter to tool schema**

In `src/index.ts`, find the `get_subagent_result` tool definition and add:

```typescript
timeout: Type.Optional(Type.Number({
  description: "Max seconds to wait when wait=true. Default: 300 (5 minutes). Returns partial result on timeout.",
  minimum: 1,
  maximum: 3600,
  default: 300,
})),
```

In the handler, implement timeout logic:

```typescript
const timeoutMs = (params.timeout ?? 300) * 1000;
const deadline = Date.now() + timeoutMs;

if (params.wait) {
  while (record.status === "running" && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
  }
  if (record.status === "running") {
    return { status: "timeout", partial: record.lastOutput ?? null };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/
git commit -m "feat(api): add timeout to get_subagent_result wait

Prevents infinite hangs when waiting for agent completion. Default
300s, configurable via timeout parameter. Returns partial result on
timeout.

Refs: audit Finding 5 (high)"
```

---

## Task 5: Silent Error Swallowing — swallowDebug Helper (Code Quality — Medium)

**Files:**
- Create: `src/errors.ts`
- Create: `test/errors.test.ts`
- Modify: `src/index.ts:70, 1059-1061`
- Modify: `src/agent-runner.ts:480-482, 495-497, 523-525, 550-552, 554-556, 638`

- [ ] **Step 1: Write failing tests**

```typescript
// test/errors.test.ts
import { describe, it, expect, vi } from "vitest";
import { swallowDebug } from "../src/errors.js";

describe("swallowDebug", () => {
  it("logs error at debug level", () => {
    const logger = { debug: vi.fn() };
    const err = new Error("test error");
    swallowDebug(err, "hook dispatch", logger);
    expect(logger.debug).toHaveBeenCalledOnce();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("hook dispatch"),
      expect.objectContaining({ error: "test error" })
    );
  });

  it("handles non-Error values", () => {
    const logger = { debug: vi.fn() };
    swallowDebug("string error", "nudge", logger);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("nudge"),
      expect.objectContaining({ error: "string error" })
    );
  });

  it("does not throw", () => {
    const logger = { debug: vi.fn() };
    expect(() => swallowDebug(new Error("x"), "test", logger)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/errors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement swallowDebug helper**

```typescript
// src/errors.ts
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

export function swallowDebug(err: unknown, context: string, logger: Logger): void {
  const error = err instanceof Error ? err.message : String(err);
  logger.debug(`[${context}] swallowed error: ${error}`, { error });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Replace empty catch blocks**

In `src/index.ts:70` (scheduleNudge), replace:
```typescript
} catch {
  // ignore
}
```
With:
```typescript
} catch (err) {
  swallowDebug(err, "scheduleNudge", logger);
}
```

In `src/index.ts:1059-1061`, replace all `.catch(() => {})` patterns:
```typescript
} catch (err) {
  swallowDebug(err, "hook:subagent:start", logger);
}
```

In `src/agent-runner.ts`, replace all `.catch(() => {})` on hook dispatches with `swallowDebug`.

In `src/agent-runner.ts:638` (validation resume), replace:
```typescript
} catch {
  // silently continue
}
```
With:
```typescript
} catch (err) {
  swallowDebug(err, "validation-resume", logger);
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/errors.ts test/errors.test.ts src/index.ts src/agent-runner.ts
git commit -m "fix: replace silent error swallowing with debug logging

Empty catch blocks in nudge, hook dispatch, and validation resume
now log at debug level via swallowDebug() helper. Production debugging
is now possible without changing error flow.

Refs: audit Finding M1, M2, M9 (medium)"
```

---

## Task 6: Model Cache on Module Level (Performance — Medium) ✅

**Files:**
- Modify: `src/agent-runner.ts:resolveDefaultModel`
- Modify: `src/model-resolver.ts:27-28`

- [ ] **Step 1: Write failing test for caching behavior**

```typescript
// test/model-resolver.test.ts (add to existing)
it("caches availableSet across calls within same registry", () => {
  const registry = {
    getAvailable: vi.fn(() => [
      { provider: "openai", id: "gpt-4" },
      { provider: "anthropic", id: "claude-3" },
    ]),
  };

  // Call twice
  resolveModel(registry, "openai/gpt-4");
  resolveModel(registry, "anthropic/claude-3");

  // getAvailable should only be called once if cached
  // (or twice if no cache — this test documents the expected behavior)
  expect(registry.getAvailable).toHaveBeenCalledTimes(2); // update when cache is added
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npm test -- test/model-resolver.test.ts`
Expected: PASS (documents current behavior)

- [ ] **Step 3: Add caching to resolveModel**

In `src/model-resolver.ts`, add module-level cache:

```typescript
let cachedRegistry: unknown = null;
let cachedSet: Set<string> | null = null;
let cachedAll: ModelEntry[] | null = null;

function getAvailableSet(registry: ModelRegistry): { set: Set<string>; all: ModelEntry[] } {
  if (registry !== cachedRegistry || !cachedSet) {
    const all = (registry.getAvailable?.() ?? registry.getAll()) as ModelEntry[];
    cachedAll = all;
    cachedSet = new Set(all.map(m => `${m.provider}/${m.id}`.toLowerCase()));
    cachedRegistry = registry;
  }
  return { set: cachedSet, all: cachedAll! };
}

export function invalidateModelCache(): void {
  cachedRegistry = null;
  cachedSet = null;
  cachedAll = null;
}
```

Update `resolveModel` to use `getAvailableSet` instead of building the Set inline.

- [ ] **Step 4: Add same caching to agent-runner resolveDefaultModel**

In `src/agent-runner.ts`, find the similar pattern and use the shared `getAvailableSet` from model-resolver.

- [ ] **Step 5: Update test to verify caching**

```typescript
it("caches availableSet across calls within same registry", () => {
  const registry = { getAvailable: vi.fn(() => [{ provider: "openai", id: "gpt-4" }]) };
  resolveModel(registry, "openai/gpt-4");
  resolveModel(registry, "openai/gpt-4");
  expect(registry.getAvailable).toHaveBeenCalledTimes(1); // cached
});
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/model-resolver.ts src/agent-runner.ts test/model-resolver.test.ts
git commit -m "perf: cache model registry Set across resolveModel calls

Avoids rebuilding Set<string> of available models on every agent spawn.
Module-level cache invalidated on registry change.

Refs: audit Finding 24, 9 (medium)"
```

---

## Task 7: Hoist telemetry securityEvents to Module Scope (Performance — Low)

**Files:**
- Modify: `src/telemetry.ts:90-97`

- [ ] **Step 1: Write test for allocation reduction**

```typescript
// test/telemetry.test.ts (add to existing)
it("emitTelemetry does not allocate arrays per call for security events", () => {
  // This is a behavior test — verify security events are logged
  const logger = { warn: vi.fn() };
  emitTelemetry("agent:loaded" as TelemetryEventName, { type: "test" }, logger);
  expect(logger.warn).toHaveBeenCalled();
});
```

- [ ] **Step 2: Hoist securityEvents to module scope**

In `src/telemetry.ts`, move the array outside the function:

```typescript
// At module level (replace the inline array in else branch):
const SECURITY_EVENTS = new Set([
  "agent:loaded",
  "agent:validation-failed",
  "agent:unknown-tools",
] as const);

// In emitTelemetry else branch, replace:
//   const securityEvents: TelemetryEventName[] = [...]
// With:
if (SECURITY_EVENTS.has(event as TelemetryEventName)) {
  logger.warn(`[telemetry] security event: ${event}`, { payload });
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/telemetry.ts test/telemetry.test.ts
git commit -m "perf: hoist telemetry securityEvents to module-level Set

Eliminates array allocation and linear scan on every emitTelemetry call.
O(1) Set lookup instead of O(n) includes().

Refs: audit Finding 29 (low)"
```

---

## Task 8: O(n^2) String Concatenation Fix (Performance — Critical)

**Files:**
- Modify: `src/ui/conversation-viewer.ts`
- Modify: `src/ui/agent-detail.ts`

- [ ] **Step 1: Write performance regression test**

```typescript
// test/conversation-viewer-perf.test.ts
import { describe, it, expect } from "vitest";
import { buildContentLines } from "../src/ui/conversation-viewer.js";

describe("conversation-viewer performance", () => {
  it("handles 1000 content blocks without O(n^2) degradation", () => {
    const blocks = Array.from({ length: 1000 }, (_, i) => ({
      type: "text",
      text: `Block ${i} `.repeat(10),
    }));

    const start = performance.now();
    buildContentLines(blocks, { width: 80, height: 50 });
    const elapsed = performance.now() - start;

    // Should complete in under 100ms even for 1000 blocks
    expect(elapsed).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run test to establish baseline**

Run: `npm test -- test/conversation-viewer-perf.test.ts`
Expected: May pass or fail depending on machine — document baseline

- [ ] **Step 3: Fix string concatenation in conversation-viewer.ts**

Find all `+=` patterns building strings in loops. Replace with array push + join:

```typescript
// Before (O(n^2)):
let output = "";
for (const block of blocks) {
  output += formatBlock(block);
}

// After (O(n)):
const parts: string[] = [];
for (const block of blocks) {
  parts.push(formatBlock(block));
}
const output = parts.join("");
```

Apply this pattern to all string-building loops in `buildContentLines` and related functions.

- [ ] **Step 4: Apply same fix to agent-detail.ts**

Same pattern replacement in `src/ui/agent-detail.ts`.

- [ ] **Step 5: Run test to verify improvement**

Run: `npm test -- test/conversation-viewer-perf.test.ts`
Expected: PASS with comfortable margin

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/conversation-viewer.ts src/ui/agent-detail.ts test/conversation-viewer-perf.test.ts
git commit -m "perf: fix O(n^2) string concatenation in render loops

Replace += in loops with array.push + join(""). Eliminates quadratic
allocation in conversation viewer and agent detail rendering.

Refs: audit Finding 10, 11 (critical)"
```

---

## Task 9: Extract index.ts God Object (Architecture — Critical) ✅

**Files:**
- Create: `src/commands/spawn.ts`
- Create: `src/commands/status.ts`
- Create: `src/commands/result.ts`
- Create: `src/commands/steer.ts`
- Create: `src/commands/schedule-cmd.ts`
- Create: `src/rpc-setup.ts`
- Modify: `src/index.ts` (drastically reduced)

- [ ] **Step 1: Map current index.ts structure**

Read `src/index.ts` and identify the logical sections:
1. Imports (lines 1-50)
2. Constants/helpers (lines 50-100)
3. Nudge scheduling (lines 100-150)
4. Tool definitions (lines 150-600) — the bulk
5. Command registrations (lines 600-800)
6. RPC registration (lines 800-950)
7. Settings menu (lines 950-1050)
8. Hook dispatch (lines 1050-1130)

- [ ] **Step 2: Create src/commands/ directory**

```bash
mkdir -p src/commands
```

- [ ] **Step 3: Extract spawn tool handler**

Create `src/commands/spawn.ts` with the `subagent_spawn` tool definition and handler logic. Export a function `registerSpawnTool(deps)` that takes the same deps the current inline handler uses.

```typescript
// src/commands/spawn.ts
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../types.js";

export interface SpawnDeps {
  manager: AgentManager;
  pi: PiApi;
  getCtx: () => Context;
  logger: Logger;
}

export function createSpawnTool(deps: SpawnDeps): ToolDefinition {
  return {
    name: "subagent_spawn",
    description: "Spawn a sub-agent...",
    parameters: Type.Object({
      subagent_type: Type.String({ description: "..." }),
      prompt: Type.String({ description: "..." }),
      // ... full schema
    }),
    handler: async (params) => {
      // ... extracted from index.ts
    },
  };
}
```

- [ ] **Step 4: Extract status, result, steer, schedule tools**

Same pattern for each tool group:
- `src/commands/status.ts` — `get_subagent_status`, `list_subagents`
- `src/commands/result.ts` — `get_subagent_result`
- `src/commands/steer.ts` — `steer_subagent`, `cancel_subagent`
- `src/commands/schedule-cmd.ts` — `schedule_subagent`, `list_schedules`, `remove_schedule`

- [ ] **Step 5: Extract RPC setup**

Create `src/rpc-setup.ts` with the `registerRpcHandlers` call and all RPC-related setup from index.ts.

- [ ] **Step 6: Refactor index.ts to compose extracted modules**

```typescript
// src/index.ts (after extraction)
import { createSpawnTool } from "./commands/spawn.js";
import { createStatusTools } from "./commands/status.js";
import { createResultTool } from "./commands/result.js";
import { createSteerTools } from "./commands/steer.js";
import { createScheduleTools } from "./commands/schedule-cmd.js";
import { registerRpcHandlers } from "./rpc-setup.js";

export default function extension(pi: PiApi) {
  const manager = new AgentManager();
  const deps = { manager, pi, logger, getCtx: () => currentCtx };

  // Register tools
  pi.tools.register(createSpawnTool(deps));
  pi.tools.register(...createStatusTools(deps));
  pi.tools.register(createResultTool(deps));
  pi.tools.register(...createSteerTools(deps));
  pi.tools.register(...createScheduleTools(deps));

  // Register commands
  registerCommands(pi, deps);

  // Register RPC
  registerRpcHandlers({ ...deps, events: pi.events });

  // Register settings
  registerSettingsMenu(pi, deps);
}
```

Target: `index.ts` should be under 200 lines.

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS — all 737+ tests still pass

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 9: Commit**

```bash
git add src/commands/ src/rpc-setup.ts src/index.ts
git commit -m "refactor: extract index.ts god object into focused modules

Split 1130-line index.ts into command modules (spawn, status, result,
steer, schedule) and rpc-setup. Index.ts now ~150 lines of composition.

Refs: audit Finding 1 (critical architecture)"
```

---

## Task 10: Telemetry & Animation Cleanup (Architecture — Low) ✅

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `src/ui/animation.ts:19-21`

- [ ] **Step 1: Fix animation.ts mutable export**

In `src/ui/animation.ts`, change from mutable array to getter:

```typescript
// Before:
export const SPINNER: string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function setSpinnerStyle(frames: string[]) {
  SPINNER.length = 0;
  SPINNER.push(...frames);
}

// After:
let spinnerFrames: readonly string[] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function getSpinnerFrames(): readonly string[] {
  return spinnerFrames;
}

export function setSpinnerStyle(frames: string[]) {
  spinnerFrames = Object.freeze([...frames]);
}

// Backward compat export
export const SPINNER = {
  get length() { return spinnerFrames.length; },
  [Symbol.iterator]() { return spinnerFrames[Symbol.iterator](); },
};
```

Update all consumers of `SPINNER` to use `getSpinnerFrames()` or the iterable.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/animation.ts
git commit -m "refactor: make SPINNER export immutable via getter

Replace mutable array mutation with frozen readonly access.
Prevents accidental mutation from importing modules.

Refs: audit Finding 16, 30 (low)"
```

---

## Task 11: Type Safety & Magic Numbers (Code Quality — Medium/Low)

**Files:**
- Modify: `src/agent-runner.ts:747`
- Modify: `src/ui/conversation-viewer.ts:246, 315-316`
- Modify: `src/model-resolver.ts:25`
- Modify: `src/validators.ts:32`
- Modify: `src/agent-manager.ts:113, 455, 596`
- Modify: `src/compaction.ts:56`
- Modify: `src/schedule.ts:29`

- [ ] **Step 1: Define shared tool call type**

In `src/types.ts`, add:

```typescript
export interface ToolCallContent {
  name?: string;
  toolName?: string;
  [key: string]: unknown;
}

export interface BashExecutionMessage {
  command?: string;
  output?: string;
  [key: string]: unknown;
}
```

- [ ] **Step 2: Replace `as any` casts with type guards**

In `src/agent-runner.ts:747` and `src/ui/conversation-viewer.ts:246`, replace:
```typescript
(c as any).name ?? (c as any).toolName ?? "unknown"
```
With:
```typescript
import { getToolCallName } from "../types.js";

export function getToolCallName(c: unknown): string {
  if (c && typeof c === "object") {
    const obj = c as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.toolName === "string") return obj.toolName;
  }
  return "unknown";
}
```

- [ ] **Step 3: Fix bashExecution cast**

In `src/ui/conversation-viewer.ts:315-316`, replace:
```typescript
const msg = message as any;
const command = msg.command;
```
With:
```typescript
import type { BashExecutionMessage } from "../types.js";
const msg = message as BashExecutionMessage;
const command = msg.command;
```

- [ ] **Step 4: Fix resolveModel return type**

In `src/model-resolver.ts:25`, change:
```typescript
export function resolveModel(registry: any, requested?: string): any | string {
```
To:
```typescript
export type ResolveModelResult = { provider: string; id: string } | string | undefined;

export function resolveModel(registry: ModelRegistry, requested?: string): ResolveModelResult {
```

- [ ] **Step 5: Extract magic numbers to named constants**

In `src/agent-runner.ts`:
```typescript
const MAX_VALIDATION_RETRIES = 2; // was: maxRetries = 2
```

In `src/agent-manager.ts`:
```typescript
const CLEANUP_CUTOFF_MS = 10 * 60_000; // was: 10 * 60_000
const CLEANUP_INTERVAL_MS = 60_000; // was: 60_000
```

In `src/compaction.ts`:
```typescript
const NON_TEXT_BLOCK_HEURISTIC = 50; // was: 50
```

In `src/schedule.ts`:
```typescript
const MIN_INTERVAL_MS = process.env.NODE_ENV === "test" ? 1_000 : 60_000; // document test/prod divergence
```

- [ ] **Step 6: Fix telemetry type bypass**

In `src/validators.ts:32`, replace:
```typescript
emitTelemetry("agent:validation-failed" as any, ...)
```
With:
```typescript
emitTelemetry("agent:validation-failed" as TelemetryEventName, ...)
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: Clean

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/agent-runner.ts src/ui/conversation-viewer.ts src/model-resolver.ts src/validators.ts src/agent-manager.ts src/compaction.ts src/schedule.ts
git commit -m "fix: eliminate unsafe any casts and extract magic numbers

Replace raw 'as any' casts with proper type guards at RPC and tool
boundaries. Extract hardcoded constants to named values.

Refs: audit Findings M5, M6, M7, L3, L4, L5, L14 (medium/low)"
```

---

## Task 12: Remaining Code Quality Fixes (Medium/Low)

**Files:**
- Modify: `src/settings.ts:120-208`
- Modify: `src/schedule-store.ts:107, 153-164`
- Modify: `src/ui/conversation-viewer.ts:226-391`
- Modify: `src/ui/settings-menu.ts:18-213`
- Modify: `src/ui/agent-dashboard-renderer.ts:40`
- Modify: `src/group-join.ts:85-108`
- Modify: `src/index.ts:486-491`
- Modify: `src/custom-agents.ts:13`
- Modify: `src/ui/agent-wizards.ts:151-153`

- [ ] **Step 1: Refactor settings.ts sanitize() to table-driven**

```typescript
// src/settings.ts — replace 16 near-identical blocks with:
type FieldValidator = { key: string; type: "int" | "boolean" | "string"; min?: number; max?: number; values?: readonly string[] };

const FIELD_VALIDATORS: FieldValidator[] = [
  { key: "maxConcurrent", type: "int", min: 1, max: 1024 },
  { key: "defaultMaxTurns", type: "int", min: 1, max: 10_000 },
  { key: "graceTurns", type: "int", min: 0, max: 100 },
  { key: "schedulingEnabled", type: "boolean" },
  { key: "defaultJoinMode", type: "string", values: ["async", "group", "smart", "swarm"] },
  // ... remaining fields
];

function sanitize(raw: Record<string, unknown>): Settings {
  const out = { ...DEFAULTS };
  for (const field of FIELD_VALIDATORS) {
    const val = raw[field.key];
    if (val === undefined) continue;
    if (field.type === "int" && typeof val === "number" && Number.isInteger(val)) {
      (out as any)[field.key] = Math.min(field.max!, Math.max(field.min!, val));
    } else if (field.type === "boolean" && typeof val === "boolean") {
      (out as any)[field.key] = val;
    } else if (field.type === "string" && typeof val === "string" && (!field.values || field.values.includes(val))) {
      (out as any)[field.key] = val;
    }
  }
  return out;
}
```

- [ ] **Step 2: Fix schedule-store silent catch**

In `src/schedule-store.ts:107`, replace:
```typescript
} catch {
  // corrupt file, start fresh
}
```
With:
```typescript
} catch (err) {
  swallowDebug(err, "schedule-store:load", logger);
}
```

- [ ] **Step 3: Fix dashboard token count**

In `src/ui/agent-dashboard-renderer.ts:40`, replace:
```typescript
const tokens = stats.input + stats.output;
```
With:
```typescript
const tokens = getLifetimeTotal(stats);
```

Import `getLifetimeTotal` from the appropriate module.

- [ ] **Step 4: Fix GroupJoinManager partial delivery leak**

In `src/group-join.ts:85-108`, in `onTimeout`, after delivering partial results, add cleanup:

```typescript
// After delivering partial results:
if (remaining.size === 0) {
  this.groups.delete(groupId);
  for (const [agentId, gId] of this.agentToGroup) {
    if (gId === groupId) this.agentToGroup.delete(agentId);
  }
}
```

- [ ] **Step 5: Fix max_turns schema/runtime mismatch**

In `src/index.ts:486-491`, change schema minimum from 1 to 0 and document:

```typescript
max_turns: Type.Optional(Type.Number({
  description: "Maximum turns. 0 = unlimited (use taskBudget for limits).",
  minimum: 0,
  default: 0,
})),
```

- [ ] **Step 6: Fix custom-agents.ts regex**

In `src/custom-agents.ts:13`, simplify redundant alternations in `UNSAFE_NAME_PATTERN`.

- [ ] **Step 7: Add TODO for hardcoded model IDs**

In `src/ui/agent-wizards.ts:151-153`, add comment:
```typescript
// TODO: Load available models from registry instead of hardcoding
```

- [ ] **Step 8: Run full test suite + lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/settings.ts src/schedule-store.ts src/ui/agent-dashboard-renderer.ts src/group-join.ts src/index.ts src/custom-agents.ts src/ui/agent-wizards.ts
git commit -m "fix: address remaining code quality findings

- Table-driven settings sanitizer (replaces 16 repetitive blocks)
- Debug logging for schedule-store corrupt file
- Correct token count using getLifetimeTotal
- GroupJoinManager cleanup on full partial delivery
- max_turns schema/runtime alignment

Refs: audit Findings L12, L11, M8, M11, L17, L24 (medium/low)"
```

---

## Task 13: Flaky Test Fixes (Test Quality — High) ✅

**Files:**
- Modify: `test/schedule.test.ts`
- Modify: `test/agent-runner-settings.test.ts`
- Modify: `test/settings.test.ts`

- [ ] **Step 1: Fix schedule tests with fake timers**

In `test/schedule.test.ts`, replace all real-timer patterns:

```typescript
// Before:
it("fires at interval", async () => {
  const start = Date.now();
  // ... wait for real time ...
  expect(Date.now() - start).toBeGreaterThanOrEqual(9_000);
});

// After:
it("fires at interval", async () => {
  vi.useFakeTimers();
  const callback = vi.fn();
  scheduler.schedule("test", "*/5 * * * *", callback);

  await vi.advanceTimersByTimeAsync(5 * 60 * 1000); // 5 minutes
  expect(callback).toHaveBeenCalled();

  vi.useRealTimers();
});
```

Apply to all flaky schedule tests (~4-5 test cases).

- [ ] **Step 2: Fix singleton state leaks in agent-runner-settings.test.ts**

In `test/agent-runner-settings.test.ts`, add both resets to every describe block:

```typescript
afterEach(() => {
  setDefaultMaxTurns(0);
  setGraceTurns(0);
});
```

- [ ] **Step 3: Fix missing "swarm" join mode test**

In `test/settings.test.ts:195-200`, change:
```typescript
const validModes = ["async", "group", "smart"];
```
To:
```typescript
const validModes = ["async", "group", "smart", "swarm"];
```

- [ ] **Step 4: Run tests multiple times to verify stability**

Run: `npm test` (3 times)
Expected: PASS all 3 times

- [ ] **Step 5: Commit**

```bash
git add test/schedule.test.ts test/agent-runner-settings.test.ts test/settings.test.ts
git commit -m "test: fix flaky tests with fake timers and state cleanup

Replace wall-clock assertions in schedule tests with vi.useFakeTimers().
Fix singleton state leaks in agent-runner-settings tests. Add missing
swarm join mode to sanitizer test coverage.

Refs: audit Findings 1, 2, 4 (high test-quality)"
```

---

## Task 14: Test Quality Improvements (Test Quality — Medium/Low) ✅

**Files:**
- Modify: `test/agent-registry.test.ts`
- Modify: `test/context-mode-bridge.test.ts`
- Modify: `test/swarm-join.test.ts`
- Modify: `test/cross-extension-rpc.test.ts`
- Modify: `test/validators.test.ts`
- Modify: `test/performance-baseline.test.ts`
- Modify: `test/backward-compat.test.ts`
- Modify: `test/error-chaos-handoff.test.ts`

- [ ] **Step 1: Fix agent-registry afterEach reset**

In `test/agent-registry.test.ts:14-15`, move manual reset to `afterEach`:

```typescript
afterEach(() => {
  // Reset registry state
  registry.clear();
});
```

- [ ] **Step 2: Mock isContextModeAvailable in context-mode-bridge tests**

In `test/context-mode-bridge.test.ts:84-98`, replace environment-dependent branching:

```typescript
// Before:
if (isContextModeAvailable()) {
  // test passes regardless
}

// After:
vi.mock("../src/context-mode-bridge.js", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, isContextModeAvailable: () => true };
});

it("handles context mode available path", () => {
  expect(isContextModeAvailable()).toBe(true);
  // deterministic assertion
});
```

- [ ] **Step 3: Fix swarm-join false positive test**

In `test/swarm-join.test.ts:62-72`, fix the "delivered state" test:

```typescript
it("returns false if swarm is already delivered", async () => {
  const coordinator = createSwarmCoordinator();
  // Actually deliver the swarm first
  await coordinator.deliver("swarm-1", { result: "done" });

  const result = await coordinator.join("swarm-1", "agent-2");
  expect(result).toBe(false);
});
```

- [ ] **Step 4: Fix race condition in cross-extension-rpc test**

In `test/cross-extension-rpc.test.ts:58-59`, replace `setTimeout` with proper event waiting:

```typescript
// Before:
await new Promise((r) => setTimeout(r, 20));

// After:
await waitForEvent(emitter, "reply", { timeout: 1000 });
```

- [ ] **Step 5: Remove dead eslint-disable comments**

In `test/validators.test.ts:29,33`, remove:
```typescript
// eslint-disable-next-line ...  // DELETE THIS LINE
```

- [ ] **Step 6: Fix backward-compat no-op test**

In `test/backward-compat.test.ts:108-120`, either remove the test or make it test the actual behavior:

```typescript
it("taskBudget defaults to undefined on AgentConfig", () => {
  const config = createDefaultConfig();
  expect(config.taskBudget).toBeUndefined();
});
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add test/
git commit -m "test: fix remaining test quality issues

- Fix afterEach state cleanup in agent-registry
- Mock isContextModeAvailable for deterministic tests
- Fix false-positive swarm delivered-state test
- Remove dead eslint-disable comments
- Fix race condition in RPC test

Refs: audit Findings 6-10, 18-23 (medium/low test-quality)"
```

---

## Verification

After all tasks complete:

```bash
npm run typecheck && npm run lint && npm test
```

Expected:
- typecheck: clean
- lint: 0 warnings
- tests: 740+ pass (grew from 737 due to new tests)

## Final Commit

```bash
git add -A
git commit -m "chore: complete audit fixes — 98 findings addressed

Multi-agent audit findings resolved:
- 2 critical: index.ts god-object split, O(n^2) render fix
- 13 high: RPC validation, spawn auth, timeout, flaky tests
- 39 medium: error handling, caching, type safety, settings
- 44 low: magic numbers, dead code, test cleanup

All tests pass. Lint clean. Typecheck clean."
```
