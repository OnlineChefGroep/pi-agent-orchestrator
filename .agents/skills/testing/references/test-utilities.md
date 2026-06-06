# Test Utilities Reference

## Mock Factories

### AgentRecord Mock

```typescript
import type { AgentRecord } from "../src/types.js";

export function mockAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  const now = Date.now();
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    type: "Explore",
    description: "Test agent for unit tests",
    status: "running",
    toolUses: 0,
    startedAt: now,
    spawnedAt: now,
    ...overrides,
  };
}

export function mockAgents(count: number, overrides: Partial<AgentRecord> = {}): AgentRecord[] {
  return Array.from({ length: count }, (_, i) =>
    mockAgent({
      id: `agent-${i}`,
      status: i % 3 === 0 ? "running" : i % 3 === 1 ? "completed" : "queued",
      ...overrides,
    }),
  );
}
```

### AgentActivity Mock

```typescript
import type { AgentActivity } from "../src/ui/agent-ui-types.js";

export function mockActivity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    inputTokens: 100,
    outputTokens: 200,
    toolUses: 5,
    turns: 3,
    startTime: Date.now() - 60000,
    lastUpdate: Date.now(),
    ...overrides,
  };
}
```

### Handoff Mock

```typescript
import type { AgentHandoff } from "../src/handoff.js";

export function mockHandoff(overrides: Partial<AgentHandoff> = {}): AgentHandoff {
  return {
    type: "handoff",
    status: "success",
    summary: "Test handoff summary",
    findings: ["Finding 1", "Finding 2"],
    nextSteps: ["Step 1"],
    confidence: 0.95,
    evidence: ["Evidence 1"],
    files: ["src/test.ts"],
    artifacts: [],
    ...overrides,
  };
}
```

## Event Bus Mock

```typescript
import type { EventBus } from "../src/cross-extension-rpc.js";

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  return {
    on(event: string, handler: (data: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => { listeners.get(event)?.delete(handler); };
    },
    emit(event: string, data: unknown) {
      for (const handler of listeners.get(event) ?? []) handler(data);
    },
  };
}
```

## Pi API Mock

```typescript
import { vi } from "vitest";

export function createMockPi() {
  return {
    createAgentSession: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ responseText: "done", toolCalls: [] }),
      abort: vi.fn(),
      steer: vi.fn(),
    }),
    events: createEventBus(),
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
  };
}
```

## Temp Directory Helper

```typescript
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createTempDir(prefix = "pi-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures (Windows race)
  }
}

export function writeJson(dir: string, filename: string, data: unknown): void {
  writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));
}
```

## Time Helpers

```typescript
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

export async function measureAsyncTime<T>(fn: () => Promise<T>): Promise<{ result: T; elapsed: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, elapsed: performance.now() - start };
}
```

## Assertion Helpers

```typescript
import { expect } from "vitest";

export function expectWithinRange(
  actual: number,
  expected: number,
  tolerance: number,
): void {
  const diff = Math.abs(actual - expected);
  expect(diff).toBeLessThanOrEqual(tolerance);
}

export function expectImproved(
  baseline: number,
  optimized: number,
  minImprovementPercent = 10,
): void {
  const improvement = ((baseline - optimized) / baseline) * 100;
  expect(improvement).toBeGreaterThanOrEqual(minImprovementPercent);
}

export function expectNoRegression(
  baseline: number,
  current: number,
  maxRegressionPercent = 10,
): void {
  const regression = ((current - baseline) / baseline) * 100;
  expect(regression).toBeLessThanOrEqual(maxRegressionPercent);
}
```

## Console Spy Helpers

```typescript
import { vi } from "vitest";

export function spyOnConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    restore() {
      this.warn.mockRestore();
      this.error.mockRestore();
      this.log.mockRestore();
    },
  };
}
```
