import { describe, expect, it } from "vitest";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../src/ui/tui-shim.js";

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

describe("tui-shim ANSI width helpers", () => {
  it("keeps ellipsis for actual truncation", () => {
    expect(truncateToWidth("abcdef", 4)).toContain("…");
  });

  it("hard-wraps long tokens without ellipses", () => {
    const wrapped = wrapTextWithAnsi("abcdefghij", 4);

    expect(wrapped).toHaveLength(3);
    expect(wrapped.join("")).not.toContain("…");
    expect(stripAnsi(wrapped.join(""))).toBe("abcdefghij");
    expect(wrapped.every((line) => visibleWidth(line) <= 4)).toBe(true);
  });

  it("hard-wraps ANSI-styled long tokens without ellipses", () => {
    const wrapped = wrapTextWithAnsi("\u001b[31mabcdefghij\u001b[0m", 4);

    expect(wrapped.join("")).not.toContain("…");
    expect(stripAnsi(wrapped.join(""))).toBe("abcdefghij");
    expect(wrapped.every((line) => visibleWidth(line) <= 4)).toBe(true);
  });
});
