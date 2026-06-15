import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock external dependencies
vi.mock("@earendil-works/pi-tui", () => ({
  visibleWidth: vi.fn((s: string) => s.replace(/\u001b\[\d+(;\d+)*m/g, "").length),
}));

vi.mock("../src/ui/agent-format.js", () => ({
  getDisplayName: vi.fn((type: string) => (type === "Explore" ? "🔍 Explore" : `${type}`)),
}));

vi.mock("../src/ui/theme.js", () => ({
  fastTruncate: vi.fn((s: string, w: number) => {
    const visible = s.replace(/\u001b\[\d+(;\d+)*m/g, "");
    if (visible.length > w) return `${visible.slice(0, w - 1)}…`;
    return s;
  }),
  padVisible: vi.fn((s: string, w: number) => s.padEnd(w)),
  padAndTruncate: vi.fn((s: string, w: number) => {
    const visible = s.replace(/\u001b\[\d+(;\d+)*m/g, "");
    if (visible.length > w) return `${visible.slice(0, w - 1)}…`;
    if (visible.length < w) return s.padEnd(w + (s.length - visible.length));
    return s;
  }),
}));

vi.mock("../src/ui/dashboard/helpers.js", () => ({
  activityText: vi.fn((_rec: AgentRecord, act?: { message?: string }) => act?.message ?? "idle"),
  agentStats: vi.fn((_rec: AgentRecord, act?: { turnCount?: number; tokenCount?: number }) => {
    const t = act?.turnCount ?? 0;
    const tokens = act?.tokenCount ? `${act.tokenCount} tok` : "";
    return `t${t} ${tokens}`.trim();
  }),
  statusColor: vi.fn((rec: AgentRecord, _th: { accent: string; error: string; success: string; dim: string }) => {
    if (rec.status === "error") return _th.error;
    if (rec.status === "completed") return _th.success;
    return _th.accent;
  }),
  statusIcon: vi.fn((rec: AgentRecord, _frame: number) => {
    if (rec.status === "running") return "●";
    if (rec.status === "completed") return "✓";
    if (rec.status === "error") return "✗";
    if (rec.status === "queued") return "◔";
    return "·";
  }),
}));

vi.mock("../src/ui/dashboard/progress.js", () => ({
  renderTurnProgress: vi.fn((turn: number, max: number, _barWidth: number, _th: unknown) => {
    const pct = Math.round((turn / max) * 100);
    return `[${"▰".repeat(Math.round(turn / max * 10))}${"▱".repeat(Math.round((max - turn) / max * 10))}] ${pct}%`;
  }),
}));

const { renderRunningCard } = await import("../src/ui/dashboard/running-card.js");

function makeRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    type: "Explore",
    status: "running",
    description: "Searching codebase...",
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
  bgCard: "\u001b[48;5;235m",
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

function makeState(overrides: {
  agents?: AgentRecord[];
  selectedIndex?: number;
  selectedIds?: Set<string>;
  frame?: number;
  agentActivity?: Map<string, unknown>;
} = {}) {
  const agents = overrides.agents ?? [makeRecord()];
  return {
    agents,
    selectedIndex: overrides.selectedIndex ?? 0,
    selectedIds: overrides.selectedIds ?? new Set<string>(),
    frame: overrides.frame ?? 0,
    agentActivity: overrides.agentActivity ?? new Map(),
  };
}

describe("renderRunningCard", () => {
  it("returns an array of lines for a running card", () => {
    const rec = makeRecord({ status: "running" });
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it("includes agent display name", () => {
    const rec = makeRecord({ type: "Explore" });
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("🔍 Explore"))).toBe(true);
  });

  it("includes description in card", () => {
    const rec = makeRecord({ description: "Reading files" });
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("Reading files"))).toBe(true);
  });

  it("shows fallback text when no description", () => {
    const rec = makeRecord({ description: "" });
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("(no description)"))).toBe(true);
  });

  it("shows fallback text when description is undefined", () => {
    const rec = makeRecord();
    delete (rec as Record<string, unknown>).description;
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("(no description)"))).toBe(true);
  });

  it("shows progress bar when running with maxTurns", () => {
    const rec = makeRecord({ status: "running" });
    const state = makeState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { turnCount: 3, maxTurns: 10, tokenCount: 300 }]]),
    });
    const result = renderRunningCard(rec, 80, th, box, state);
    const hasProgress = result.some((l) => l.includes("%"));
    expect(hasProgress).toBe(true);
  });

  it("does not show progress bar without maxTurns", () => {
    const rec = makeRecord({ status: "running" });
    const state = makeState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { turnCount: 3, tokenCount: 300 }]]),
    });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("%"))).toBe(false);
  });

  it("does not show progress bar for non-running agents", () => {
    const rec = makeRecord({ status: "completed" });
    const state = makeState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { turnCount: 3, maxTurns: 10, tokenCount: 300 }]]),
    });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("%"))).toBe(false);
  });

  it("shows focus marker for selected agent", () => {
    const rec = makeRecord();
    const state = makeState({ agents: [rec], selectedIndex: 0 });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("focus"))).toBe(true);
  });

  it("does not show focus marker for non-selected agent", () => {
    const rec = makeRecord();
    const rec2 = makeRecord({ id: "agent-2" });
    const state = makeState({ agents: [rec, rec2], selectedIndex: 0 });
    const result = renderRunningCard(rec2, 80, th, box, state);
    expect(result.some((l) => l.includes("focus"))).toBe(false);
  });

  it("shows checkmark for selected-in-batch agent", () => {
    const rec = makeRecord();
    const state = makeState({ agents: [rec], selectedIndex: 0, selectedIds: new Set(["agent-1"]) });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("✓"))).toBe(true);
  });

  it("shows activity text line", () => {
    const rec = makeRecord({ status: "running" });
    const state = makeState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { message: "Processing query", turnCount: 1, tokenCount: 50 }]]),
    });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("Processing query"))).toBe(true);
  });

  it("shows stats in card", () => {
    const rec = makeRecord();
    const state = makeState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { turnCount: 4, tokenCount: 1200 }]]),
    });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("t4") && l.includes("1200 tok"))).toBe(true);
  });

  it("renders card with box borders", () => {
    const rec = makeRecord();
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 80, th, box, state);
    expect(result.some((l) => l.includes("┌"))).toBe(true);
    expect(result.some((l) => l.includes("└"))).toBe(true);
  });

  it("handles very short width gracefully", () => {
    const rec = makeRecord({ description: "Short" });
    const state = makeState({ agents: [rec] });
    const result = renderRunningCard(rec, 30, th, box, state);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});
