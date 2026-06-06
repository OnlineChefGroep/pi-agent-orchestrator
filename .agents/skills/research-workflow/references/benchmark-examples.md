# Benchmark Examples

## Vitest Benchmark Pattern

```typescript
// test/widget-render-perf.test.ts
import { describe, it, expect } from "vitest";
import { renderAgentWidget } from "../src/ui/agent-widget-renderer.js";

function mockAgents(count: number): AgentRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `agent-${i}`,
    type: "Explore",
    description: "Test agent",
    status: i % 3 === 0 ? "running" : i % 3 === 1 ? "completed" : "queued",
    toolUses: i * 2,
    startedAt: Date.now() - i * 1000,
    spawnedAt: Date.now() - i * 1000,
  }));
}

describe("widget render performance", () => {
  it("renders 100 agents in < 16ms (60fps)", () => {
    const agents = mockAgents(100);
    const start = performance.now();
    renderAgentWidget(agents, 0);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(16);
  });

  it("renders 1000 agents in < 100ms", () => {
    const agents = mockAgents(1000);
    const start = performance.now();
    renderAgentWidget(agents, 0);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("virtual scroll 10k agents smoothly", () => {
    const agents = mockAgents(10000);
    const times: number[] = [];

    // Simulate scrolling through 10 frames
    for (let frame = 0; frame < 10; frame++) {
      const start = performance.now();
      renderAgentWidget(agents, frame);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);

    expect(avg).toBeLessThan(16);
    expect(max).toBeLessThan(33); // Allow one slow frame
  });
});
```

## A/B Test Pattern

```typescript
// test/ab-test-pattern.test.ts
import { describe, it, expect } from "vitest";

function measureTime<T>(fn: () => T, runs = 5): { avg: number; min: number; max: number } {
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  return {
    avg: times.reduce((a, b) => a + b, 0) / runs,
    min: Math.min(...times),
    max: Math.max(...times),
  };
}

function compareImplementations(
  name: string,
  baseline: () => void,
  optimized: () => void,
  expectedImprovement = 10,
) {
  describe(`${name} A/B test`, () => {
    it(`optimized is ${expectedImprovement}% faster`, () => {
      const base = measureTime(baseline, 10);
      const opt = measureTime(optimized, 10);

      const improvement = ((base.avg - opt.avg) / base.avg) * 100;

      console.log(`Baseline: ${base.avg.toFixed(2)}ms (min: ${base.min.toFixed(2)}, max: ${base.max.toFixed(2)})`);
      console.log(`Optimized: ${opt.avg.toFixed(2)}ms (min: ${opt.min.toFixed(2)}, max: ${opt.max.toFixed(2)})`);
      console.log(`Improvement: ${improvement.toFixed(1)}%`);

      expect(improvement).toBeGreaterThanOrEqual(expectedImprovement);
    });
  });
}

// Usage
compareImplementations(
  "dashboard render",
  () => renderDashboardBaseline(mockAgents(100)),
  () => renderDashboardOptimized(mockAgents(100)),
  15,
);
```

## Regression Guard Pattern

```typescript
// test/regression-guard.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";

const BASELINE_FILE = ".research/baselines.json";

function loadBaselines(): Record<string, number> {
  if (!fs.existsSync(BASELINE_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf-8"));
}

function saveBaselines(baselines: Record<string, number>): void {
  fs.mkdirSync(".research", { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baselines, null, 2));
}

describe("performance regression guard", () => {
  const baselines = loadBaselines();

  it("dashboard render has not regressed", () => {
    const start = performance.now();
    renderDashboard(mockAgents(100));
    const elapsed = performance.now() - start;

    const baseline = baselines["dashboard-render"];
    if (baseline) {
      // Allow 10% variance
      expect(elapsed).toBeLessThan(baseline * 1.1);
    } else {
      // First run - save baseline
      baselines["dashboard-render"] = elapsed;
      saveBaselines(baselines);
    }
  });
});
```

## Memory Benchmark Pattern

```typescript
// test/memory-bench.test.ts
import { describe, it, expect } from "vitest";

function getMemoryUsage(): number {
  if (global.gc) {
    global.gc(); // Force garbage collection
  }
  return process.memoryUsage().heapUsed;
}

function measureMemory(fn: () => void): { before: number; after: number; delta: number } {
  const before = getMemoryUsage();
  fn();
  const after = getMemoryUsage();

  return {
    before,
    after,
    delta: after - before,
  };
}

describe("memory benchmarks", () => {
  it("dashboard render uses < 10MB", () => {
    const mem = measureMemory(() => {
      renderDashboard(mockAgents(1000));
    });

    expect(mem.delta).toBeLessThan(10 * 1024 * 1024); // 10MB
  });

  it("agent creation does not leak memory", () => {
    const deltas: number[] = [];

    for (let i = 0; i < 100; i++) {
      const mem = measureMemory(() => {
        createAgent({ type: "Explore", description: "test" });
      });
      deltas.push(mem.delta);
    }

    // Average should be near zero (no leak)
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    expect(avg).toBeLessThan(1024); // Less than 1KB per agent
  });
});
```

## Bundle Size Benchmark

```typescript
// test/bundle-size.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";

function getBundleSize(path: string): number {
  return fs.statSync(path).size;
}

const BASELINE_SIZE = 500000; // 500KB

describe("bundle size", () => {
  it("dashboard bundle is < 500KB", () => {
    const size = getBundleSize("dist/ui/dashboard/index.js");
    expect(size).toBeLessThan(BASELINE_SIZE);
  });

  it("total bundle has not grown > 10%", () => {
    const current = getBundleSize("dist/index.js");
    const baseline = BASELINE_SIZE;
    const growth = ((current - baseline) / baseline) * 100;

    expect(growth).toBeLessThan(10);
  });
});
```

## Multi-Iteration Stability Test

```typescript
// test/stability-bench.test.ts
import { describe, it, expect } from "vitest";

function measureStability(
  fn: () => void,
  iterations = 20,
): { mean: number; stdDev: number; cv: number } {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  return { mean, stdDev, cv };
}

describe("stability benchmarks", () => {
  it("dashboard render is stable (CV < 0.2)", () => {
    const stats = measureStability(() => renderDashboard(mockAgents(100)), 20);

    console.log(`Mean: ${stats.mean.toFixed(2)}ms`);
    console.log(`StdDev: ${stats.stdDev.toFixed(2)}ms`);
    console.log(`CV: ${stats.cv.toFixed(3)}`);

    expect(stats.cv).toBeLessThan(0.2); // Coefficient of variation < 20%
  });
});
```
