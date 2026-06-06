import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { buildDashboardBodyLines } from "../src/ui/dashboard/body.js";
import type { DashboardRenderState } from "../src/ui/dashboard/types.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";

const th: DashboardTheme = {
  border: "", title: "", dim: "", muted: "", highlight: "", accent: "", success: "", error: "", reset: "", bgCard: "", bgSelected: "", bgHeader: ""
};
const box: BoxChars = { tl: "", tr: "", bl: "", br: "", l: "", r: "", h: "", ml: "", mr: "" };

describe("Benchmark: Dashboard body rendering", () => {
  it("benchmarks body building", () => {
    const agents: AgentRecord[] = [];
    for (let i = 0; i < 50000; i++) {
      agents.push({
        id: `agent-${i}`,
        type: "general",
        description: "test",
        status: i % 3 === 0 ? "running" : i % 3 === 1 ? "queued" : "completed",
        swarmId: i % 10 === 0 ? `swarm-${i % 100}` : undefined,
        toolUses: 0,
        spawnedAt: 0,
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        currentLevel: 0,
        compactionCount: 0,
        totalSpawned: 0,
      });
    }
    const state: DashboardRenderState = {
      agents,
      selectedIndex: 0,
      agentActivity: new Map(),
      selectedIds: new Set(),
      frame: 0
    };

    console.time("buildDashboardBodyLines - 50000 agents");
    for (let i = 0; i < 100; i++) {
        buildDashboardBodyLines(100, th, box, state);
    }
    console.timeEnd("buildDashboardBodyLines - 50000 agents");
    expect(true).toBe(true);
  });
});
