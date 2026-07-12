/**
 * dashboard-render-perf.test.ts — Performance benchmarks for AgentDashboard.render().
 *
 * Measures the full dashboard render pipeline: header, body (running/queued/done
 * sections with virtual scrolling), detail panel, and footer.
 *
 * Covers:
 * - Normal view with various agent counts (10, 50, 200, 1000)
 * - All-running worst case (each agent = 2-line running card)
 * - With activity data (heatmap + detail panel enrichment)
 * - Help screen overlay
 * - Perf panel overlay
 *
 * Uses generous bounds to avoid CI flakiness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRecord } from "../src/types.js";
import type { AgentActivity } from "../src/ui/agent-ui-types.js";
import { benchmarkLog } from "./helpers/benchmark-log.js";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../src/ui/tui-shim.js", () => ({
    truncateToWidth: (str: string) => str,
  visibleWidth: (str: string) => str.length,
  matchesKey: (data: string, key: string) => {
    const keyMap: Record<string, string[]> = {
      escape: ["escape"],
      enter: ["enter", "return"],
      up: ["up", "k"],
      down: ["down", "j"],
      "?": ["?"],
    };
    return (keyMap[key] ?? [key]).includes(data);
  },
    wrapTextWithAnsi: (text) => text.split(/\n/),
    Text: class { constructor(c) { this.content = c; } render() { return [this.content]; } },
      getAnsiSequenceLength: (_str: string, _i: number) => 0 }));

vi.mock("../src/agent-registry.js", () => ({
  getUiStyle: () => "premium",
  getDashboardRefreshInterval: () => 750,
  // v2 dashboard header + widget render path also read these (real defaults).
  getAnimationStyle: () => "orchestrator",
  isShowActivityStream: () => true,
  isShowTokenUsage: () => true,
  isShowTurnProgress: () => true,
}));

vi.mock("../src/agent-types.js", () => ({
  getConfig: (type: string) => ({
    name: type,
    displayName:
      type === "Explore"
        ? "Explore"
        : type === "Plan"
          ? "Plan"
          : type === "general-purpose"
            ? "General"
            : type,
    promptMode: undefined,
    maxMemoryLines: 20,
  }),
}));

vi.mock("../src/usage.js", () => ({
  getLifetimeTotal: (usage?: { input: number }) => usage?.input ?? 0,
  getSessionContextPercent: () => null,
}));

// ── Agent helpers ───────────────────────────────────────────────────────────

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
    lifetimeUsage: {
      input: Math.floor(Math.random() * 50000),
      output: Math.floor(Math.random() * 10000),
      cacheWrite: 0,
    },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 1,
    completedAt: overrides.completedAt,
    ...overrides,
  } as AgentRecord;
}

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
      type:
        i % 3 === 0
          ? "Explore"
          : i % 3 === 1
            ? "Plan"
            : "general-purpose",
      completedAt: status === "completed" ? Date.now() : undefined,
    });
    agents.push(a);
  }
  return agents;
}

// ── Mock TUI ───────────────────────────────────────────────────────────────

function createMockTui(rows = 40, columns = 120) {
  return {
    terminal: { rows, columns },
    requestRender: vi.fn(),
  } as any;
}

// ── Mock AgentManager ──────────────────────────────────────────────────────

class MockManager {
  agents: AgentRecord[] = [];
  listAgents() {
    return this.agents;
  }
  getSessionUsage() {
    return { spawnedAgents: 5, totalTurns: 42 };
  }
  getSessionMaxSpawns() {
    return 10;
  }
  getSessionMaxTurns() {
    return 100;
  }
}

// ── Mock AgentActivity ─────────────────────────────────────────────────────

function buildActivityData(
  agents: AgentRecord[],
): Map<string, AgentActivity> {
  const activity = new Map<string, AgentActivity>();
  for (const a of agents) {
    if (a.status === "running" || a.status === "queued") {
      activity.set(a.id, {
        activeTools: new Map([["read", "read"]]),
        toolUses: 5,
        responseText: "searching for relevant files\u2026",
        turnCount: 3,
        maxTurns: 10,
        lifetimeUsage: { input: 12000, output: 3000, cacheWrite: 0 },
        lastSeenMs: Date.now() - Math.random() * 5000,
      });
    } else if (a.status === "completed") {
      activity.set(a.id, {
        activeTools: new Map(),
        toolUses: 12,
        responseText: "completed successfully",
        turnCount: 8,
        maxTurns: 10,
        lifetimeUsage: { input: 45000, output: 12000, cacheWrite: 0 },
        lastSeenMs: Date.now() - 120000,
      });
    }
  }
  return activity;
}

// ── Test data sizes ────────────────────────────────────────────────────────

const SMALL = 10;
const MEDIUM = 50;
const LARGE = 200;
const EXTREME = 1000;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Benchmark: AgentDashboard.render() — normal view", () => {
  let AgentDashboardClass: typeof import("../src/ui/agent-dashboard.js").AgentDashboard;

  beforeEach(async () => {
    agentIdCounter = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const mod = await import("../src/ui/agent-dashboard.js");
    AgentDashboardClass = mod.AgentDashboard;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDash(
    agents: AgentRecord[],
    activity: Map<string, AgentActivity>,
    tui: any,
  ) {
    const manager = new MockManager();
    manager.agents = agents;
    const done = () => {};
    const dash = new AgentDashboardClass(
      tui,
      { manager, agentActivity: activity },
      done,
    );
    return dash;
  }

  it("empty dashboard under 0.5ms", () => {
    const tui = createMockTui();
    const dash = createDash([], new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 1000;

    benchmarkLog("dashboard empty", perRender, 0.5);
    expect(perRender).toBeLessThan(0.5);
  });

  it(`renders ${SMALL} agents (mixed) under 1.5ms`, () => {
    const agents = buildAgentList(SMALL, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 500;

    benchmarkLog(`dashboard ${SMALL} mixed`, perRender, 1.5);
    expect(perRender).toBeLessThan(1.5);
  });

  it(`renders ${MEDIUM} agents (mixed) under 5ms`, () => {
    const agents = buildAgentList(MEDIUM, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 100;

    benchmarkLog(`dashboard ${MEDIUM} mixed`, perRender, 5);
    expect(perRender).toBeLessThan(5);
  });

  it(`renders ${LARGE} agents (mixed) under 20ms`, () => {
    const agents = buildAgentList(LARGE, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 20;

    benchmarkLog(`dashboard ${LARGE} mixed`, perRender, 20);
    expect(perRender).toBeLessThan(20);
  });

  it(`renders ${EXTREME} agents (mixed) under 40ms (virtual scroll path)`, () => {
    const agents = buildAgentList(EXTREME, {
      running: 20,
      queued: 10,
      finished: 70,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 10;

    benchmarkLog(`dashboard ${EXTREME} mixed`, perRender, 40);
    expect(perRender).toBeLessThan(40);
  });

  it("renders all-running agents (worst case: 2-line running cards each)", () => {
    const agents = buildAgentList(MEDIUM, {
      running: 100,
      queued: 0,
      finished: 0,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    const start = performance.now();
    for (let i = 0; i < 30; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 30;

    benchmarkLog(`dashboard ${MEDIUM} all-running`, perRender, 8);
    expect(perRender).toBeLessThan(8);
  });
});

// ── With activity data ─────────────────────────────────────────────────

describe("Benchmark: AgentDashboard.render() — with activity data", () => {
  let AgentDashboardClass: typeof import("../src/ui/agent-dashboard.js").AgentDashboard;

  beforeEach(async () => {
    agentIdCounter = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const mod = await import("../src/ui/agent-dashboard.js");
    AgentDashboardClass = mod.AgentDashboard;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDash(
    agents: AgentRecord[],
    activity: Map<string, AgentActivity>,
    tui: any,
  ) {
    const manager = new MockManager();
    manager.agents = agents;
    const done = () => {};
    return new AgentDashboardClass(
      tui,
      { manager, agentActivity: activity },
      done,
    );
  }

  it(`renders ${MEDIUM} agents with ${MEDIUM} activity entries under 5ms`, () => {
    const agents = buildAgentList(MEDIUM, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const activity = buildActivityData(agents);
    const tui = createMockTui();
    const dash = createDash(agents, activity, tui);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 100;

    benchmarkLog(`dashboard ${MEDIUM} w/ activity`, perRender, 5);
    expect(perRender).toBeLessThan(5);
  });

  it(`renders ${LARGE} agents with ${LARGE} activity entries under 20ms`, () => {
    const agents = buildAgentList(LARGE, {
      running: 30,
      queued: 20,
      finished: 50,
    });
    const activity = buildActivityData(agents);
    const tui = createMockTui();
    const dash = createDash(agents, activity, tui);

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 20;

    benchmarkLog(`dashboard ${LARGE} w/ activity`, perRender, 20);
    expect(perRender).toBeLessThan(20);
  });
});

// ── Help screen ────────────────────────────────────────────────────────

describe("Benchmark: AgentDashboard.render() — help screen", () => {
  let AgentDashboardClass: typeof import("../src/ui/agent-dashboard.js").AgentDashboard;

  beforeEach(async () => {
    agentIdCounter = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const mod = await import("../src/ui/agent-dashboard.js");
    AgentDashboardClass = mod.AgentDashboard;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDash(
    agents: AgentRecord[],
    activity: Map<string, AgentActivity>,
    tui: any,
  ) {
    const manager = new MockManager();
    manager.agents = agents;
    const done = () => {};
    return new AgentDashboardClass(
      tui,
      { manager, agentActivity: activity },
      done,
    );
  }

  it(`help screen with ${MEDIUM} agents under 3ms`, () => {
    const agents = buildAgentList(MEDIUM, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    // Trigger help screen by simulating "?" input
    dash.handleInput("?");

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 200;

    benchmarkLog(`dashboard help ${MEDIUM}`, perRender, 3);
    expect(perRender).toBeLessThan(3);
  });
});

// ── Perf panel ────────────────────────────────────────────────────────

describe("Benchmark: AgentDashboard.render() — perf panel", () => {
  let AgentDashboardClass: typeof import("../src/ui/agent-dashboard.js").AgentDashboard;

  beforeEach(async () => {
    agentIdCounter = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "Date"] });
    const mod = await import("../src/ui/agent-dashboard.js");
    AgentDashboardClass = mod.AgentDashboard;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createDash(
    agents: AgentRecord[],
    activity: Map<string, AgentActivity>,
    tui: any,
  ) {
    const manager = new MockManager();
    manager.agents = agents;
    const done = () => {};
    return new AgentDashboardClass(
      tui,
      { manager, agentActivity: activity },
      done,
    );
  }

  it(`perf panel with ${MEDIUM} agents under 3ms`, () => {
    const agents = buildAgentList(MEDIUM, {
      running: 40,
      queued: 20,
      finished: 40,
    });
    const tui = createMockTui();
    const dash = createDash(agents, new Map(), tui);

    // Trigger perf panel via command
    dash.handleInput("/");
    for (const ch of "perf") {
      dash.handleInput(ch);
    }
    dash.handleInput("enter");

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      dash.render(120);
    }
    const elapsed = performance.now() - start;
    const perRender = elapsed / 200;

    benchmarkLog(`dashboard perf ${MEDIUM}`, perRender, 3);
    expect(perRender).toBeLessThan(3);
  });
});
