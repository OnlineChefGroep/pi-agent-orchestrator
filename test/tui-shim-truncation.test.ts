import { describe, expect, it } from "vitest";
import { padAndTruncate } from "../src/ui/theme.js";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../src/ui/tui-shim.js";

describe("truncateToWidth", () => {
  it("clamps a custom ellipsis wider than maxWidth", () => {
    const out = truncateToWidth("ab", 1, "...");
    expect(visibleWidth(out)).toBeLessThanOrEqual(1);
    expect(out).toContain(".");
  });

  it("keeps default ellipsis within maxWidth", () => {
    const out = truncateToWidth("abcdefgh", 4);
    expect(visibleWidth(out)).toBe(4);
    expect(out).toContain("…");
  });
});

describe("padAndTruncate", () => {
  it("truncates long strings with an ellipsis then pads to width", () => {
    const out = padAndTruncate("abcdefghij", 5);
    expect(visibleWidth(out)).toBe(5);
    expect(out).toContain("…");
  });

  it("pads short strings without adding an ellipsis", () => {
    const out = padAndTruncate("ab", 5);
    expect(out).toBe("ab   ");
    expect(visibleWidth(out)).toBe(5);
  });
});

describe("wrapTextWithAnsi", () => {
  it("preserves SGR sequences for the next wrapped chunk", () => {
    const red = "\u001b[31m";
    const lines = wrapTextWithAnsi(`ABCD${red}EFGH`, 4);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Color must remain on the continuation, not be consumed into the first chunk's slice.
    expect(lines.slice(1).join("")).toContain(red);
    expect(lines[0]).not.toContain(red);
  });
});
