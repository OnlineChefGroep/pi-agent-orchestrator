/**
 * widget-render-perf.test.ts — Performance benchmarks for agent widget rendering.
 *
 * Measures renderAgentWidget, buildSnapshot, and getVisibleWindow across
 * varying agent counts (10, 50, 200) and status distributions.
 *
 * Uses generous bounds (5-10x expected) to avoid flakiness on CI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRecord } from "../src/types.js";
import type { AgentActivity } from "../src/ui/agent-ui-types.js";

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock truncateToWidth / visibleWidth from pi-tui
vi.mock("@earendil-works/pi-tui", () => ({
  truncateToWidth: (str: string) => str,
  visibleWidth: (str: string) => str.length,
}));

// Mock agent-registry — getUiStyle returns "premium"
vi.mock("../src/agent-registry.js", () => ({
  getUiStyle: () => "premium",
}));

// Mock agent-types — getConfig used by getDisplayName
vi.mock("../src/agent-types.js", () => ({
  getConfig: (type: string) => ({
    name: type,
    displayName: type === "Explore" ? "Explore" : type === "Plan" ? "Plan" : type,
    promptMode: undefined,
    maxMemoryLines: 20,
  }),
}));

// Mock usage — return simple token counts
vi.mock("../src/usage.js", () => ({
  getLifetimeTotal: (usage?: { input: number }) => usage?.input ?? 0,
  getSessionContextPercent: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let agentIdCounter = 0;

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  agentIdCounter++;
  const id = overrides.id ?? `agent-${agentIdCounter}`;
  const startedAt = overrides.startedAt ?? Date.now() - Math.random() * 60000;
  return {
    id,
    type: overrides.type ?? "Explore",
    description: overrides.description ?? `benchmark agent ${agentIdCounter}`,
    status: overrides.status ?? "running",
    toolUses: overrides.toolUses ?? Math.floor(Math.random() * 20),
    startedAt,
    spawnedAt: startedAt,
    lifetimeUsage: { input: Math.floor(Math.random() * 50000), output: Math.floor(Math.random() * 10000), cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 1,
    completedAt: overrides.completedAt,
    ...overrides,
  } as AgentRecord;
}

/** Build N agents with a specific status distribution. */
function buildAgentList(
  count: number,
  dist: { running?: number; queued?: number; finished?: number },
): AgentRecord[] {
  const agents: AgentRecord[] = [];
  const runPct = (dist.running ?? 0) / 100;
  const queuedPct = (dist.queued ?? 0) / 100;

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    let status: string;
    if (rand < runPct) {
      status = "running";
    } else if (rand < runPct + queuedPct) {
      status = "queued";
    } else {
      status = "completed";
    }

    const a = makeAgent({
      status,
      type: i % 3 === 0 ? "Explore" : i % 3 === 1 ? "Plan" : "general-purpose",
      completedAt: status === "completed" ? Date.now() : undefined,
    });
    agents.push(a);
  }
  return agents;
}

const testTheme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `<bold>${text}</bold>`,
};

const testTui = {
  terminal: { columns: 120 },
};

function alwaysShowFinished() {
  return true;
}

// ── Benchmark logging ──────────────────────────────────────────────────────

/**
 * Log a structured benchmark result line for CI threshold checking.
 * Writes to stdout so scripts/check-benchmark-thresholds.mjs can parse it.
 *
 * Format: [BENCHMARK] <name> <measured> <threshold> <unit> <OK|WARN|FAIL>
 * - OK: measured ≤ threshold
 * - WARN: threshold * 0.8 < measured ≤ threshold
 * - FAIL: measured > threshold
 */
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
    console.warn(
      `⚠️  BENCHMARK FAIL: ${label} — ${measured} exceeds threshold ${threshold}`,
    );
  } else if (pct > 80) {
    status = "WARN";
    console.warn(
      `⚠️  BENCHMARK WARN: ${label} — ${measured} approaching threshold ${threshold} (${pct.toFixed(0)}%)`,
    );
  } else {
    status = "OK";
  }
  const measuredStr = unit === "\u00b5s"
    ? `${measured.toFixed(3)}\u00b5s`
    : `${measured.toFixed(3)}ms`;
  const thresholdStr = unit === "\u00b5s"
    ? `${threshold.toFixed(3)}\u00b5s`
    : `${threshold.toFixed(3)}ms`;

  // Structured log line — plain text, machine-parseable
  process.stdout.write(
    `[BENCHMARK] ${label} ${measuredStr}/${thresholdStr} ${pct.toFixed(0)}% ${status}\n`,
  );
}

