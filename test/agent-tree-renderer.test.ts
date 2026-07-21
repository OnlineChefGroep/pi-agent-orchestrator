import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { renderTreeView } from "../src/ui/agent-tree-renderer.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";

const theme: DashboardTheme = {
  border: "\x1b[31m",
  title: "\x1b[1;37m",
  dim: "\x1b[2m",
  muted: "\x1b[37m",
  highlight: "\x1b[1;33m",
  accent: "\x1b[1;36m",
  success: "\x1b[1;32m",
  error: "\x1b[1;31m",
  reset: "\x1b[0m",
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

function createRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    type: "general-purpose",
    description: "test agent",
    status: "running",
    spawnedAt: 1_000,
    startedAt: 1_001,
    toolUses: 0,
    currentLevel: 0,
    totalSpawned: 0,
    compactionCount: 0,
    lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
    ...overrides,
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderTreeView", () => {
  it("renders the empty-state guidance", () => {
    const output = renderTreeView(120, theme, box, []).map(stripAnsi).join("\n");

    expect(output).toContain("No agents in this session");
  });

  it("preserves hierarchy and applies status symbols during direct traversal", () => {
    const records: AgentRecord[] = [
      createRecord({ id: "root", type: "Explore", status: "running" }),
      createRecord({ id: "child-1", type: "Plan", status: "completed", parentId: "root" }),
      createRecord({ id: "child-2", type: "Analysis", status: "queued", parentId: "root" }),
    ];

    const output = renderTreeView(120, theme, box, records).map(stripAnsi).join("\n");

    expect(output).toContain("● root (Explore) [running]");
    expect(output).toContain("├─ ✓ child-1 (Plan) [completed]");
    expect(output).toContain("└─ ○ child-2 (Analysis) [queued]");
  });

  it("does not confuse agent ids that are prefixes of other ids", () => {
    const records: AgentRecord[] = [
      createRecord({ id: "agent-1", status: "running" }),
      createRecord({ id: "agent-10", status: "completed" }),
    ];

    const lines = renderTreeView(120, theme, box, records).map(stripAnsi);
    const agentTenLine = lines.find((line) => line.includes("agent-10"));

    expect(agentTenLine).toBeDefined();
    expect(agentTenLine).toContain("✓ agent-10");
    expect(agentTenLine).toContain("[completed]");
    expect(agentTenLine).not.toContain("● agent-10");
    expect(agentTenLine).not.toContain("[running]");
  });
});
