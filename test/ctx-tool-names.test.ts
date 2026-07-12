import { describe, expect, it } from "vitest";
import { CTX_TOOL_NAMES } from "../src/ctx-tool-names.js";

describe("CTX_TOOL_NAMES", () => {
  it("is a non-empty list of ctx_* tool names", () => {
    expect(Array.isArray(CTX_TOOL_NAMES)).toBe(true);
    expect(CTX_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of CTX_TOOL_NAMES) {
      expect(name.startsWith("ctx_")).toBe(true);
    }
  });

  it("contains the expected canonical sandbox tool names", () => {
    expect(CTX_TOOL_NAMES).toContain("ctx_execute");
    expect(CTX_TOOL_NAMES).toContain("ctx_execute_file");
    expect(CTX_TOOL_NAMES).toContain("ctx_search");
    expect(CTX_TOOL_NAMES).toContain("ctx_index");
    expect(CTX_TOOL_NAMES).toContain("ctx_batch_execute");
    expect(CTX_TOOL_NAMES).toContain("ctx_stats");
  });

  it("has no duplicate entries", () => {
    const seen = new Set<string>();
    for (const name of CTX_TOOL_NAMES) {
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });

  it("matches the exact canonical ctx_* list in order (single source of truth)", () => {
    // Locks the SSOT: catches accidental additions, removals, or reordering
    // of the sandbox tool list, which the presence-only `toContain` checks miss.
    expect([...CTX_TOOL_NAMES]).toEqual([
      "ctx_execute",
      "ctx_execute_file",
      "ctx_search",
      "ctx_index",
      "ctx_batch_execute",
      "ctx_stats",
    ]);
  });
});
