import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import type { AgentActivity } from "../src/ui/agent-ui-types.js";
import type { BoxChars, DashboardTheme } from "../src/ui/theme.js";

// ── Mock theme (premium-like with test-friendly markers) ────────────────

// Use real ANSI escape codes so visibleWidth() strips them correctly
const th: DashboardTheme = {
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
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  l: "│", r: "│", h: "─", ml: "├", mr: "┤",
};

// ── Helpers to build mock data ──────────────────────────────────────────

function mockRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "test-1",
    type: "general-purpose",
    description: "test agent",
    status: "running",
    toolUses: 3,
    startedAt: Date.now() - 5000,
    lifetimeUsage: { input: 1000, output: 500, cacheWrite: 100 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
    spawnedAt: Date.now() - 5000,
    ...overrides,
  } as AgentRecord;
}

function mockActivity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    activeTools: new Map(),
    toolUses: 3,
    responseText: "",
    turnCount: 5,
    maxTurns: 10,
    lifetimeUsage: { input: 1000, output: 500, cacheWrite: 100 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// progress.ts
// ═══════════════════════════════════════════════════════════════════════

const { renderProgressBar, renderTurnProgress } = await import("../src/ui/dashboard/progress.js");

describe("renderProgressBar", () => {
  it("returns empty string when max <= 0", () => {
    expect(renderProgressBar(5, 0, 10, th)).toBe("");
    expect(renderProgressBar(5, -1, 10, th)).toBe("");
  });

  it("returns empty string when width <= 0", () => {
    expect(renderProgressBar(5, 10, 0, th)).toBe("");
    expect(renderProgressBar(5, 10, -1, th)).toBe("");
  });

  it("renders fully empty bar when value is 0", () => {
    const bar = renderProgressBar(0, 10, 8, th);
    // Should contain 0 filled and 8 light blocks
    expect(bar).toContain("░".repeat(8));
    expect(bar).not.toContain("█");
  });

  it("renders fully filled bar when value equals max", () => {
    const bar = renderProgressBar(10, 10, 8, th);
    expect(bar).toContain("█".repeat(8));
    expect(bar).not.toContain("░");
  });

  it("renders half filled bar", () => {
    const bar = renderProgressBar(5, 10, 10, th);
    expect(bar).toContain("█".repeat(5));
    expect(bar).toContain("░".repeat(5));
  });

  it("clamps value above max", () => {
    const bar = renderProgressBar(20, 10, 8, th);
    expect(bar).toContain("█".repeat(8));
  });

  it("uses accent color when percentage < 70%", () => {
    const bar = renderProgressBar(3, 10, 10, th); // 30%
    expect(bar).toContain("\x1b[1;36m"); // accent
  });

  it("uses highlight color when percentage is 70-84%", () => {
    const bar = renderProgressBar(7, 10, 10, th); // 70%
    expect(bar).toContain("\x1b[1;33m"); // highlight
  });

  it("uses error color when percentage >= 85%", () => {
    const bar = renderProgressBar(9, 10, 10, th); // 90%
    expect(bar).toContain("\x1b[1;31m"); // error
  });

  it("produces exactly width characters of blocks", () => {
    for (const w of [5, 10, 20, 40]) {
      const bar = renderProgressBar(3, 10, w, th);
      // Strip ANSI escape codes and count only block characters
      const stripped = bar.replace(/\x1b\[[0-9;]*m/g, "");
      expect(stripped.length).toBe(w);
    }
  });
});

describe("renderTurnProgress", () => {
  it("renders compact format when maxTurns is null", () => {
    const result = renderTurnProgress(3, null, 10, th);
    expect(result).toContain("⟳3");
    expect(result).not.toContain("≤");
  });

  it("renders compact format when maxTurns is undefined", () => {
    const result = renderTurnProgress(3, undefined, 10, th);
    expect(result).toContain("⟳3");
    expect(result).not.toContain("≤");
  });

  it("renders compact format when maxTurns <= 0", () => {
    const result = renderTurnProgress(3, 0, 10, th);
    expect(result).toContain("⟳3");
  });

  it("renders full format with turn count, max, and progress bar", () => {
    const result = renderTurnProgress(5, 10, 8, th);
    expect(result).toContain("⟳5≤10");
    expect(result).toContain("█"); // has filled blocks
    expect(result).toContain("░"); // has empty blocks
  });

  it("uses dim color for turn label when < 70%", () => {
    const result = renderTurnProgress(3, 10, 8, th); // 30%
    expect(result).toContain("\x1b[2m"); // dim
  });

  it("uses highlight color for turn label when 70-84%", () => {
    const result = renderTurnProgress(7, 10, 8, th); // 70%
    expect(result).toContain("\x1b[1;33m"); // highlight
  });

  it("uses error color for turn label when >= 85%", () => {
    const result = renderTurnProgress(9, 10, 8, th); // 90%
    expect(result).toContain("\x1b[1;31m"); // error
  });
});

// ═══════════════════════════════════════════════════════════════════════
// helpers.ts
// ═══════════════════════════════════════════════════════════════════════

const { statusIcon, statusColor, agentStats, activityText } = await import("../src/ui/dashboard/helpers.js");
const { getSpinnerFrame } = await import("../src/ui/animation.js");

describe("statusIcon", () => {
  it("returns spinner frame for running agents", () => {
    const rec = mockRecord({ status: "running" });
    expect(statusIcon(rec, 0)).toBe(getSpinnerFrame(0));
    expect(statusIcon(rec, 5)).toBe(getSpinnerFrame(5));
  });

  it("returns ◔ for queued agents", () => {
    const rec = mockRecord({ status: "queued" });
    expect(statusIcon(rec, 0)).toBe("◔");
  });

  it("returns ✓ for completed agents", () => {
    const rec = mockRecord({ status: "completed" });
    expect(statusIcon(rec, 0)).toBe("✓");
  });

  it("returns ✓ for steered agents", () => {
    const rec = mockRecord({ status: "steered" });
    expect(statusIcon(rec, 0)).toBe("✓");
  });

  it("returns ■ for stopped agents", () => {
    const rec = mockRecord({ status: "stopped" });
    expect(statusIcon(rec, 0)).toBe("■");
  });

  it("returns ✗ for error agents", () => {
    const rec = mockRecord({ status: "error" });
    expect(statusIcon(rec, 0)).toBe("✗");
  });

  it("returns ✗ for aborted agents", () => {
    const rec = mockRecord({ status: "aborted" });
    expect(statusIcon(rec, 0)).toBe("✗");
  });
});

describe("statusColor", () => {
  it("returns accent for running", () => {
    expect(statusColor(mockRecord({ status: "running" }), th)).toBe(th.accent);
  });

  it("returns success for completed", () => {
    expect(statusColor(mockRecord({ status: "completed" }), th)).toBe(th.success);
  });

  it("returns success for steered", () => {
    expect(statusColor(mockRecord({ status: "steered" }), th)).toBe(th.success);
  });

  it("returns error for error", () => {
    expect(statusColor(mockRecord({ status: "error" }), th)).toBe(th.error);
  });

  it("returns error for aborted", () => {
    expect(statusColor(mockRecord({ status: "aborted" }), th)).toBe(th.error);
  });

  it("returns dim for queued", () => {
    expect(statusColor(mockRecord({ status: "queued" }), th)).toBe(th.dim);
  });

  it("returns dim for stopped", () => {
    expect(statusColor(mockRecord({ status: "stopped" }), th)).toBe(th.dim);
  });
});

describe("agentStats", () => {
  it("includes turn count when activity is provided", () => {
    const rec = mockRecord();
    const activity = mockActivity({ turnCount: 3, maxTurns: 10 });
    const stats = agentStats(rec, activity);
    expect(stats).toContain("⟳3≤10");
  });

  it("includes token count when lifetimeUsage is present", () => {
    const rec = mockRecord();
    const activity = mockActivity({
      lifetimeUsage: { input: 5000, output: 2000, cacheWrite: 500 },
    });
    const stats = agentStats(rec, activity);
    expect(stats).toContain("token");
  });

  it("includes tool count when toolUses > 0", () => {
    const rec = mockRecord({ toolUses: 5 });
    const stats = agentStats(rec);
    expect(stats).toContain("5 tools");
  });

  it("uses singular 'tool' for toolUses === 1", () => {
    const rec = mockRecord({ toolUses: 1 });
    const stats = agentStats(rec);
    expect(stats).toContain("1 tool");
    expect(stats).not.toContain("1 tools");
  });

  it("omits tool count when toolUses is 0", () => {
    const rec = mockRecord({ toolUses: 0 });
    const stats = agentStats(rec);
    expect(stats).not.toContain("tool");
  });

  it("includes duration when startedAt is set", () => {
    const rec = mockRecord({ startedAt: Date.now() - 10000 });
    const stats = agentStats(rec);
    expect(stats).toContain("s");
  });

  it("omits duration when startedAt is undefined", () => {
    const rec = mockRecord({ startedAt: undefined });
    const stats = agentStats(rec);
    expect(stats).not.toContain("(running)");
  });

  it("joins parts with · separator", () => {
    const rec = mockRecord({ toolUses: 2 });
    const activity = mockActivity({ turnCount: 1, maxTurns: 5 });
    const stats = agentStats(rec, activity);
    expect(stats).toContain(" · ");
  });
});

describe("activityText", () => {
  it("returns activity description for running agent with activity", () => {
    const rec = mockRecord({ status: "running" });
    const activity = mockActivity({
      activeTools: new Map([["read", "file.ts"]]),
    });
    const text = activityText(rec, activity);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toBe("running");
  });

  it("returns result preview for completed agent", () => {
    const rec = mockRecord({ status: "completed", result: "Task completed successfully" });
    const text = activityText(rec);
    expect(text).toContain("Task completed successfully");
  });

  it("returns result preview for steered agent", () => {
    const rec = mockRecord({ status: "steered", result: "Steered to focus on X" });
    const text = activityText(rec);
    expect(text).toContain("Steered to focus on X");
  });

  it("truncates result to 120 characters", () => {
    const longResult = "x".repeat(200);
    const rec = mockRecord({ status: "completed", result: longResult });
    const text = activityText(rec);
    expect(text.length).toBeLessThanOrEqual(120);
  });

  it("returns error message for errored agent", () => {
    const rec = mockRecord({ status: "error", error: "Something went wrong" });
    const text = activityText(rec);
    expect(text).toContain("Error:");
    expect(text).toContain("Something went wrong");
  });

  it("returns waiting message for queued agent", () => {
    const rec = mockRecord({ status: "queued" });
    const text = activityText(rec);
    expect(text).toBe("waiting for an available slot");
  });

  it("returns status string as fallback", () => {
    const rec = mockRecord({ status: "stopped" });
    const text = activityText(rec);
    expect(text).toBe("stopped");
  });

  it("replaces newlines in result with spaces", () => {
    const rec = mockRecord({ status: "completed", result: "line1\nline2\nline3" });
    const text = activityText(rec);
    expect(text).not.toContain("\n");
    expect(text).toContain("line1 line2 line3");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// header.ts
// ═══════════════════════════════════════════════════════════════════════

// Mock getUiStyle to return "premium" for consistent tests
const { renderDashboardHeader } = await import("../src/ui/dashboard/header.js");
const { visibleWidth } = await import("@earendil-works/pi-tui");

function mockState(agents: AgentRecord[] = [], selectedIds = new Set<string>(), selectedIndex = 0) {
  return {
    agents,
    selectedIndex,
    selectedIds,
    frame: 0,
    agentActivity: new Map(),
  };
}

describe("renderDashboardHeader", () => {
  it("returns exactly 5 lines", () => {
    const lines = renderDashboardHeader(80, th, box, mockState());
    expect(lines.length).toBe(5);
  });

  it("first line is top border with box chars", () => {
    const lines = renderDashboardHeader(80, th, box, mockState());
    expect(lines[0]).toContain("╭");
    expect(lines[0]).toContain("╮");
  });

  it("last line is mid border", () => {
    const lines = renderDashboardHeader(80, th, box, mockState());
    expect(lines[4]).toContain("├");
    expect(lines[4]).toContain("┤");
  });

  it("title line contains AGENT DASHBOARD", () => {
    const lines = renderDashboardHeader(80, th, box, mockState());
    expect(lines[1]).toContain("AGENT DASHBOARD");
  });

  it("summary line shows agent counts", () => {
    const agents = [
      mockRecord({ status: "running" }),
      mockRecord({ status: "running" }),
      mockRecord({ status: "completed" }),
    ];
    const lines = renderDashboardHeader(80, th, box, mockState(agents));
    const summary = lines[3];
    expect(summary).toContain("2 running");
    expect(summary).toContain("1 done");
  });

  it("summary line shows error count when errors exist", () => {
    const agents = [
      mockRecord({ status: "error" }),
    ];
    const lines = renderDashboardHeader(80, th, box, mockState(agents));
    expect(lines[3]).toContain("1 error");
  });

  it("summary line hides error count when no errors", () => {
    const agents = [mockRecord({ status: "running" })];
    const lines = renderDashboardHeader(80, th, box, mockState(agents));
    expect(lines[3]).not.toContain("error");
  });

  it("summary line shows selected count when items are selected", () => {
    const agents = [mockRecord({ status: "running" })];
    const selectedIds = new Set(["test-1"]);
    const lines = renderDashboardHeader(80, th, box, mockState(agents, selectedIds));
    expect(lines[3]).toContain("1 selected");
  });

  it("all lines fit within the given width", () => {
    for (const w of [40, 80, 120, 200]) {
      const lines = renderDashboardHeader(w, th, box, mockState());
      for (let i = 0; i < lines.length; i++) {
        const vw = visibleWidth(lines[i]);
        expect(vw, `line ${i} exceeds width ${w} (got ${vw})`).toBeLessThanOrEqual(w);
      }
    }
  });

  it("handles empty agent list gracefully", () => {
    const lines = renderDashboardHeader(80, th, box, mockState([]));
    expect(lines.length).toBe(5);
    expect(lines[3]).toContain("0 running");
  });

  it("applies TrueColor background to all header lines when bgHeader is set", () => {
    const bgTh = { ...th, bgHeader: "\x1b[48;2;20;20;35m" };
    const lines = renderDashboardHeader(80, bgTh, box, mockState());
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i], `line ${i} missing bgHeader`).toContain("\x1b[48;2;20;20;35m");
    }
  });

  it("does not apply bgHeader when empty (retro/plain themes)", () => {
    const plainTh = { ...th, bgHeader: "" };
    const lines = renderDashboardHeader(80, plainTh, box, mockState());
    // Lines should NOT contain the bg sequence
    for (const line of lines) {
      expect(line).not.toContain("\x1b[48;2;20;20;35m");
    }
  });
});
