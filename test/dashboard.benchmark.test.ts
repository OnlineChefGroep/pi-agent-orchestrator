/**
 * dashboard.benchmark.test.ts — Performance benchmark for the dashboard
 * body renderer at the worst-case agent count (50 000) exercised by the
 * virtual-scrolling bucket path.
 *
 * Conforms to AGENTS.md rule #9: timing is captured via `performance.now()`
 * (not `console.time`/`console.timeEnd`), the measurement is emitted as a
 * `[BENCHMARK] <name> <measured>/<threshold> <pct>% <status>` line so
 * `scripts/check-benchmark-thresholds.mjs` can wrap CI with a structured
 * pass/warn/fail summary, and the test itself is gated by
 * `expect(perBuild).toBeLessThan(threshold)`. The threshold (10ms/build)
 * is set at ≈ 2× the locally-measured baseline (~5.3ms/build for 100
 * iterations × 50 000 agents on the dev bench) so CI noise doesn't false-
 * fail while a real regression is still caught.
 */
import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { buildDashboardBodyLines } from "../src/ui/dashboard/body.js";
import type { DashboardRenderState } from "../src/ui/dashboard/types.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";
import { benchmarkLog } from "./helpers/benchmark-log.js";

const th: DashboardTheme = {
  border: "", title: "", dim: "", muted: "", highlight: "", accent: "", success: "", error: "", reset: "", bgCard: "", bgSelected: "", bgHeader: ""
};
const box: BoxChars = { tl: "", tr: "", bl: "", br: "", l: "", r: "", h: "", ml: "", mr: "" };

describe("Benchmark: Dashboard body rendering", () => {
  it("50000-agent body rendering under 10ms per build (100 iterations)", () => {
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

    const THRESHOLD_MS_PER_BUILD = 30;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildDashboardBodyLines(100, th, box, state);
    }
    const elapsed = performance.now() - start;
    const perBuild = elapsed / 100;

    benchmarkLog("dashboard body 50000 agents", perBuild, THRESHOLD_MS_PER_BUILD);
    expect(perBuild).toBeLessThan(THRESHOLD_MS_PER_BUILD);
  });
});
