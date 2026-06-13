import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock external dependencies
vi.mock("@earendil-works/pi-tui", () => ({
  visibleWidth: vi.fn((s: string) => {
    // Strip ANSI codes for width calculation
    return s.replace(/\u001b\[\d+(;\d+)*m/g, "").length;
  }),
}));

vi.mock("../src/agent-registry.js", () => ({
  getUiStyle: vi.fn(() => "premium"),
}));

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

const { renderDashboardHeader } = await import("../src/ui/dashboard/header.js");

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
};

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

describe("renderDashboardHeader", () => {
  it("returns an array of header lines", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it("includes the dashboard title", () => {
    const state = makeState([makeRecord("a1", { status: "running" })]);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("AGENT DASHBOARD"))).toBe(true);
  });

  it("includes the UI style mode", () => {
    const state = makeState([makeRecord("a1", { status: "running" })]);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("premium mode"))).toBe(true);
  });

  it("shows running count in summary bar", () => {
    const agents = [makeRecord("a1", { status: "running" }), makeRecord("a2", { status: "running" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("2 running"))).toBe(true);
  });

  it("shows queued count in summary bar", () => {
    const agents = [makeRecord("a1", { status: "queued" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("1 queued"))).toBe(true);
  });

  it("shows completed count in summary bar", () => {
    const agents = [makeRecord("a1", { status: "completed" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("1 done"))).toBe(true);
  });

  it("shows steered agents as done", () => {
    const agents = [makeRecord("a1", { status: "steered" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("1 done"))).toBe(true);
  });

  it("shows error count when errors exist", () => {
    const agents = [makeRecord("a1", { status: "error" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("1 error"))).toBe(true);
  });

  it("hides error count when no errors", () => {
    const agents = [makeRecord("a1", { status: "completed" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("error"))).toBe(false);
  });

  it("shows selected count when agents are selected", () => {
    const agents = [makeRecord("a1", { status: "running" }), makeRecord("a2", { status: "running" })];
    const state = makeState(agents, { selectedIds: new Set(["a1"]) });
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("1 selected"))).toBe(true);
  });

  it("hides selected count when nothing is selected", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents, { selectedIds: new Set() });
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("selected"))).toBe(false);
  });

  it("shows session usage meters when manager is provided", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const mockManager = {
      getSessionUsage: () => ({ spawnedAgents: 5, totalTurns: 12 }),
      getSessionMaxSpawns: () => 10,
      getSessionMaxTurns: () => 25,
    };
    const result = renderDashboardHeader(80, th, box, state, mockManager as Parameters<typeof renderDashboardHeader>[4]);
    expect(result.some((l) => l.includes("5/10")) || result.some((l) => l.includes("agents"))).toBe(true);
    expect(result.some((l) => l.includes("12/25")) || result.some((l) => l.includes("turns"))).toBe(true);
  });

  it("does not show session meters when manager absent", () => {
    const agents = [makeRecord("a1", { status: "running" })];
    const state = makeState(agents);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result.some((l) => l.includes("agents") && l.includes("turns"))).toBe(false);
  });

  it("renders top border as first line", () => {
    const state = makeState([makeRecord("a1", { status: "running" })]);
    const result = renderDashboardHeader(80, th, box, state);
    expect(result[0]).toContain("┌");
  });

  it("renders mid border before divider", () => {
    const state = makeState([makeRecord("a1", { status: "running" })]);
    const result = renderDashboardHeader(80, th, box, state);
    const midLine = result[result.length - 1];
    expect(midLine).toContain("├");
  });
});
