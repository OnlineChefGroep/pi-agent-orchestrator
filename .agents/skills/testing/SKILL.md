---
name: testing-pi-agent-orchestrator
description: "Test the pi-agent-orchestrator VS Code extension. Use when verifying code changes, running the test suite, writing adversarial tests, or debugging test failures. Covers vitest patterns, mocking strategies, performance benchmarks, flaky test handling, and test organization for 1006+ tests across 57 files."
---

# Testing pi-agent-orchestrator

## Overview

This is a VS Code extension (no browser UI). All testing is shell-based via vitest.
No recording needed — capture command outputs as text evidence.

- **1006+ tests** across **57 test files**
- **Test runner**: vitest (not jest)
- **Mocking**: vi (vitest's built-in mocking, not jest.fn)
- **Assertions**: vitest's expect (not jest expect)
- **Coverage**: built-in vitest coverage

## Key Commands

```bash
# Full verification suite (typecheck + lint + tests)
npm run typecheck && npm run lint && npm test

# Run all tests
npx vitest run

# Run single test file
npx vitest run test/handoff.test.ts

# Run multiple test files
npx vitest run test/handoff.test.ts test/agent-manager.test.ts

# Run tests matching a pattern (test name)
npx vitest run -t "session limits"

# Run tests matching a file pattern
npx vitest run test/*handoff*

# Watch mode
npx vitest --watch

# Run with coverage
npx vitest run --coverage

# TypeScript compilation check
npx tsc --noEmit

# Lint (Biome)
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

## Test File Organization

All test files live in `test/` (not `tests/`) with `.test.ts` extension.

### By Domain

| Test File | Domain | Tests |
|-----------|--------|-------|
| `test/handoff.test.ts` | Handoff parsing, prompt generation, rendering | JSON extraction, validation, rendering |
| `test/error-chaos-handoff.test.ts` | Resilience testing | Corrupted JSON, oversized payloads, DOS prevention |
| `test/agent-manager.test.ts` | Agent lifecycle | Session limits, usage accounting, spawn/turn enforcement |
| `test/agent-runner.test.ts` | Agent execution | Run/resume logic, error handling |
| `test/agent-registry.test.ts` | Agent registration | Type registration, config lookup |
| `test/agent-types.test.ts` | Agent type system | Permission model, partition filter |
| `test/agent-tree.test.ts` | Agent hierarchy | Parent-child relationships, tree rendering |
| `test/agent-widget.test.ts` | Widget rendering | Virtual scrolling, widget updates |
| `test/settings.test.ts` | Settings persistence | Sanitization, global/project merge, defaults |
| `test/e2e-chain.test.ts` | End-to-end chains | Full agent chain execution |
| `test/e2e-rpc-audit.test.ts` | RPC + audit integration | Cross-extension RPC with audit trail |
| `test/schedule.test.ts` | Scheduler | Cron parsing, job execution |
| `test/schedule-e2e.test.ts` | Scheduler E2E | Full scheduled job lifecycle |
| `test/schedule-store.test.ts` | Schedule persistence | Store read/write, pruning |
| `test/schedule-bounds.test.ts` | Schedule validation | Bounds checking, edge cases |
| `test/audit-logger.test.ts` | Audit logging | Ring buffer, filtering, silent mode, copy semantics |
| `test/cross-extension-rpc.test.ts` | RPC handlers | Auth, rate limiting, audit trail integration |
| `test/context.test.ts` | Context building | Parent context, sandbox injection |
| `test/context-mode-bridge.test.ts` | Context mode | Feature detection, sandbox tools |
| `test/compaction.test.ts` | Context compaction | Memory management, compaction triggers |
| `test/deferred-context.test.ts` | Deferred context | Token reduction, lazy evaluation |
| `test/dashboard-render-perf.test.ts` | Dashboard performance | Render benchmarks with thresholds |
| `test/dashboard-components.test.ts` | Dashboard components | UI component behavior |
| `test/dashboard.benchmark.test.ts` | Dashboard benchmarks | Performance assertions |
| `test/widget-render-perf.test.ts` | Widget performance | Virtual scroll benchmarks |
| `test/render-metrics.test.ts` | Render metrics | Metrics collection, snapshots |
| `test/spawn-latency-bench.test.ts` | Spawn latency | Benchmark spawn time |
| `test/spawn-latency-e2e-bench.test.ts` | Spawn latency E2E | End-to-end spawn benchmarks |
| `test/performance-baseline.test.ts` | Performance baseline | Baseline measurement guards |
| `test/memory.test.ts` | Memory usage | Memory leak detection |
| `test/hooks.test.ts` | Lifecycle hooks | Hook registration, event firing |
| `test/group-join.test.ts` | Group coordination | Barrier synchronization |
| `test/cve002.test.ts` | CVE-002 | Security vulnerability test |
| `test/cve004.test.ts` | CVE-004 | Security vulnerability test |
| `test/custom-agents.test.ts` | Custom agents | Markdown agent ingestion, validation |
| `test/default-agents.test.ts` | Default agents | Built-in agent configuration |
| `test/model-resolver.test.ts` | Model resolution | Model selection, fallback |
| `test/invocation-config.test.ts` | Invocation config | Config parsing, validation |
| `test/estimate.test.ts` | Estimation | Token estimation, cost calculation |
| `test/readonly-helpers.test.ts` | Readonly helpers | Immutable data structures |
| `test/print-mode.test.ts` | Print mode | Output formatting |
| `test/output-file.test.ts` | Output files | File writing, naming |
| `test/prompts.test.ts` | Prompts | Prompt generation, templating |
| `test/conversation-viewer.test.ts` | Conversation viewer | Message formatting, display |
| `test/env.test.ts` | Environment | Env var handling, defaults |
| `test/logger.test.ts` | Logging | Log levels, formatting |
| `test/skill-loader.test.ts` | Skill loading | Skill discovery, caching |
| `test/release-verification.test.ts` | Release verification | Pre-release checks |
| `test/backward-compat.test.ts` | Backward compatibility | API compatibility checks |
| `test/partitioned-state.test.ts` | Partitioned state | State isolation |

### Test Categories

```
test/
├── Unit tests (core logic)
│   ├── handoff.test.ts
│   ├── agent-manager.test.ts
│   ├── settings.test.ts
│   └── ...
├── Integration tests (module interactions)
│   ├── e2e-chain.test.ts
│   ├── e2e-rpc-audit.test.ts
│   ├── cross-extension-rpc.test.ts
│   └── ...
├── Performance benchmarks
│   ├── dashboard-render-perf.test.ts
│   ├── widget-render-perf.test.ts
│   ├── spawn-latency-bench.test.ts
│   ├── dashboard.benchmark.test.ts
│   └── performance-baseline.test.ts
├── Security / CVE tests
│   ├── cve002.test.ts
│   ├── cve004.test.ts
│   └── error-chaos-handoff.test.ts
├── Resilience tests
│   ├── error-chaos-handoff.test.ts
│   ├── schedule.test.ts (Windows flaky)
│   └── schedule-e2e.test.ts (Windows flaky)
└── E2E tests
    ├── e2e-chain.test.ts
    └── e2e-rpc-audit.test.ts
```

## Vitest Patterns

### Basic Test Structure

```typescript
import { describe, expect, it, vi } from "vitest";
import { myFunction } from "../src/my-module.js";

describe("my module", () => {
  it("does something correctly", () => {
    const result = myFunction("input");
    expect(result).toBe("expected output");
  });

  it("handles edge case", () => {
    expect(() => myFunction(null)).toThrow("invalid input");
  });
});
```

### Mocking with vi

```typescript
import { vi } from "vitest";

// Mock a module
vi.mock("../src/agent-runner.js", () => ({
  runAgent: vi.fn(),
  resumeAgent: vi.fn(),
}));

// Mock a function
const mockFn = vi.fn().mockReturnValue("mocked");

// Mock resolved value
const mockAsync = vi.fn().mockResolvedValue({ data: "test" });

// Mock implementation
const mockImpl = vi.fn().mockImplementation((x: number) => x * 2);

// Spy on console
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

// Restore after test
warnSpy.mockRestore();
```

### beforeEach / afterEach

```typescript
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("module with state", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetModuleState(); // Always reset module-level state
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanupTestFixtures();
  });

  it("test with clean state", () => {
    // State is guaranteed fresh
  });
});
```

### Async Testing

```typescript
// Promise-based
it("handles async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// WaitFor pattern (for event-based)
it("receives event", async () => {
  const handler = vi.fn();
  events.on("event", handler);
  events.emit("event", { data: "test" });

  await vi.waitFor(() => expect(handler).toHaveBeenCalled());
  expect(handler).toHaveBeenCalledWith({ data: "test" });
});

// Timeout-based
it("times out correctly", async () => {
  await new Promise((r) => setTimeout(r, 100));
  expect(true).toBe(true);
});
```

### Type-Safe Mocking (No `as any`)

```typescript
// Don't do this
const badMock = { id: "x" } as any;

// Do this - include all required fields
const goodMock: AgentRecord = {
  id: "x",
  type: "Explore",
  description: "test",
  status: "running",
  toolUses: 0,
  startedAt: Date.now(),
  spawnedAt: Date.now(),
};

// Or use vi.mocked for typed mocks
import { runAgent } from "../src/agent-runner.js";
vi.mocked(runAgent).mockResolvedValue({
  responseText: "done",
  session: mockSession(),
  aborted: false,
  steered: false,
});
```

## Known Flaky Tests

### Windows Temp Directory Races

On Windows, `schedule.test.ts` and `schedule-e2e.test.ts` may fail with:

```
ENOTEMPTY: directory not empty, rmdir
```

**Cause**: Temp directory cleanup races during parallel test execution.

**Status**: Pre-existing, documented in AGENTS.md. CI marks these `continue-on-error`.

**Not caused by code changes.** Do not spend time debugging these failures.

**Workaround locally**:
```bash
# Skip flaky tests
npx vitest run --exclude "test/schedule.test.ts" --exclude "test/schedule-e2e.test.ts"

# Or run them individually
npx vitest run test/schedule.test.ts
```

### Mitigation Strategies

When writing new tests with temp directories:

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "pi-test-"));
});

afterEach(() => {
  // Use force: true and ignore errors
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures (Windows race)
  }
});
```

## Writing Adversarial Tests

Adversarial tests verify that code is robust against malicious or unexpected input. They should FAIL if defensive code is removed.

### 1. Session Limits (`src/agent-manager.ts`)

Test that setters feed into enforcement fields, not just scalar fields:

```typescript
it("enforces session limits through setters", () => {
  const manager = new AgentManager(() => {});
  manager.setSessionLimits({ maxAgentsPerSession: 2 });

  // Should enforce the limit, not just store it
  manager.spawn(pi, ctx, "type", "first");
  manager.spawn(pi, ctx, "type", "second");

  expect(() => {
    manager.spawn(pi, ctx, "type", "third");
  }).toThrow(/limit exceeded/);
});
```

### 2. Handoff Validation (`src/handoff.ts`)

`validateHandoffShape` rejects the ENTIRE handoff when any field is invalid. It does NOT filter out bad items.

```typescript
it("rejects entire handoff when one field is invalid", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  const handoff = {
    type: "handoff",
    status: "success",
    summary: "Valid summary",
    findings: ["Valid finding"],
    confidence: 150, // Invalid: should be 0-1
  };

  const result = validateHandoffShape(handoff);
  expect(result).toBeNull(); // Entire handoff rejected
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("confidence"),
  );

  warnSpy.mockRestore();
});
```

### 3. Artifact Validation (`src/handoff.ts`)

`isArtifact()` is called by `validateHandoffShape`. Invalid artifacts cause the whole handoff to be rejected.

```typescript
it("rejects handoff with invalid artifact", () => {
  const handoff = {
    type: "handoff",
    status: "success",
    summary: "Valid",
    findings: ["Finding"],
    artifacts: [{ type: "unknown", content: "test" }], // Invalid type
  };

  expect(validateHandoffShape(handoff)).toBeNull();
});
```

### 4. Tree Rendering (`src/output-handler.ts`)

Test with multiple root nodes to verify `isLast` logic:

```typescript
it("renders multiple root nodes correctly", () => {
  const tree = [
    { id: "a", children: [{ id: "a1" }] },
    { id: "b", children: [{ id: "b1" }, { id: "b2" }] },
  ];

  const output = renderTree(tree);
  // Verify proper indentation and branch characters
  expect(output).toContain("├── a");
  expect(output).toContain("└── b");
});
```

### 5. Audit Logging (`src/audit-logger.ts`)

`recordAudit()` shallow-copies entries before storing. Test immutability:

```typescript
it("shallow copies audit entries to prevent mutation", () => {
  const entry = {
    extensionId: "original",
    outcome: "success" as const,
    timestamp: Date.now(),
  };

  recordAudit(entry);

  // Mutate the original
  entry.extensionId = "MUTATED";
  entry.outcome = "error" as const;

  // Stored copy should be unaffected
  const log = getAuditLog();
  expect(log[0].extensionId).toBe("original");
  expect(log[0].outcome).toBe("success");
});
```

### 6. Rate Limiting (`src/cross-extension-rpc.ts`)

Rate limits are module-level global state with last-call-wins semantics. Always reset in `beforeEach`:

```typescript
import { resetRpcRateLimitsForTests, configureRateLimit, getRateLimitConfig } from "../src/cross-extension-rpc.js";

describe("RPC rate limiting", () => {
  beforeEach(() => {
    resetRpcRateLimitsForTests();
  });

  it("respects custom rate limits", () => {
    configureRateLimit("spawn", 2, 60000); // 2 per minute

    expect(getRateLimitConfig("spawn")).toEqual({
      maxCalls: 2,
      windowMs: 60000,
    });
  });

  it("blocks calls exceeding limit", async () => {
    configureRateLimit("spawn", 1, 60000);

    // First call succeeds
    const result1 = await rpcSpawn({ type: "Explore" });
    expect(result1.success).toBe(true);

    // Second call is rate limited
    const result2 = await rpcSpawn({ type: "Explore" });
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("rate limited");
  });
});
```

### 7. Audit Trail Integration (`src/cross-extension-rpc.ts`)

The `auditedRpc()` wrapper resolves caller identity eagerly. Test all 4 outcomes:

```typescript
it("audits all RPC outcomes", async () => {
  resetAuditLogger();
  resetRpcRateLimitsForTests();

  // Test success
  await auditedRpc("spawn", validPayload);
  expect(getAuditLog()[0].outcome).toBe("success");

  // Test error
  await auditedRpc("spawn", invalidPayload);
  expect(getAuditLog()[1].outcome).toBe("error");

  // Test rate_limited
  configureRateLimit("spawn", 0, 60000);
  await auditedRpc("spawn", validPayload);
  expect(getAuditLog()[2].outcome).toBe("rate_limited");

  // Test unauthorized
  await auditedRpc("spawn", validPayload, { unauthorized: true });
  expect(getAuditLog()[3].outcome).toBe("unauthorized");
});
```

### 8. Module-Level State Isolation

Many modules use module-scoped `let` variables. Always reset state:

```typescript
// src/settings.ts example
describe("settings", () => {
  beforeEach(() => {
    resetSettingsForTests();
  });

  afterEach(() => {
    resetSettingsForTests();
  });

  it("has clean state", () => {
    expect(getSettings()).toEqual(defaultSettings);
  });
});
```

**Common reset functions:**
- `resetAuditLogger()`
- `resetRpcRateLimitsForTests()`
- `resetSettingsForTests()` (if available)

## Testing Immutability Patterns

When a function claims to store a copy (shallow or deep), write an adversarial test:

1. Create an object, pass it to the function
2. Mutate every field on the original object
3. Retrieve the stored version and assert all fields retained original values
4. This test should FAIL if the copy is removed — that's what makes it adversarial

```typescript
// Example: Testing shallow copy in recordAudit
const entry = {
  extensionId: "original",
  outcome: "success" as const,
  timestamp: Date.now(),
  metadata: { key: "value" }, // Nested object
};

recordAudit(entry);

// Mutate original
entry.extensionId = "MUTATED";
entry.outcome = "error" as const;
entry.metadata.key = "MUTATED";

// Shallow copy: top-level fields protected
expect(getAuditLog()[0].extensionId).toBe("original");
expect(getAuditLog()[0].outcome).toBe("success");

// But nested objects may share reference (shallow copy limitation)
// If deep copy is required, test that too:
expect(getAuditLog()[0].metadata.key).toBe("value");
```

## Performance Benchmarks

Benchmark tests use `toBeLessThan` thresholds, not `console.log`:

```typescript
// test/dashboard-render-perf.test.ts
it("renders 100 agents in < 16ms (60fps)", () => {
  const agents = mockAgents(100);
  const start = performance.now();
  renderDashboard(agents);
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(16);
});

it("renders 1000 agents in < 100ms", () => {
  const agents = mockAgents(1000);
  const start = performance.now();
  renderDashboard(agents);
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(100);
});
```

**Benchmark logging helper** (from actual test file):

```typescript
function benchmarkLog(
  label: string,
  measured: number,
  threshold: number,
  unit = "ms",
): void {
  const pct = threshold > 0 ? (measured / threshold) * 100 : 0;
  let status: string;

  if (measured > threshold) {
    status = "FAIL";
    console.warn(`BENCHMARK FAIL: ${label} — ${measured} exceeds threshold ${threshold}`);
  } else if (pct > 80) {
    status = "WARN";
    console.warn(`BENCHMARK WARN: ${label} — ${measured} at ${pct.toFixed(0)}% of threshold`);
  } else {
    status = "PASS";
    console.log(`BENCHMARK PASS: ${label} — ${measured}${unit} (${pct.toFixed(0)}%)`);
  }
}
```

## Test Utilities and Helpers

### Creating a Mock Event Bus

```typescript
import type { EventBus } from "../src/cross-extension-rpc.js";

function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => { listeners.get(event)?.delete(handler); };
    },
    emit(event, data) {
      for (const handler of listeners.get(event) ?? []) handler(data);
    },
  };
}
```

### Mock Agent Factory

```typescript
function mockAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: `agent-${Math.random().toString(36).slice(2)}`,
    type: "Explore",
    description: "Test agent",
    status: "running",
    toolUses: 0,
    startedAt: Date.now(),
    spawnedAt: Date.now(),
    ...overrides,
  };
}

function mockAgents(count: number): AgentRecord[] {
  return Array.from({ length: count }, (_, i) => mockAgent({
    id: `agent-${i}`,
    status: i % 3 === 0 ? "running" : i % 3 === 1 ? "completed" : "queued",
  }));
}
```

### Mock Pi API

```typescript
const mockPi = {
  createAgentSession: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue({ responseText: "done" }),
    abort: vi.fn(),
    steer: vi.fn(),
  }),
  events: createEventBus(),
};
```

## Debugging Test Failures

### Step 1: Isolate the Failure

```bash
# Run single failing test
npx vitest run test/handoff.test.ts -t "returns null when summary is missing"

# Run with verbose output
npx vitest run test/handoff.test.ts --reporter=verbose

# Run with debug logging
DEBUG=1 npx vitest run test/handoff.test.ts
```

### Step 2: Check for State Pollution

```bash
# Run tests in isolation (no parallel)
npx vitest run --no-threads test/handoff.test.ts

# Run single test file alone
npx vitest run test/handoff.test.ts

# If it passes alone but fails in suite, look for:
# - Missing beforeEach/afterEach resets
# - Module-level state pollution
# - Shared temp directories
```

### Step 3: Add Logging

```typescript
it("debugs mysterious failure", () => {
  const result = someFunction();
  console.log("Result:", JSON.stringify(result, null, 2));
  console.log("Type:", typeof result);
  console.log("Keys:", Object.keys(result));

  // Or use vitest's debug
  expect(result).toBeDefined();
});
```

### Step 4: Check for Race Conditions

```typescript
// Add explicit delays to expose races
it("handles concurrent access", async () => {
  const promises = [
    asyncOperation(),
    new Promise((r) => setTimeout(r, 10)).then(asyncOperation),
    new Promise((r) => setTimeout(r, 20)).then(asyncOperation),
  ];

  const results = await Promise.all(promises);
  expect(results).toHaveLength(3);
});
```

### Step 5: Use `vi.waitFor` for Async

```typescript
it("event eventually fires", async () => {
  const handler = vi.fn();
  emitter.on("event", handler);

  triggerEvent();

  // Wait up to 1 second for handler to be called
  await vi.waitFor(() => expect(handler).toHaveBeenCalled(), {
    timeout: 1000,
    interval: 50,
  });
});
```

### Common Failure Patterns

| Symptom | Cause | Fix |
|---------|-------|-----|
| Passes alone, fails in suite | State pollution | Add `beforeEach` reset |
| Fails only on Windows | Path separators / temp dirs | Use `path.join()`, ignore cleanup errors |
| Timeout | Missing `await` | Add `await` to async assertions |
| `undefined` result | Mock not set up | Check `vi.mock` paths and return values |
| Type error after change | Import without `.js` | Add `.js` extension to imports |
| `as any` type error | Using `any` in mock | Include all required fields in mock |

## Code Conventions for Tests

- No `any` types (AGENTS.md rule)
- Conventional commits format
- Biome for formatting/linting (not ESLint/Prettier)
- `Number.isInteger()` does NOT narrow TypeScript types — always pair with `!== undefined` checks when the source type is `T | undefined`
- Tests use `describe`/`it` (not `test`)
- Mock implementations should be typed properly

## CI Test Configuration

The test suite runs in CI with these settings:

```yaml
# .github/workflows/test.yml (inferred)
- name: Run tests
  run: npm test
  continue-on-error: false

# Flaky tests are marked continue-on-error in CI
# schedule.test.ts and schedule-e2e.test.ts on Windows
```

## References

- **Benchmark examples:** `references/benchmark-examples.md`
- **Test utilities:** `references/test-utilities.md`
- **Vitest documentation:** https://vitest.dev/
- **Known flaky tests:** See AGENTS.md section "Test flakiness"

## Devin Secrets Needed

None — this is a pure library/extension with no external service dependencies for testing.
