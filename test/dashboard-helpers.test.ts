import { describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { activityText, agentStats, statusColor, statusIcon } from "../src/ui/dashboard/helpers.js";

const theme = {
  accent: "ACCENT",
  success: "SUCCESS",
  error: "ERROR",
  dim: "DIM",
  muted: "MUTED",
  fg: () => "",
  reset: "",
  title: "",
  border: "",
  highlight: "",
  warning: "WARNING",
} as any;

const baseRecord: AgentRecord = {
  id: "test-1",
  type: "Explore",
  description: "Test agent",
  status: "running",
  level: 0,
  invocation: { type: "Explore", description: "Test", model: "claude", toolAllowList: [], level: 0 },
  lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
} as any;

describe("statusIcon", () => {
  it("returns spinner for running", () => {
    const icon = statusIcon({ ...baseRecord, status: "running" }, 0);
    expect(typeof icon).toBe("string");
    expect(icon.length).toBeGreaterThan(0);
  });

  it("returns queued icon", () => {
    expect(statusIcon({ ...baseRecord, status: "queued" }, 0)).toBe("◔");
  });

  it("returns check for completed", () => {
    expect(statusIcon({ ...baseRecord, status: "completed" }, 0)).toBe("✓");
  });

  it("returns check for steered", () => {
    expect(statusIcon({ ...baseRecord, status: "steered" }, 0)).toBe("✓");
  });

  it("returns stop for stopped", () => {
    expect(statusIcon({ ...baseRecord, status: "stopped" }, 0)).toBe("■");
  });

  it("returns cross for error", () => {
    expect(statusIcon({ ...baseRecord, status: "error" }, 0)).toBe("✗");
  });

  it("returns cross for unknown status", () => {
    expect(statusIcon({ ...baseRecord, status: "unknown" as any }, 0)).toBe("✗");
  });
});

describe("statusColor", () => {
  it("uses accent for running", () => {
    expect(statusColor({ ...baseRecord, status: "running" }, theme)).toBe("ACCENT");
  });

  it("uses success for completed", () => {
    expect(statusColor({ ...baseRecord, status: "completed" }, theme)).toBe("SUCCESS");
  });

  it("uses error for aborted", () => {
    expect(statusColor({ ...baseRecord, status: "aborted" }, theme)).toBe("ERROR");
  });

  it("uses dim for default", () => {
    expect(statusColor({ ...baseRecord, status: "queued" }, theme)).toBe("DIM");
  });
});

describe("agentStats", () => {
  it("returns empty for no data", () => {
    expect(agentStats(baseRecord)).toBe("");
  });

  it("includes tool uses", () => {
    const rec = { ...baseRecord, toolUses: 5 };
    expect(agentStats(rec)).toMatch(/5 tools/);
  });

  it("includes singular tool use", () => {
    const rec = { ...baseRecord, toolUses: 1 };
    expect(agentStats(rec)).toMatch(/1 tool/);
  });

  it("includes duration when started", () => {
    const rec = { ...baseRecord, startedAt: Date.now() - 5000, completedAt: Date.now() };
    const stats = agentStats(rec);
    expect(stats).toMatch(/\d\.\ds/);
  });

  it("includes turn count from activity", () => {
    const activity = {
      turnCount: 3,
      activeTools: new Map(),
      toolUses: 0,
      responseText: "",
      lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
      lastSeenMs: Date.now(),
    };
    const stats = agentStats(baseRecord, activity);
    expect(stats).toMatch(/3/);
  });
});

describe("activityText", () => {
  it("returns status for running agents", () => {
    const result = activityText({ ...baseRecord, status: "running" });
    expect(typeof result).toBe("string");
  });

  it("returns result preview for completed agents", () => {
    const rec = { ...baseRecord, status: "completed", completedAt: Date.now(), result: "Task done here" };
    expect(activityText(rec)).toBe("Task done here");
  });

  it("returns error message for error agents", () => {
    const rec = { ...baseRecord, status: "error", error: "Something broke" };
    expect(activityText(rec)).toMatch(/Error: Something broke/);
  });

  it("returns queued message", () => {
    const rec = { ...baseRecord, status: "queued" };
    expect(activityText(rec)).toMatch(/waiting/);
  });

  it("returns status string for other", () => {
    const rec = { ...baseRecord, status: "unknown" as any };
    expect(activityText(rec)).toBe("unknown");
  });

  it("shows activity for running agents with active tools", () => {
    const activity = {
      turnCount: 1,
      activeTools: new Map([["k", "read"]]),
      toolUses: 0,
      responseText: "",
      lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
      lastSeenMs: Date.now(),
    };
    const rec = { ...baseRecord, status: "running" };
    const result = activityText(rec, activity);
    expect(result).toMatch(/reading/);
  });
});
