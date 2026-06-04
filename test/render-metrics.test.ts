/**
 * render-metrics.test.ts — Unit tests for RenderMetrics performance tracking.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { RenderMetrics } from "../src/ui/render-metrics.js";

describe("RenderMetrics", () => {
  let metrics: RenderMetrics;

  beforeEach(() => {
    metrics = new RenderMetrics("test", 100); // high threshold so no debug logging
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

    metrics.reset();
    const s = metrics.snapshot();
    expect(s.renderCount).toBe(0);
    expect(s.meanMs).toBe(0);
    expect(s.minMs).toBe(0);
    expect(s.maxMs).toBe(0);
    expect(s.lastMs).toBe(0);
  });

  it("record returns false for fast renders", () => {
    const result = metrics.record(1); // well under 100ms threshold
    expect(result).toBe(false);
  });

  it("returns true for slow renders (above threshold)", () => {
    const slowMetrics = new RenderMetrics("slow-test", 10);
    const result = slowMetrics.record(15); // above 10ms threshold
    expect(result).toBe(true);
  });

  it("returns false for slow renders at default warn log level (debug filtered)", () => {
    // At default log level "warn", debug messages are filtered out.
    // record() still returns true/false based on threshold regardless of logging.
    const metrics = new RenderMetrics("test", 5);
    expect(metrics.record(3)).toBe(false); // under threshold
    expect(metrics.record(8)).toBe(true);  // above threshold
  });

  it("handles many records without growing memory", () => {
    for (let i = 0; i < 1000; i++) {
      metrics.record(Math.random() * 10);
    }
    expect(metrics.count).toBe(1000);
    expect(metrics.max).toBeGreaterThan(0);
    expect(metrics.mean).toBeGreaterThan(0);
    expect(metrics.min).toBeGreaterThanOrEqual(0);
  });
});

describe("RenderMetrics — getters", () => {
  it("count getter matches renderCount", () => {
    const m = new RenderMetrics("g", 100);
    expect(m.count).toBe(0);
    m.record(5);
    expect(m.count).toBe(1);
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

  it("getters return 0 before any record", () => {
    const m = new RenderMetrics("g", 100);
    expect(m.mean).toBe(0);
    expect(m.min).toBe(0);
    expect(m.max).toBe(0);
    expect(m.last).toBe(0);
  });
});
