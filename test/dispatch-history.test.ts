/**
 * dispatch-history.test.ts — Pin down the ring-buffer semantics + the
 * histogram aggregator + the `subagent:dispatch_decision` telemetry emit.
 * The buffer is module-level state, so every test starts with
 * `resetDispatchHistory()` to keep sibling cases independent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the telemetry module BEFORE importing dispatch-history so the mock
// captures the `emitTelemetry` binding at module-eval time. `vi.hoisted`
// guarantees the spy factory is in place when the import below resolves.
const { emitTelemetry } = vi.hoisted(() => ({
  emitTelemetry: vi.fn(),
}));
vi.mock("../src/telemetry.js", () => ({ emitTelemetry }));

import {
  clearDispatchHistory,
  computeDispatchHistogram,
  configureDispatchHistory,
  getDispatchHistory,
  getDispatchHistoryOldestFirst,
  recordDispatchDecision,
  resetDispatchHistory,
} from "../src/dispatch-history.js";

const NOW = 1_700_000_000_000;

// Frozen timestamp helper: vitest spies on Date.now() in beforeEach.
const _fixedNow = () => NOW;

describe("dispatch-history ring buffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    resetDispatchHistory();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a single decision and exposes it via getters", () => {
    recordDispatchDecision({
      kind: "single",
      configuredMode: "single",
      source: "explicit",
      promptLength: 100,
      description: "fix typo",
    });
    const all = getDispatchHistory();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      kind: "single",
      configuredMode: "single",
      source: "explicit",
      promptLength: 100,
      description: "fix typo",
      timestamp: NOW,
    });
  });

  it("preserves insertion order: newest → oldest for getDispatchHistory, oldest → newest for the sorted variant", () => {
    recordDispatchDecision({ kind: "single", configuredMode: "auto", source: "auto-heuristic", promptLength: 50, description: "a" });
    vi.setSystemTime(new Date(NOW + 1000));
    recordDispatchDecision({ kind: "crew",   configuredMode: "auto", source: "auto-heuristic", promptLength: 60, description: "b" });
    vi.setSystemTime(new Date(NOW + 2000));
    recordDispatchDecision({ kind: "swarm",  configuredMode: "swarm", source: "explicit", promptLength: 70, description: "c" });

    const newestFirst = getDispatchHistory().map((d) => d.description);
    expect(newestFirst).toEqual(["c", "b", "a"]);

    const oldestFirst = getDispatchHistoryOldestFirst().map((d) => d.description);
    expect(oldestFirst).toEqual(["a", "b", "c"]);

    // Timestamps travel with the description so the sort can be audited.
    const oldestTs = getDispatchHistoryOldestFirst().map((d) => d.timestamp);
    expect(oldestTs).toEqual([NOW, NOW + 1000, NOW + 2000]);
  });

  it("slides oldest off the head when the cap is exceeded (true FIFO ring)", () => {
    configureDispatchHistory({ maxEntries: 3 });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "first" });
    vi.setSystemTime(new Date(NOW + 1));
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "second" });
    vi.setSystemTime(new Date(NOW + 2));
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "third" });
    vi.setSystemTime(new Date(NOW + 3));
    // Evicts "first" → "second" → "third" → "fourth"
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "fourth" });
    expect(getDispatchHistory().map((d) => d.description)).toEqual(["fourth", "third", "second"]);
  });

  it("trims the existing buffer when configure lowers the cap below current length", () => {
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "1" });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "2" });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "3" });
    expect(getDispatchHistory()).toHaveLength(3);
    configureDispatchHistory({ maxEntries: 1 });
    expect(getDispatchHistory().map((d) => d.description)).toEqual(["3"]);
  });

  it("ignores a non-positive maxEntries override (defensive, no crash)", () => {
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 10, description: "x" });
    configureDispatchHistory({ maxEntries: 0 });
    // Cap unchanged (still default) so the entry survives.
    expect(getDispatchHistory()).toHaveLength(1);
    configureDispatchHistory({ maxEntries: -1 });
    expect(getDispatchHistory()).toHaveLength(1);
    configureDispatchHistory({ maxEntries: Number.NaN });
    expect(getDispatchHistory()).toHaveLength(1);
  });

  it("shallow-copies the recorded decision so external mutation cannot corrupt the buffer", () => {
    const decision = {
      kind: "single" as const,
      configuredMode: "single" as const,
      source: "explicit" as const,
      promptLength: 10,
      description: "before",
    };
    recordDispatchDecision(decision);
    decision.description = "AFTER";
    decision.promptLength = 9999;
    expect(getDispatchHistory()[0]?.description).toBe("before");
    expect(getDispatchHistory()[0]?.promptLength).toBe(10);
  });

  it("ignores a kind-typed signature: any resolvable OrchestrationMode → explicit vs auto routing still works", () => {
    recordDispatchDecision({ kind: "crew", configuredMode: "crew", source: "explicit", promptLength: 5, description: "explicit-crew" });
    recordDispatchDecision({ kind: "single", configuredMode: "auto", source: "auto-heuristic", promptLength: 5, description: "auto-picked-single" });
    const tally = computeDispatchHistogram();
    expect(tally.byKind).toEqual({ single: 1, swarm: 0, crew: 1 });
    expect(tally.bySource).toEqual({ explicit: 1, autoHeuristic: 1 });
    expect(tally.autoPicks).toEqual({ single: 1, swarm: 0, crew: 0 });
    expect(tally.total).toBe(2);
  });
});

describe("computeDispatchHistogram", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    resetDispatchHistory();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the empty-state shape when the buffer is empty", () => {
    const h = computeDispatchHistogram();
    expect(h).toEqual({
      total: 0,
      byKind: { single: 0, swarm: 0, crew: 0 },
      bySource: { explicit: 0, autoHeuristic: 0 },
      autoPicks: { single: 0, swarm: 0, crew: 0 },
      bufferCapacity: 200,
      lastDecisionAt: null,
    });
  });

  it("aggregates per-kind, per-source, and per-auto-pick into the right buckets", () => {
    // 4 explicit + 4 auto-heuristic
    for (let i = 0; i < 2; i++) {
      recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 1, description: "" });
      recordDispatchDecision({ kind: "swarm", configuredMode: "swarm", source: "explicit", promptLength: 1, description: "" });
    }
    // auto picks: 1 single, 2 swarm, 1 crew
    recordDispatchDecision({ kind: "single", configuredMode: "auto", source: "auto-heuristic", promptLength: 1, description: "" });
    recordDispatchDecision({ kind: "swarm",  configuredMode: "auto", source: "auto-heuristic", promptLength: 1, description: "" });
    recordDispatchDecision({ kind: "swarm",  configuredMode: "auto", source: "auto-heuristic", promptLength: 1, description: "" });
    recordDispatchDecision({ kind: "crew",   configuredMode: "auto", source: "auto-heuristic", promptLength: 1, description: "" });

    const h = computeDispatchHistogram();
    expect(h.total).toBe(8);
    expect(h.byKind).toEqual({ single: 3, swarm: 4, crew: 1 });
    expect(h.bySource).toEqual({ explicit: 4, autoHeuristic: 4 });
    expect(h.autoPicks).toEqual({ single: 1, swarm: 2, crew: 1 });
  });

  it("tracks the most recent timestamp from the buffer (relies on witnessing, not on insertion order)", () => {
    vi.setSystemTime(new Date(NOW));
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 1, description: "early" });
    vi.setSystemTime(new Date(NOW + 5000));
    recordDispatchDecision({ kind: "crew", configuredMode: "crew", source: "explicit", promptLength: 1, description: "later" });
    // Out-of-order write: a smaller timestamp arrives third. The `max()`
    // policy picks the largest *value* seen, which is correct for a
    // "last decision" semantic — a regression here would surface as the
    // wrong timestamp leaking into the rendered report.
    vi.setSystemTime(new Date(NOW + 2500));
    recordDispatchDecision({ kind: "swarm", configuredMode: "swarm", source: "explicit", promptLength: 1, description: "middle" });

    expect(computeDispatchHistogram().lastDecisionAt).toBe(NOW + 5000);
  });

  it("reflects a lowered bufferCapacity from configureDispatchHistory in the histogram", () => {
    configureDispatchHistory({ maxEntries: 12 });
    expect(computeDispatchHistogram().bufferCapacity).toBe(12);
  });

  it("clearDispatchHistory zeroes the histogram without changing the cap", () => {
    configureDispatchHistory({ maxEntries: 50 });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 1, description: "" });
    expect(computeDispatchHistogram().total).toBe(1);
    clearDispatchHistory();
    expect(computeDispatchHistogram().total).toBe(0);
    expect(computeDispatchHistogram().bufferCapacity).toBe(50);
  });

  it("resetDispatchHistory(cap included) reverts to defaults too", () => {
    configureDispatchHistory({ maxEntries: 7 });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 1, description: "" });
    resetDispatchHistory();
    const h = computeDispatchHistogram();
    expect(h.total).toBe(0);
    expect(h.bufferCapacity).toBe(200); // default
  });
});

// ── Telemetry emit coverage (locks the wire-up against regression) ─────────

/**
 * The telemetry emit is a side-effect on `recordDispatchDecision`. Without a
 * dedicated mock, a future refactor that drops `emitTelemetry("subagent:dispatch_decision", ...)`
 * would pass every ring-buffer + histogram test in this file while silently
 * breaking the wire to sentry / splunk / the Go cinematic sidecar. These
 * tests pin the contract down.
 *
 * The mock is bound at module-eval time via `vi.hoisted(...)` + `vi.mock`
 * BEFORE the `dispatch-history.js` import resolves, so the `emitTelemetry`
 * reference inside `dispatch-history` is the spy from the start of the test
 * run — no per-test setup race. The interception happens above (file-level)
 * not here.
 */
