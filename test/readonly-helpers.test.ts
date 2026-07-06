import { describe, expect, it } from "vitest";
import { getReadOnlyMemoryToolNames, READ_ONLY_TOOLS } from "../src/readonly-helpers.js";

describe("READ_ONLY_TOOLS", () => {
  it("contains the standard read-only tool allowlist", () => {
    expect(READ_ONLY_TOOLS).toEqual(["read", "bash", "grep"]);
  });

  it("has exactly 3 entries", () => {
    expect(READ_ONLY_TOOLS).toHaveLength(3);
  });

  it("does not include write or edit", () => {
    expect(READ_ONLY_TOOLS).not.toContain("write");
    expect(READ_ONLY_TOOLS).not.toContain("edit");
  });
});

describe("getReadOnlyMemoryToolNames", () => {
  it('returns ["read"] when the set is empty', () => {
    expect(getReadOnlyMemoryToolNames(new Set())).toEqual(["read"]);
  });

  it('returns [] when the set already contains "read"', () => {
    expect(getReadOnlyMemoryToolNames(new Set(["read"]))).toEqual([]);
  });

  it('returns ["read"] when the set contains unrelated tools', () => {
    expect(getReadOnlyMemoryToolNames(new Set(["write", "edit", "bash"]))).toEqual(["read"]);
  });

  it('returns [] when the set contains "read" alongside other tools', () => {
    expect(getReadOnlyMemoryToolNames(new Set(["read", "write", "edit"]))).toEqual([]);
  });

  it("handles a large set efficiently", () => {
    const large = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      large.add(`tool-${i}`);
    }
    const result = getReadOnlyMemoryToolNames(large);
    expect(result).toEqual(["read"]);
  });

  it('handles a large set that includes "read"', () => {
    const large = new Set<string>();
    large.add("read");
    for (let i = 0; i < 999; i++) {
      large.add(`tool-${i}`);
    }
    const result = getReadOnlyMemoryToolNames(large);
    expect(result).toEqual([]);
  });

  it("returns a new array each call (no shared mutation risk)", () => {
    const setA = new Set<string>();
    const resultA = getReadOnlyMemoryToolNames(setA);
    const resultB = getReadOnlyMemoryToolNames(setA);

    // Same value, different reference
    expect(resultA).toEqual(resultB);
    expect(resultA).not.toBe(resultB);

    // Mutating the returned array doesn't affect subsequent calls
    resultA.push("extra");
    expect(getReadOnlyMemoryToolNames(setA)).toEqual(["read"]);
  });

  it("does not mutate the input set", () => {
    const tools = new Set(["write", "edit"]);
    const sizeBefore = tools.size;
    expect(tools.has("read")).toBe(false);
    getReadOnlyMemoryToolNames(tools);
    expect(tools.size).toBe(sizeBefore);
    expect(tools.has("read")).toBe(false);
    expect(tools.has("write")).toBe(true);
    expect(tools.has("edit")).toBe(true);
  });
});
