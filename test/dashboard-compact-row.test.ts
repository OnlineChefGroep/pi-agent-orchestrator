import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock all dependencies
vi.mock("../src/ui/agent-format.js", () => ({
  getDisplayName: vi.fn((type: string) => (type === "Explore" ? "🔍 Explore" : `${type}`)),
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

vi.mock("../src/ui/theme.js", () => ({
  fastTruncate: vi.fn((s: string, w: number) => {
    const visible = s.replace(/\u001b\[\d+(;\d+)*m/g, "");
    if (visible.length > w) return `${visible.slice(0, w - 1)}…`;
    return s;
  }),
}));

const { renderCompactRow } = await import("../src/ui/dashboard/compact-row.js");

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
  bgCard: "",
  bgHeader: "",
  bgSelected: "",
} as const;

const baseState = (overrides: Partial<Parameters<typeof makeState>[0]> = {}) => makeState(overrides);

function makeState(overrides: { agents?: AgentRecord[]; selectedIndex?: number; selectedIds?: Set<string>; frame?: number; agentActivity?: Map<string, unknown> }) {
  const agents = overrides.agents ?? [makeRecord()];
  return {
    agents,
    selectedIndex: overrides.selectedIndex ?? 0,
    selectedIds: overrides.selectedIds ?? new Set<string>(),
    frame: overrides.frame ?? 0,
    agentActivity: overrides.agentActivity ?? new Map(),
  };
}

describe("renderCompactRow", () => {
  it("renders a running agent with activity icon", () => {
    const rec = makeRecord({ status: "running", description: "Scanning files" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("●");
    expect(result).toContain("🔍 Explore");
    expect(result).toContain("Scanning files");
  });

  it("renders a completed agent with success icon", () => {
    const rec = makeRecord({ status: "completed", description: "Done" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("✓");
  });

  it("renders an error agent with error icon", () => {
    const rec = makeRecord({ status: "error", description: "Failed" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("✗");
  });

  it("renders a queued agent with queued icon", () => {
    const rec = makeRecord({ status: "queued", description: "Pending" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("◔");
  });

  it("shows pointer for selected agent", () => {
    const rec = makeRecord();
    const state = baseState({ agents: [rec], selectedIndex: 0 });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("▶");
  });

  it("shows no pointer for non-selected agent", () => {
    const rec = makeRecord();
    const rec2 = makeRecord({ id: "agent-2" });
    const state = baseState({ agents: [rec, rec2], selectedIndex: 0 });
    const result = renderCompactRow(rec2, 80, th, state);
    expect(result).not.toContain("\u001b[33m▶");
  });

  it("shows checkmark for selected-in-batch agent", () => {
    const rec = makeRecord();
    const state = baseState({ agents: [rec], selectedIndex: 0, selectedIds: new Set(["agent-1"]) });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("✓");
  });

  it("shows thinking level when invocation has thinking", () => {
    const rec = makeRecord({ invocation: { thinking: "high" } as AgentRecord["invocation"] });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("🧠");
    expect(result).toContain("high");
  });

  it("shows no thinking indicator when invocation has no thinking", () => {
    const rec = makeRecord({ invocation: { thinking: undefined } as AgentRecord["invocation"] });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).not.toContain("🧠");
  });

  it("shows activity text when no description", () => {
    const rec = makeRecord({ description: "" });
    const state = baseState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { message: "Reading files", turnCount: 1, tokenCount: 250 }]]),
    });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("Reading files");
  });

  it("shows agent stats with turn count", () => {
    const rec = makeRecord();
    const state = baseState({
      agents: [rec],
      agentActivity: new Map([["agent-1", { turnCount: 3, tokenCount: 500 }]]),
    });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("t3");
    expect(result).toContain("500 tok");
  });

  it("truncates long output to inner width", () => {
    const rec = makeRecord({ description: "A very long description that should be truncated because it exceeds the available width" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 40, th, state);
    // Visible chars (without ANSI) should be <= 40 or end with "…"
    const visible = result.replace(/\u001b\[\d+(;\d+)*m/g, "");
    expect(visible.length <= 40 || visible.includes("…")).toBe(true);
  });

  it("handles agent without running status correctly", () => {
    const rec = makeRecord({ status: "aborted", description: "Cancelled by user" });
    const state = baseState({ agents: [rec] });
    const result = renderCompactRow(rec, 80, th, state);
    expect(result).toContain("·");
    expect(result).toContain("Cancelled by user");
  });
});
