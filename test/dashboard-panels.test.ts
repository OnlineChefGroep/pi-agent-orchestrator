import { describe, expect, it, vi } from "vitest";

// Mock the external dependencies
vi.mock("../src/ui/tui-shim.js", () => ({
  visibleWidth: (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length,
  truncateToWidth: (text) => text,
  wrapTextWithAnsi: (text) => text.split(/\n/),
  matchesKey: (data, keyId) => data === keyId,
  Text: class {
    constructor(c) {
      this.content = c;
    }
    render() {
      return [this.content];
    }
  },
  getAnsiSequenceLength: (_str: string, _i: number) => 0,
}));

vi.mock("../src/ui/theme.js", () => ({
  framedRow: (text: string, _w: number, _th: unknown, _box: unknown) => `| ${text} |`,
  borderLine: (_w: number, _th: unknown, _box: unknown, _type: string) => "|---|",
}));

const th = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  title: "\x1b[1m",
  muted: "\x1b[2m",
  accent: "\x1b[36m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  warning: "\x1b[33m",
  highlight: "\x1b[1;35m",
  border: "\x1b[2m",
  fg: () => "",
} as any;

const box = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", cross: "┼" };

import { renderDashboardEmpty, renderDashboardHelp } from "../src/ui/dashboard/panels.js";

describe("renderDashboardHelp", () => {
  it("returns an array of framed lines", () => {
    const lines = renderDashboardHelp(80, th, box);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(10);
  });

  it("includes navigation section", () => {
    const lines = renderDashboardHelp(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/Navigation/);
  });

  it("includes actions section", () => {
    const lines = renderDashboardHelp(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/View full conversation/);
  });

  it("includes the schedule view key", () => {
    const lines = renderDashboardHelp(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/z/);
  });

  it("includes general section with close command", () => {
    const lines = renderDashboardHelp(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/Close dashboard/);
  });
});

describe("renderDashboardEmpty", () => {
  it("returns framed empty state lines", () => {
    const lines = renderDashboardEmpty(80, th, box);
    expect(Array.isArray(lines)).toBe(true);
  });

  it("includes empty state message", () => {
    const lines = renderDashboardEmpty(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/No agents in this session/);
  });

  it("includes hint about spawning agents", () => {
    const lines = renderDashboardEmpty(80, th, box);
    const text = lines.join("");
    expect(text).toMatch(/Spawn/);
  });
});
