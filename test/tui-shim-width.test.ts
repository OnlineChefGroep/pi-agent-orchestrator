import { describe, expect, it } from "vitest";
import { truncateToWidth, visibleWidth } from "../src/ui/tui-shim.js";

describe("TUI Width Calculations", () => {
  it("counts standard characters normally", () => {
    expect(visibleWidth("hello")).toBe(5);
  });

  it("handles valid surrogate pairs correctly (conservative over-count policy)", () => {
    // 🚀 is a surrogate pair (length 2). Policy says we count every unit.
    expect(visibleWidth("🚀")).toBe(2);
    expect(visibleWidth("hello 🚀")).toBe(8); // 5 + 1 space + 2 = 8
  });

  it("handles unpaired high/low surrogates without crashing", () => {
    const high = "\uD83D";
    const low = "\uDE80";
    expect(visibleWidth(high)).toBe(1);
    expect(visibleWidth(low)).toBe(1);
  });

  it("ignores ANSI escape sequences", () => {
    expect(visibleWidth("\x1b[31mhello\x1b[0m")).toBe(5);
  });

  it("handles high-surrogate-before-ANSI safely", () => {
    const str = "test \uD83D\x1b[31mANSI\x1b[0m";
    expect(visibleWidth(str)).toBe(10); // "test " (5) + high (1) + ANSI (4) = 10
  });

  it("handles ANSI-wrapped emoji correctly", () => {
    const str = "\x1b[31m🚀\x1b[0m";
    expect(visibleWidth(str)).toBe(2);
  });

  describe("truncateToWidth", () => {
    it("truncates exact widths", () => {
      expect(truncateToWidth("hello", 3)).toBe("he…\x1b[0m");
      expect(truncateToWidth("hello", 5)).toBe("hello");
      expect(truncateToWidth("\x1b[31mhello\x1b[0m", 3)).toBe("\x1b[31mhe…\x1b[0m");
      expect(truncateToWidth("\x1b[31mhello\x1b[0m", 5)).toBe("\x1b[31mhello\x1b[0m");
    });

    it("hard wrapping splits correctly", () => {
        expect(truncateToWidth("a🚀b", 2)).toBe("a…\x1b[0m");
    });
  });
});
