/**
 * dashboard-width-coverage.test.ts — Responsive width coverage for the v2 dashboard.
 *
 * Covers AGENTS.md dashboard-animation requirements:
 * - Preserve responsive rendering at 60, 80, 100, and 140 terminal columns.
 * - Keep animation glyphs single-cell (no layout shift between renders).
 * - Assign motion deterministically (semantic roles: header/queue/handoff/swarm/tool).
 * - Use ANSI-aware helpers so colored content never overflows its width.
 *
 * Four focused concerns, each exercised across the four representative widths:
 *   1. Width safety      — no rendered line exceeds the target width.
 *   2. Responsive columns — the top view drops the right-most columns as width shrinks.
 *   3. Deterministic motion — same (agent, frame, role) always yields the same glyph.
 *   4. Frame wrapping    — long (colored) content wraps without horizontal overflow.
 * Plus golden snapshots of header / top / running-card at every width.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAnimationStyle, setUiStyle } from "../src/agent-registry.js";
import type { AgentRecord } from "../src/types.js";
import { type AgentTopEntry, renderTopTable, type SortKey } from "../src/ui/agent-top-renderer.js";
import {
  getAgentSpinnerFrame,
  getSpinnerStyleForAgent,
  SPINNER_FRAMES,
  setSpinnerStyle,
} from "../src/ui/animation.js";
import { renderDashboardHeader } from "../src/ui/dashboard/header.js";
import { renderRunningCard } from "../src/ui/dashboard/running-card.js";
import type { DashboardRenderState } from "../src/ui/dashboard/types.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";
import { visibleWidth, wrapTextWithAnsi } from "../src/ui/tui-shim.js";

const WIDTHS = [60, 80, 100, 140] as const;
const FIXED_NOW = 1_700_000_000_000;

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

function agent(status: AgentRecord["status"], description = "Inspect the repository"): AgentRecord {
  return {
    id: `agent-${status}`,
    type: "Explore",
    description,
    status,
    toolUses: 2,
    spawnedAt: 1,
    lifetimeUsage: { input: 10, output: 5, cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
  };
}

// Fixed timestamps so the relative "SEEN" column is deterministic in snapshots.
const topEntries: AgentTopEntry[] = [
  {
    id: "a",
    name: "Explore",
    status: "running",
    tokens: 4_000,
    turns: 8,
    toolUses: 5,
    durationMs: 12_000,
    lastSeenMs: FIXED_NOW - 5_000,
  },
  {
    id: "b",
    name: "Plan",
    status: "queued",
    tokens: 800,
    turns: 2,
    toolUses: 1,
    durationMs: 3_000,
    lastSeenMs: FIXED_NOW - 65_000,
  },
  {
    id: "c",
    name: "Analysis",
    status: "running",
    tokens: 12_000,
    turns: 15,
    toolUses: 9,
    durationMs: 45_000,
    lastSeenMs: FIXED_NOW - 120_000,
  },
];

function headerState(): DashboardRenderState {
  return {
    agents: [agent("running"), agent("queued"), agent("completed")],
    selectedIndex: 0,
    selectedIds: new Set(["agent-running"]),
    frame: 0,
    agentActivity: new Map(),
  };
}

function cardState(): DashboardRenderState {
  return {
    agents: [agent("running", "Investigating the authentication middleware failure across the fleet")],
    selectedIndex: 0,
    selectedIds: new Set(),
    frame: 0,
    agentActivity: new Map(),
  };
}

// Column labels present in the top-view header row, per width. Derived from
// buildColumns(): load drops <102, lastSeen <92, toolUses <78, turns <68.
const EXPECTED_LABELS: Record<(typeof WIDTHS)[number], { present: string[]; absent: string[] }> = {
  60: { present: ["AGENT", "STATE", "TOKENS", "RUNTIME"], absent: ["TURNS", "TOOLS", "SEEN", "LOAD"] },
  80: { present: ["AGENT", "STATE", "TOKENS", "TURNS", "TOOLS", "RUNTIME"], absent: ["SEEN", "LOAD"] },
  100: { present: ["AGENT", "STATE", "TOKENS", "TURNS", "TOOLS", "SEEN", "RUNTIME"], absent: ["LOAD"] },
  140: {
    present: ["AGENT", "STATE", "TOKENS", "TURNS", "TOOLS", "RUNTIME", "SEEN", "LOAD"],
    absent: [],
  },
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  // Pin the motion profile + UI style so golden snapshots are reproducible.
  setSpinnerStyle("orchestrator");
  setAnimationStyle("orchestrator");
  setUiStyle("premium");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("width safety — no line exceeds the target width", () => {
  for (const width of WIDTHS) {
    it(`header stays within ${width} cols`, () => {
      const lines = renderDashboardHeader(width, plainTheme, box, headerState());
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    });

    it(`top table stays within ${width} cols`, () => {
      const lines = renderTopTable(topEntries, "tokens" as SortKey, false, 0, 50, plainTheme, width);
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    });

    it(`running card stays within ${width} cols`, () => {
      const innerW = width - 2;
      const lines = renderRunningCard(agent("running", "x".repeat(300)), innerW, plainTheme, box, cardState());
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(innerW);
    });
  }
});

describe("responsive column selection (top view)", () => {
  for (const width of WIDTHS) {
    it(`width ${width} shows the expected columns`, () => {
      const output = renderTopTable(topEntries, "tokens" as SortKey, false, 0, 50, plainTheme, width).join("\n");
      for (const label of EXPECTED_LABELS[width].present) {
        expect(output).toContain(label);
      }
      for (const label of EXPECTED_LABELS[width].absent) {
        expect(output).not.toContain(label);
      }
    });
  }
});

describe("deterministic motion assignment", () => {
  it("assigns a stable spinner style per agent", () => {
    expect(getSpinnerStyleForAgent("agent-A")).toBe(getSpinnerStyleForAgent("agent-A"));
  });

  it("role-based styles are agent-independent (semantic roles)", () => {
    // Non-agent roles resolve through ROLE_STYLES[pack][role], so every agent
    // gets the same style for a given semantic role.
    expect(getSpinnerStyleForAgent("agent-A", "header")).toBe(getSpinnerStyleForAgent("agent-Z", "header"));
  });

  it("returns a valid spinner style", () => {
    const style = getSpinnerStyleForAgent("agent-A");
    expect(Object.keys(SPINNER_FRAMES)).toContain(style);
  });

  it("frame is deterministic for identical (agent, frame, role)", () => {
    const a = getAgentSpinnerFrame("agent-A", 5, "header");
    const b = getAgentSpinnerFrame("agent-A", 5, "header");
    expect(a).toBe(b);
  });

  it("motion glyphs are single-cell (no layout shift)", () => {
    const roles = ["agent", "header", "queue", "handoff", "swarm", "tool", "scheduler"] as const;
    for (const role of roles) {
      const glyph = getAgentSpinnerFrame("agent-A", 3, role);
      expect(visibleWidth(glyph)).toBeLessThanOrEqual(1);
    }
  });
});

describe("frame wrapping — ANSI-aware, no overflow", () => {
  for (const width of WIDTHS) {
    it(`wraps a long colored line to ${width} cols`, () => {
      const colored = `\x1b[32m${"a".repeat(200)}\x1b[0m`;
      const lines = wrapTextWithAnsi(colored, width);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    });
  }
});

describe("golden coverage across terminal widths", () => {
  for (const width of WIDTHS) {
    it(`header @ ${width}`, () => {
      expect(renderDashboardHeader(width, plainTheme, box, headerState())).toMatchSnapshot();
    });

    it(`top table @ ${width}`, () => {
      expect(renderTopTable(topEntries, "tokens" as SortKey, false, 0, 50, plainTheme, width)).toMatchSnapshot();
    });

    it(`running card @ ${width}`, () => {
      const rec = agent("running", "Investigating the authentication middleware failure across the fleet");
      expect(renderRunningCard(rec, width - 2, plainTheme, box, cardState())).toMatchSnapshot();
    });
  }
});