// ── Test data sizes ──────────────────────────────────────────────────────────

const SMALL = 10;
const MEDIUM = 50;
const LARGE = 200;

// ── 1. renderAgentWidget — Pure Render Throughput ───────────────────────────

describe("Benchmark: renderAgentWidget — pure render throughput", () => {
  let renderAgentWidget: typeof import("../src/ui/agent-widget-renderer.js").renderAgentWidget;

  beforeEach(async () => {
    agentIdCounter = 0;
    const mod = await import("../src/ui/agent-widget-renderer.js");
    renderAgentWidget = mod.renderAgentWidget;
  });

  it(`renders ${SMALL} agents (mixed) under 0.6ms`, () => {
    const agents = buildAgentList(SMALL, { running: 40, queued: 20, finished: 40 });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      renderAgentWidget({
        agents,
        agentActivity: new Map(),
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 100;

    benchmarkLog(`renderAgentWidget ${SMALL} mixed`, perRender, 0.6);
    expect(perRender).toBeLessThan(0.6);
  });

  it(`renders ${MEDIUM} agents (mixed) under 3ms`, () => {
    const agents = buildAgentList(MEDIUM, { running: 40, queued: 20, finished: 40 });

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      renderAgentWidget({
        agents,
        agentActivity: new Map(),
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 50;

    benchmarkLog(`renderAgentWidget ${MEDIUM} mixed`, perRender, 3);
    expect(perRender).toBeLessThan(3);
  });

  it(`renders ${LARGE} agents (mixed) under 15ms (safety-capped)`, () => {
    const agents = buildAgentList(LARGE, { running: 40, queued: 20, finished: 40 });

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      renderAgentWidget({
        agents,
        agentActivity: new Map(),
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 20;

    benchmarkLog(`renderAgentWidget ${LARGE} mixed`, perRender, 15);
    expect(perRender).toBeLessThan(15);
  });

  it("renders all-running agents (worst case: 2 lines each)", () => {
    const agents = buildAgentList(MEDIUM, { running: 100, queued: 0, finished: 0 });

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      renderAgentWidget({
        agents,
        agentActivity: new Map(),
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 50;

    benchmarkLog(`renderAgentWidget ${MEDIUM} all-running`, perRender, 5);
    expect(perRender).toBeLessThan(5);
  });
});

// ── 2. renderAgentWidget — With Activity Data ───────────────────────────────

describe("Benchmark: renderAgentWidget — with activity heatmap data", () => {
  let renderAgentWidget: typeof import("../src/ui/agent-widget-renderer.js").renderAgentWidget;

  beforeEach(async () => {
    agentIdCounter = 0;
    const mod = await import("../src/ui/agent-widget-renderer.js");
    renderAgentWidget = mod.renderAgentWidget;
  });

  it(`renders ${MEDIUM} agents with ${MEDIUM} activity entries under 5ms`, () => {
    const agents = buildAgentList(MEDIUM, { running: 60, queued: 20, finished: 20 });
    const activity = new Map<string, AgentActivity>();

    for (const a of agents) {
      activity.set(a.id, {
        activeTools: new Map([["read", "read"]]),
        toolUses: 5,
        responseText: "searching for relevant files\u2026",
        turnCount: 3,
        maxTurns: 10,
        lifetimeUsage: { input: 12000, output: 3000, cacheWrite: 0 },
        lastSeenMs: Date.now() - Math.random() * 5000,
      });
    }

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      renderAgentWidget({
        agents,
        agentActivity: activity,
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 50;

    benchmarkLog(`renderAgentWidget ${MEDIUM} w/ activity`, perRender, 5);
    expect(perRender).toBeLessThan(5);
  });

  it("renders with 200 agents + 200 activity entries under 20ms per render", () => {
    const agents = buildAgentList(LARGE, { running: 50, queued: 25, finished: 25 });
    const activity = new Map<string, AgentActivity>();

    for (const a of agents) {
      activity.set(a.id, {
        activeTools: new Map([["write", "write"], ["read", "read"]]),
        toolUses: 8,
        responseText: "processing benchmark data with multiple tools active simultaneously",
        turnCount: 5,
        maxTurns: 15,
        lifetimeUsage: { input: 25000, output: 8000, cacheWrite: 0 },
        lastSeenMs: Date.now() - 1000,
      });
    }

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      renderAgentWidget({
        agents,
        agentActivity: activity,
        frame: i,
        shouldShowFinished: alwaysShowFinished,
        theme: testTheme as any,
        tui: testTui as any,
      });
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 20;

    benchmarkLog(`renderAgentWidget ${LARGE} w/ activity`, perRender, 20);
    expect(perRender).toBeLessThan(20);
  });
});

// ── 3. AgentWidget.buildSnapshot — Dirty Checking Hash ──────────────────────

describe("Benchmark: AgentWidget.buildSnapshot (dirty checking)", () => {
  let AgentWidget: typeof import("../src/ui/agent-widget.js").AgentWidget;

  beforeEach(async () => {
    agentIdCounter = 0;
    const mod = await import("../src/ui/agent-widget.js");
    AgentWidget = mod.AgentWidget;
  });

  it(`buildSnapshot with ${SMALL} agents under 50\u00b5s`, () => {
    const agents = buildAgentList(SMALL, { running: 50, queued: 25, finished: 25 });
    const widget = new (AgentWidget as any)({}, new Map());

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      widget.buildSnapshot(agents);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog(`buildSnapshot ${SMALL} agents`, perCall, 0.05, "\u00b5s");
    expect(perCall).toBeLessThan(0.05);
  });

  it(`buildSnapshot with ${MEDIUM} agents under 50\u00b5s`, () => {
    const agents = buildAgentList(MEDIUM, { running: 40, queued: 20, finished: 40 });
    const widget = new (AgentWidget as any)({}, new Map());

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      widget.buildSnapshot(agents);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog(`buildSnapshot ${MEDIUM} agents`, perCall, 0.05, "\u00b5s");
    expect(perCall).toBeLessThan(0.05);
  });

  it(`buildSnapshot with ${LARGE} agents under 200\u00b5s`, () => {
    const agents = buildAgentList(LARGE, { running: 33, queued: 33, finished: 34 });
    const widget = new (AgentWidget as any)({}, new Map());

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      widget.buildSnapshot(agents);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog(`buildSnapshot ${LARGE} agents`, perCall, 0.2, "\u00b5s");
    expect(perCall).toBeLessThan(0.2);
  });
});

// ── 4. AgentWidget.getVisibleWindow — Virtual Scrolling Pre-Filter ───────────

describe("Benchmark: AgentWidget.getVisibleWindow (virtual scrolling)", () => {
  let AgentWidget: typeof import("../src/ui/agent-widget.js").AgentWidget;

  beforeEach(async () => {
    agentIdCounter = 0;
    const mod = await import("../src/ui/agent-widget.js");
    AgentWidget = mod.AgentWidget;
  });

  it(`getVisibleWindow with ${LARGE} agents under 500\u00b5s`, () => {
    const agents = buildAgentList(LARGE, { running: 40, queued: 20, finished: 40 });
    const widget = new (AgentWidget as any)({}, new Map());

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      widget.getVisibleWindow(agents);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog(`getVisibleWindow ${LARGE} agents`, perCall, 0.5, "\u00b5s");
    expect(perCall).toBeLessThan(0.5);
  });

  it("getVisibleWindow with 1000 agents under 1ms (extreme case)", () => {
    const agents = buildAgentList(1000, { running: 30, queued: 10, finished: 60 });
    const widget = new (AgentWidget as any)({}, new Map());

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      widget.getVisibleWindow(agents);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 200;

    benchmarkLog(`getVisibleWindow 1000 agents`, perCall, 1, "\u00b5s");
    expect(perCall).toBeLessThan(1);
  });

  it("getVisibleWindow scrollDown is fast when there are many agents", () => {
    const manager = { agents: buildAgentList(200, { running: 40, queued: 20, finished: 40 }), listAgents() { return this.agents; } };
    const widget = new (AgentWidget as any)(manager, new Map());

    // Trigger pagination calculation so scrollPage and maxPages are set
    widget.getVisibleWindow(manager.agents);
    const pages = widget.getMaxPages();

    const start = performance.now();
    for (let page = 0; page < pages; page++) {
      widget.scrollDown();
    }
    const elapsed = performance.now() - start;
    const perScroll = pages > 0 ? elapsed / pages : 0;

    benchmarkLog(`getVisibleWindow page scroll`, perScroll, 1, "\u00b5s");
    expect(perScroll).toBeLessThan(1);
  });
});

// ── 5. Full Widget Update Cycle — Debounced Update Coalescing ───────────────

describe("Benchmark: debouncedUpdate coalescing", () => {
  let AgentWidget: typeof import("../src/ui/agent-widget.js").AgentWidget;

  class MockManager {
    agents: AgentRecord[] = [];
    listAgents() { return this.agents; }
  }

  beforeEach(async () => {
    agentIdCounter = 0;
    vi.useFakeTimers();
    const mod = await import("../src/ui/agent-widget.js");
    AgentWidget = mod.AgentWidget;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("100 rapid debouncedUpdate calls coalesce to 1 immediate + 1 timer update", () => {
    const manager = new MockManager();
    const widget = new (AgentWidget as any)(manager, new Map());
    const uiCtx = {
      setWidget: vi.fn(),
      setStatus: vi.fn(),
    };
    widget.setUICtx(uiCtx);

    // Simulate 100 spawns in rapid succession
    for (let i = 0; i < 100; i++) {
      manager.agents.push(makeAgent({ status: "queued" }));
      widget.debouncedUpdate();
    }

    // First call registered widget immediately
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);

    // Advance past the 16ms coalesce window
    vi.advanceTimersByTime(20);

    // Timer fired — second update (widget already registered, uses requestRender)
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);
    // Status was updated with agent count
    expect(uiCtx.setStatus).toHaveBeenCalledWith("subagents", "100 queued agents");
  });
});

// ── 6. Full update loop — sustained performance ─────────────────────────────

describe("Benchmark: sustained update throughput", () => {
  let AgentWidget: typeof import("../src/ui/agent-widget.js").AgentWidget;

  class MockManager {
    agents: AgentRecord[] = [];
    listAgents() { return this.agents; }
  }

  beforeEach(async () => {
    agentIdCounter = 0;
    const mod = await import("../src/ui/agent-widget.js");
    AgentWidget = mod.AgentWidget;
  });

  it("widget update with 20 agents per tick (50 ticks total)", () => {
    const manager = new MockManager();
    const widget = new (AgentWidget as any)(manager, new Map());
    const uiCtx = {
      setWidget: vi.fn(),
      setStatus: vi.fn(),
    };
    widget.setUICtx(uiCtx);

    // Simulate 50 ticks with 20 agents each using real performance.now()
    const start = performance.now();
    for (let tick = 0; tick < 50; tick++) {
      for (let i = 0; i < 20; i++) {
        const status = Math.random() < 0.6 ? "running" : "queued";
        manager.agents.push(makeAgent({ status }));
      }
      widget.update();
    }
    const elapsed = performance.now() - start;
    const perTick = elapsed / 50;

    benchmarkLog(`widget update 50 ticks`, perTick, 2);
    expect(perTick).toBeLessThan(2);
  });
});