describe("dispatch-history → subagent:dispatch_decision telemetry", () => {
  beforeEach(() => {
    emitTelemetry.mockClear();
    resetDispatchHistory();
  });

  it("emits exactly one subagent:dispatch_decision per recordDispatchDecision call", () => {
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 30, description: "fix typo" });
    recordDispatchDecision({ kind: "crew",   configuredMode: "auto",   source: "auto-heuristic", promptLength: 800, description: "plan migration" });
    expect(emitTelemetry).toHaveBeenCalledTimes(2);
  });

  it("emits the resolved kind + configuredMode + source + promptLength + description (NOT the prompt body)", () => {
    recordDispatchDecision({
      kind: "crew",
      configuredMode: "auto",
      source: "auto-heuristic",
      promptLength: 1234,
      description: "Plan the migration to a new database",
    });
    expect(emitTelemetry).toHaveBeenCalledTimes(1);
    expect(emitTelemetry).toHaveBeenCalledWith("subagent:dispatch_decision", {
      kind: "crew",
      configuredMode: "auto",
      source: "auto-heuristic",
      promptLength: 1234,
      description: "Plan the migration to a new database",
    });
  });

  it("emits a defensive copy so a handler that mutates its payload cannot reach back into the buffer", () => {
    const payload = {
      kind: "single" as const,
      configuredMode: "single" as const,
      source: "explicit" as const,
      promptLength: 10,
      description: "before",
    };
    recordDispatchDecision(payload);
    // Mutate AFTER recording. The telemetry payload seen by emitTelemetry
    // should still read "before" + 10 — not "AFTER" + 9999.
    payload.description = "AFTER";
    payload.promptLength = 9999;
    const spy = emitTelemetry.mock.calls[0];
    const spyPayload = spy?.[1] as { description: string; promptLength: number };
    expect(spyPayload.description).toBe("before");
    expect(spyPayload.promptLength).toBe(10);
  });

  it("emits even when the call evicts an older entry (emit must run AFTER the push, not before)", () => {
    configureDispatchHistory({ maxEntries: 1 });
    recordDispatchDecision({ kind: "single", configuredMode: "single", source: "explicit", promptLength: 1, description: "old" });
    expect(emitTelemetry).toHaveBeenCalledTimes(1);
    // The 2nd call evicts "old"; emit MUST still fire for the new entry so
    // subscribers see the survivor, not the dropped one.
    recordDispatchDecision({ kind: "swarm", configuredMode: "swarm", source: "explicit", promptLength: 1, description: "new" });
    expect(emitTelemetry).toHaveBeenCalledTimes(2);
    expect(emitTelemetry).toHaveBeenLastCalledWith(
      "subagent:dispatch_decision",
      expect.objectContaining({ kind: "swarm", description: "new" }),
    );
  });
});
