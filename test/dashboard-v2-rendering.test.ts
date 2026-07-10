import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { renderTopTable, sortEntries, type AgentTopEntry } from "../src/ui/agent-top-renderer.js";
import { renderDashboardHeader } from "../src/ui/dashboard/header.js";
import type { DashboardRenderState } from "../src/ui/dashboard/types.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";
import { visibleWidth } from "../src/ui/tui-shim.js";

const plainTheme: DashboardTheme = {
  border: "",
  title: "",
  dim: "",
  muted: "",
  highlight: "",
  accent: "",
  success: "",
  error: "",
  reset: "",
  bgCard: "",
  bgSelected: "",
  bgHeader: "",
};

const box: BoxChars = {
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  l: "│",
  r: "│",
  h: "─",
  ml: "├",
  mr: "┤",
};

function agent(status: AgentRecord["status"]): AgentRecord {
  return {
    id: `agent-${status}`,
    type: "Explore",
    description: "Inspect the repository",
    status,
    toolUses: 2,
    spawnedAt: 1,
    lifetimeUsage: { input: 10, output: 5, cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
  };
}

const topEntries: AgentTopEntry[] = [
  {
    id: "a",
    name: "Explore",
    status: "running",
    tokens: 4_000,
    turns: 8,
    toolUses: 5,
    durationMs: 12_000,
    lastSeenMs: Date.now(),
  },
  {
    id: "b",
    name: "Plan",
    status: "queued",
    tokens: 800,
    turns: 2,
    toolUses: 1,
    durationMs: 3_000,
    lastSeenMs: undefined,
  },
];

describe("v2 dashboard header", () => {
  it("renders live state without exceeding a narrow terminal", () => {
    const state: DashboardRenderState = {
      agents: [agent("running"), agent("queued"), agent("completed")],
      selectedIndex: 0,
      selectedIds: new Set(["agent-running"]),
      frame: 2,
      agentActivity: new Map(),
    };

    const lines = renderDashboardHeader(60, plainTheme, box, state);

    expect(lines).toHaveLength(5);
    expect(lines.join("\n")).toContain("LIVE");
    expect(lines.join("\n")).toContain("PI ORCHESTRATOR");
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
  });

  it("renders idle state for an empty fleet", () => {
    const state: DashboardRenderState = {
      agents: [],
      selectedIndex: 0,
      selectedIds: new Set(),
      frame: 0,
      agentActivity: new Map(),
    };

    expect(renderDashboardHeader(80, plainTheme, box, state).join("\n")).toContain("IDLE");
  });
});

describe("v2 agent top view", () => {
  it("drops secondary columns on narrow terminals", () => {
    const lines = renderTopTable(topEntries, "tokens", false, 0, 10, plainTheme, 60);
    const header = lines[2];

    expect(header).toContain("AGENT");
    expect(header).toContain("STATE");
    expect(header).toContain("TOKENS");
    expect(header).toContain("RUNTIME");
    expect(header).not.toContain("TOOLS");
    expect(header).not.toContain("LOAD");
    for (const line of lines.slice(2)) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
  });

  it("shows full telemetry on wide terminals", () => {
    const lines = renderTopTable(topEntries, "tokens", false, 0, 10, plainTheme, 120);
    const header = lines[2];

    expect(header).toContain("TURNS");
    expect(header).toContain("TOOLS");
    expect(header).toContain("SEEN");
    expect(header).toContain("LOAD");
  });

  it("preserves deterministic numeric sorting", () => {
    expect(sortEntries(topEntries, "tokens", false).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(sortEntries(topEntries, "tokens", true).map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});
