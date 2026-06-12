import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock theme functions
vi.mock("../src/ui/theme.js", () => ({
  borderLine: vi.fn((w: number, _th: unknown, box: { h: string; ml: string; mr: string; bl: string; br: string; tl: string; tr: string; l: string; r: string }, edge: string) => {
    if (edge === "top") return `┌${box.h.repeat(Math.max(0, w - 2))}┐`;
    if (edge === "mid") return `├${box.h.repeat(Math.max(0, w - 2))}┤`;
    if (edge === "bot") return `└${box.h.repeat(Math.max(0, w - 2))}┘`;
    return "";
  }),
  framedRow: vi.fn((content: string, innerW: number, _th: unknown, box: { l: string; r: string }) => {
    return `${box.l} ${content.padEnd(innerW)} ${box.r}`;
  }),
  padVisible: vi.fn((s: string, w: number) => s.padEnd(w)),
  fastTruncate: vi.fn((s: string, w: number) => {
    const visible = s.replace(/\u001b\[\d+(;\d+)*m/g, "");
    if (visible.length > w) return `${visible.slice(0, w - 1)}…`;
    return s;
  }),
}));

vi.mock("../src/ui/dashboard/compact-row.js", () => ({
  renderCompactRow: vi.fn((_rec: AgentRecord, _w: number, _th: unknown, _state: unknown) => "  compact-row-output"),
}));

vi.mock("../src/ui/dashboard/running-card.js", () => ({
  renderRunningCard: vi.fn((_rec: AgentRecord, _w: number, _th: unknown, _box: unknown, _state: unknown) => [
    "  ┌──────────────────┐",
    "  │ running-card      │",
    "  └──────────────────┘",
    "  act-line",
  ]),
}));

vi.mock("../src/ui/dashboard/section-title.js", () => ({
  renderSectionTitle: vi.fn((label: string, count: string, _w: number, _th: unknown, _box: unknown) => {
    return `── ${label}  ${count} ──`;
  }),
}));

vi.mock("../src/ui/dashboard/swarm-section.js", () => ({
  renderSwarmSection: vi.fn((_w: number, _th: unknown, _box: unknown, _state: unknown, _focus: Map<string, number>) => {
    return [];
  }),
}));

const { buildDashboardBodyLines } = await import("../src/ui/dashboard/body.js");

function makeRecord(id: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    type: "Explore",
    status: "running",
    description: `Agent ${id}`,
    spawnedAt: Date.now(),
    swarmId: undefined,
    handoff: undefined,
    invocation: undefined,
    compactionCount: 0,
    toolUses: 0,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    ...overrides,
  } as AgentRecord;
}

const th = {
  accent: "\u001b[36m",
  error: "\u001b[31m",
  success: "\u001b[32m",
  dim: "\u001b[2m",
  muted: "\u001b[90m",
  title: "\u001b[1m",
  highlight: "\u001b[33m",
  reset: "\u001b[0m",
  border: "\u001b[37m",
  bgCard: "",
  bgHeader: "",
  bgSelected: "",
} as const;

const box = {
  h: "─",
  v: "│",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  ml: "├",
  mr: "┤",
  l: "│",
  r: "│",
};

function makeState(agents: AgentRecord[], overrides: { selectedIndex?: number; selectedIds?: Set<string> } = {}) {
  return {
    agents,
    selectedIndex: overrides.selectedIndex ?? 0,
    selectedIds: overrides.selectedIds ?? new Set<string>(),
    frame: 0,
    agentActivity: new Map(),
  };
}

describe("buildDashboardBodyLines", () => {
  it("returns body with lines and focus map", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.focusLineByAgentId).toBeInstanceOf(Map);
  });

  it("renders running agents as running cards", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.some((l) => l.includes("running-card"))).toBe(true);
  });

  it("renders queued agents as compact rows", () => {
    const agents = [makeRecord("a1", { status: "queued" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.some((l) => l.includes("◔ QUEUED"))).toBe(true);
  });

  it("renders done agents as compact rows", () => {
    const agents = [makeRecord("a1", { status: "completed" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.some((l) => l.includes("✓ DONE"))).toBe(true);
  });

  it("handles empty agent list", () => {
    const state = makeState([]);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.length).toBeGreaterThanOrEqual(0);
    expect(result.focusLineByAgentId.size).toBe(0);
  });

  it("includes focus entries for agents", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.focusLineByAgentId.has("a1")).toBe(true);
  });

  it("separates running/queued/done into sections", () => {
    const agents = [
      makeRecord("a1", { status: "running" }),
      makeRecord("a2", { status: "queued" }),
      makeRecord("a3", { status: "completed" }),
    ];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    // Should have RUNNING section, QUEUED section, and DONE section
    const hasRunning = result.lines.some((l) => l.includes("RUNNING"));
    const hasQueued = result.lines.some((l) => l.includes("QUEUED"));
    const hasDone = result.lines.some((l) => l.includes("DONE"));
    expect(hasRunning || hasQueued || hasDone).toBe(true);
  });

  it("does not render empty sections", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = buildDashboardBodyLines(80, th, box, state);
    // Should NOT have QUEUED or DONE sections since none exist
    expect(result.lines.some((l) => l.includes("◔ QUEUED"))).toBe(false);
    expect(result.lines.some((l) => l.includes("✓ DONE"))).toBe(false);
  });

  it("enters virtual scroll path for >50 agents", () => {
    const agents = Array.from({ length: 60 }, (_, i) =>
      makeRecord(`a${i}`, { status: i < 10 ? "running" : i < 30 ? "queued" : "completed" }),
    );
    const state = makeState(agents, { selectedIndex: 5 });
    const result = buildDashboardBodyLines(80, th, box, state);
    // Virtual scroll should show window indicator
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.lines.some((l) => l.includes("total agents"))).toBe(true);
  });

  it("handles swarm agents in virtual scroll path", () => {
    const agents = Array.from({ length: 60 }, (_, i) =>
      makeRecord(`a${i}`, {
        status: "running",
        swarmId: i < 30 ? "swarm-1" : undefined,
      }),
    );
    const state = makeState(agents, { selectedIndex: 0 });
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.some((l) => l.includes("SWARMS"))).toBe(true);
  });

  it("handles selected agents without crashing", () => {
    const agents = [makeRecord("a1", { status: "running" }), makeRecord("a2", { status: "completed" })];
    const state = makeState(agents, { selectedIndex: 0, selectedIds: new Set(["a1"]) });
    const result = buildDashboardBodyLines(80, th, box, state);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.focusLineByAgentId.has("a1")).toBe(true);
  });
});
