import { describe, expect, it } from "vitest";
import {
  buildInvocationTags,
  describeActivity,
  formatDuration,
  formatMs,
  formatTokens,
  formatTurns,
} from "../src/ui/agent-format.js";

describe("formatTokens", () => {
  it("formats millions", () => {
    expect(formatTokens(2_500_000)).toMatch(/2\.5M token/);
  });

  it("formats thousands", () => {
    expect(formatTokens(5_000)).toMatch(/5\.0k token/);
  });

  it("formats small numbers", () => {
    expect(formatTokens(42)).toBe("42 token");
  });

  it("handles zero", () => {
    expect(formatTokens(0)).toBe("0 token");
  });
});

describe("formatTurns", () => {
  it("formats turns without max", () => {
    expect(formatTurns(5)).toMatch(/5/);
  });

  it("formats turns with max", () => {
    expect(formatTurns(3, 10)).toMatch(/3.*10/);
  });

  it("handles null maxTurns", () => {
    expect(formatTurns(7, null)).toMatch(/7/);
  });
});

describe("formatMs", () => {
  it("formats milliseconds to seconds", () => {
    expect(formatMs(1500)).toBe("1.5s");
  });

  it("handles zero", () => {
    expect(formatMs(0)).toBe("0.0s");
  });
});

describe("formatDuration", () => {
  it("formats completed duration", () => {
    const result = formatDuration(1000, 5000);
    expect(result).toMatch(/4\.0s/);
  });

  it("formats running duration with suffix", () => {
    const result = formatDuration(Date.now() - 1000);
    expect(result).toMatch(/running/);
  });

  it("handles zero completedAt", () => {
    const result = formatDuration(0, 5000);
    expect(result).toMatch(/5\.0s/);
  });
});

describe("buildInvocationTags", () => {
  it("handles empty invocation", () => {
    const result = buildInvocationTags(undefined);
    expect(result.tags).toEqual([]);
  });

  it("includes thinking tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      thinking: "high",
    } as any);
    expect(result.tags).toContain("thinking: high");
  });

  it("includes isolated tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      isolated: true,
    } as any);
    expect(result.tags).toContain("isolated");
  });

  it("includes worktree tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      isolation: "worktree",
    } as any);
    expect(result.tags).toContain("worktree");
  });

  it("includes background tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      runInBackground: true,
    } as any);
    expect(result.tags).toContain("background");
  });

  it("includes max turns tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      maxTurns: 5,
    } as any);
    expect(result.tags.some((t) => t.includes("max turns"))).toBe(true);
  });

  it("extracts modelName", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      modelName: "claude",
    } as any);
    expect(result.modelName).toBe("claude");
  });

  it("includes inherit context tag", () => {
    const result = buildInvocationTags({
      type: "Explore",
      description: "",
      model: "",
      toolAllowList: [],
      level: 0,
      inheritContext: true,
    } as any);
    expect(result.tags).toContain("inherit context");
  });
});

describe("describeActivity", () => {
  it("returns thinking for empty", () => {
    const tools = new Map<string, string>();
    expect(describeActivity(tools)).toBe("thinking…");
  });

  it("describes active tools", () => {
    const tools = new Map<string, string>();
    tools.set("k1", "read");
    tools.set("k2", "bash");
    expect(describeActivity(tools)).toMatch(/reading|running/);
  });

  it("groups duplicate tool names", () => {
    const tools = new Map<string, string>();
    tools.set("a", "read");
    tools.set("b", "read");
    tools.set("c", "edit");
    const result = describeActivity(tools);
    expect(result).toMatch(/reading 2/);
  });

  it("falls back to response text", () => {
    const tools = new Map<string, string>();
    expect(describeActivity(tools, "hello there")).toBe("hello there");
  });

  it("truncates long response text", () => {
    const tools = new Map<string, string>();
    const long = "a".repeat(100);
    const result = describeActivity(tools, long);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(100);
  });

  it("handles unknown tool names gracefully", () => {
    const tools = new Map<string, string>();
    tools.set("x", "nonexistent_tool");
    expect(describeActivity(tools)).toMatch(/nonexistent_tool/);
  });
});
