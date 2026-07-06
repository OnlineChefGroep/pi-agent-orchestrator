/**
 * render-metrics.test.ts — Unit tests for RenderMetrics performance tracking.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { RenderMetrics } from "../src/ui/render-metrics.js";

describe("RenderMetrics — basic tracking", () => {
  let metrics: RenderMetrics;

  beforeEach(() => {
    metrics = new RenderMetrics("test", 100);
  });

  it("starts with zero counts", () => {
    const s = metrics.snapshot();
    expect(s.renderCount).toBe(0);
    expect(s.meanMs).toBe(0);
    expect(s.minMs).toBe(0);
    expect(s.maxMs).toBe(0);
    expect(s.lastMs).toBe(0);
  });

  it("records a single render duration", () => {
    metrics.record(5);
    const s = metrics.snapshot();
    expect(s.renderCount).toBe(1);
    expect(s.lastMs).toBe(5);
    expect(s.meanMs).toBe(5);
    expect(s.minMs).toBe(5);
    expect(s.maxMs).toBe(5);
  });

  it("tracks min/mean/max across multiple records", () => {
    metrics.record(10);
    metrics.record(20);
    metrics.record(30);

    const s = metrics.snapshot();
    expect(s.renderCount).toBe(3);
    expect(s.minMs).toBe(10);
    expect(s.maxMs).toBe(30);
    expect(s.meanMs).toBe(20);
    expect(s.lastMs).toBe(30);
  });

  it("reset clears all counters", () => {
    metrics.record(42);
    expect(metrics.count).toBe(1);
    metrics.recordRequested();
    metrics.setFirstSpawnTimestamp(1000);

    metrics.reset();
    const s = metrics.snapshot();
    expect(s.renderCount).toBe(0);
    expect(s.meanMs).toBe(0);
    expect(s.minMs).toBe(0);
    expect(s.maxMs).toBe(0);
    expect(s.lastMs).toBe(0);
    expect(s.requestedRenderCount).toBe(0);
    expect(s.activeAgentCount).toBe(0);
    expect(s.timeToFirstVisibleMs).toBe(0);
  });
});

describe("RenderMetrics — requested vs actual (debounce tracking)", () => {
  it("requestedRenderCount starts at 0", () => {
    const m = new RenderMetrics("r", 100);
    expect(m.snapshot().requestedRenderCount).toBe(0);
  });

  it("recordRequested increments counter", () => {
    const m = new RenderMetrics("r", 100);
    m.recordRequested();
    m.recordRequested();
    m.recordRequested();
    expect(m.snapshot().requestedRenderCount).toBe(3);
  });

  it("skippedCount = requested - actual with no debounce", () => {
    const m = new RenderMetrics("r", 100);
    m.recordRequested();
    m.record(5);
    expect(m.snapshot().skippedRenderCount).toBe(0);
  });

  it("skippedCount > 0 when requests outpace actual renders", () => {
    const m = new RenderMetrics("r", 100);
    m.recordRequested();
    m.recordRequested();
    m.recordRequested();
    m.record(10); // 3 requests, 1 actual = 2 skipped
    const s = m.snapshot();
    expect(s.skippedRenderCount).toBe(2);
    expect(s.requestToActualRatio).toBe(3);
  });

  it("skippedCount never goes negative", () => {
    const m = new RenderMetrics("r", 100);
    m.record(5); // 1 actual, 0 requests
    expect(m.snapshot().skippedRenderCount).toBe(0);
  });

  it("recordRequested returns the count", () => {
    const m = new RenderMetrics("r", 100);
    expect(m.recordRequested()).toBe(1);
    expect(m.recordRequested()).toBe(2);
  });
});

describe("RenderMetrics — active agents tracking", () => {
  it("tracks active agents per render call", () => {
    const m = new RenderMetrics("a", 100);
    m.record(5, 3);
    m.record(8, 7);
    m.record(3, 5);

    const s = m.snapshot();
    expect(s.activeAgentCount).toBe(3);
    expect(s.activeAgentMin).toBe(3);
    expect(s.activeAgentMax).toBe(7);
    expect(s.activeAgentMean).toBe(5);
  });

  it("handles renders without active agent data", () => {
    const m = new RenderMetrics("a", 100);
    m.record(5); // no agent data
    const s = m.snapshot();
    expect(s.activeAgentCount).toBe(0);
    expect(s.activeAgentMean).toBe(0);
  });
});

describe("RenderMetrics — time to first visible", () => {
  it("timeToFirstVisible is 0 when no spawn time set", () => {
    const m = new RenderMetrics("t", 100);
    m.record(5);
    expect(m.snapshot().timeToFirstVisibleMs).toBe(0);
  });

  it("computes time between spawn and first render", () => {
    const m = new RenderMetrics("t", 100);
    const spawnTime = Date.now() - 50; // 50ms ago
    m.setFirstSpawnTimestamp(spawnTime);
    m.record(5);
    const s = m.snapshot();
    expect(s.timeToFirstVisibleMs).toBeGreaterThanOrEqual(50);
    expect(s.timeToFirstVisibleMs).toBeLessThan(500); // sanity
  });

  it("setFirstSpawnTimestamp only accepts the earliest timestamp", () => {
    const m = new RenderMetrics("t", 100);
    m.setFirstSpawnTimestamp(2000); // later spawn
    m.setFirstSpawnTimestamp(1000); // earlier spawn (should win)
    const s = m.snapshot();
    expect(s.firstSpawnTimestamp).toBe(1000);
  });

  it("setFirstSpawnTimestamp ignores later timestamps", () => {
    const m = new RenderMetrics("t", 100);
    m.setFirstSpawnTimestamp(1000); // earlier
    m.setFirstSpawnTimestamp(2000); // later — should be ignored
    expect(m.snapshot().firstSpawnTimestamp).toBe(1000);
  });
});

describe("RenderMetrics — render rate", () => {
  it("rendersPerSecond is 0 when no renders happened", () => {
    const m = new RenderMetrics("r", 100);
    const s = m.snapshot();
    expect(s.rendersPerSecond).toBe(0);
    expect(s.rendersPerMinute).toBe(0);
  });

  it("rendersPerSecond is computed after some elapsed time", async () => {
    const m = new RenderMetrics("r", 100);
    // Wait a tick so startedAt is in the past
    await new Promise((resolve) => setTimeout(resolve, 10));
    m.record(1);
    m.record(2);
    m.record(3);
    const s = m.snapshot();
    // elapsedMs should be >= 10ms now
    expect(s.elapsedMs).toBeGreaterThanOrEqual(10);
    expect(s.rendersPerSecond).toBeGreaterThan(0);
    expect(s.rendersPerMinute).toBeGreaterThan(0);
  });

  it("elapsedMs increases over time", async () => {
    const m = new RenderMetrics("r", 100);
    const s1 = m.snapshot();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const s2 = m.snapshot();
    expect(s2.elapsedMs).toBeGreaterThan(s1.elapsedMs);
  });
});

describe("RenderMetrics — getters", () => {
  it("count getter matches renderCount", () => {
    const m = new RenderMetrics("g", 100);
    expect(m.count).toBe(0);
    m.record(5);
    expect(m.count).toBe(1);
  });

  it("requestedCount getter", () => {
    const m = new RenderMetrics("g", 100);
    expect(m.requestedCount).toBe(0);
    m.recordRequested();
    expect(m.requestedCount).toBe(1);
  });

  it("mean, min, max, last getters return correct values", () => {
    const m = new RenderMetrics("g", 100);
    m.record(3);
    m.record(7);
    m.record(5);

    expect(m.mean).toBe(5);
    expect(m.min).toBe(3);
    expect(m.max).toBe(7);
    expect(m.last).toBe(5);
  });
});
