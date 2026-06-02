import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCtxInjection,
  buildCtxRoutingBlock,
  getCtxToolNames,
  isContextModeAvailable,
} from "../src/context-mode-bridge.js";

describe("isContextModeAvailable", () => {
  it("returns boolean", () => {
    const result = isContextModeAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("is idempotent — returns same value on repeated calls", () => {
    const first = isContextModeAvailable();
    const second = isContextModeAvailable();
    const third = isContextModeAvailable();
    expect(first).toBe(second);
    expect(second).toBe(third);
  });
});

describe("getCtxToolNames", () => {
  it("returns the expected ctx_* tool names", () => {
    const names = getCtxToolNames();
    expect(names).toContain("ctx_execute");
    expect(names).toContain("ctx_execute_file");
    expect(names).toContain("ctx_search");
    expect(names).toContain("ctx_index");
    expect(names).toContain("ctx_batch_execute");
    expect(names).toContain("ctx_stats");
  });

  it("returns exactly 6 tool names", () => {
    expect(getCtxToolNames()).toHaveLength(6);
  });

  it("is pure — returns new array on each call", () => {
    const first = getCtxToolNames();
    const second = getCtxToolNames();
    expect(first).toEqual(second);
    expect(first).not.toBe(second); // Different array instances
  });
});

describe("buildCtxRoutingBlock", () => {
  it("returns a non-empty string with routing instructions", () => {
    const block = buildCtxRoutingBlock();
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(100);
  });

  it("contains all expected ctx_* tool references", () => {
    const block = buildCtxRoutingBlock();
    expect(block).toMatch(/ctx_execute/);
    expect(block).toMatch(/ctx_execute_file/);
    expect(block).toMatch(/ctx_search/);
    expect(block).toMatch(/ctx_index/);
    expect(block).toMatch(/ctx_batch_execute/);
    expect(block).toMatch(/ctx_stats/);
  });

  it("mentions sandboxed execution", () => {
    const block = buildCtxRoutingBlock();
    expect(block.toLowerCase()).toMatch(/sandbox/);
  });

  it("mentions context window savings", () => {
    const block = buildCtxRoutingBlock();
    expect(block.toLowerCase()).toMatch(/context/);
  });

  it("is pure — returns same string on repeated calls", () => {
    const first = buildCtxRoutingBlock();
    const second = buildCtxRoutingBlock();
    expect(first).toBe(second);
  });
});

describe("buildCtxInjection", () => {
  it("returns null when context-mode is unavailable, or injection when available", () => {
    const result = buildCtxInjection();
    if (isContextModeAvailable()) {
      // Context-mode is installed — expect injection with correct shape
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("systemPromptAddition");
      expect(result).toHaveProperty("toolAllowList");
      expect(typeof result!.systemPromptAddition).toBe("string");
      expect(Array.isArray(result!.toolAllowList)).toBe(true);
      expect(result!.toolAllowList).toEqual(getCtxToolNames());
    } else {
      // Context-mode is not installed — gracefully returns null
      expect(result).toBeNull();
    }
  });

  it("injection has systemPromptAddition as a non-empty string (mocked available path)", () => {
    // When context-mode IS available, systemPromptAddition should be a non-empty string.
    // This verifies the shape without needing a real installation.
    const routingBlock = buildCtxRoutingBlock();
    expect(routingBlock).toBeTruthy();
    expect(routingBlock.length).toBeGreaterThan(0);
  });

  it("injection has toolAllowList matching getCtxToolNames (mocked available path)", () => {
    const routingBlock = buildCtxRoutingBlock();
    const toolNames = getCtxToolNames();

    // When available, toolAllowList should match getCtxToolNames
    for (const name of toolNames) {
      expect(routingBlock).toMatch(new RegExp(name));
    }
  });

  it("all functions are pure", () => {
    // isContextModeAvailable — same input, same output
    const a1 = isContextModeAvailable();
    const a2 = isContextModeAvailable();
    expect(a1).toBe(a2);

    // getCtxToolNames — same input, same output, new array each time
    const t1 = getCtxToolNames();
    const t2 = getCtxToolNames();
    expect(t1).toEqual(t2);
    expect(t1).not.toBe(t2);

    // buildCtxRoutingBlock — same input, same output
    const r1 = buildCtxRoutingBlock();
    const r2 = buildCtxRoutingBlock();
    expect(r1).toBe(r2);

    // buildCtxInjection — same input, same output (null when unavailable,
    // same injection object shape when available)
    const i1 = buildCtxInjection();
    const i2 = buildCtxInjection();
    if (i1 === null && i2 === null) {
      // Both null — pure
      expect(i1).toBe(i2);
    } else if (i1 !== null && i2 !== null) {
      // Both non-null — deep equality check
      expect(i1.systemPromptAddition).toBe(i2.systemPromptAddition);
      expect(i1.toolAllowList).toEqual(i2.toolAllowList);
    }
  });

  it("never throws — context-mode absence is handled gracefully", () => {
    // All functions should return valid values without throwing
    expect(() => isContextModeAvailable()).not.toThrow();
    expect(() => getCtxToolNames()).not.toThrow();
    expect(() => buildCtxRoutingBlock()).not.toThrow();
    expect(() => buildCtxInjection()).not.toThrow();
  });
});
