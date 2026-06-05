import { describe, expect, test } from "vitest";
import { buildValidatorPrompt } from "../src/validators.js";

/**
 * CVE-004 followup: sanitizeValidatorInput must reject non-string inputs
 * before performing O(N) iteration (Array.from / spread / replace).
 *
 * Without the typeof guard, an iterable with a large `length` triggers
 * tens of seconds of synchronous work inside Array.from (and the .replace
 * regex when input is array-like), causing a denial-of-service on the
 * Node.js event loop. See the original CVE-004 fix in commit 0a4171a2.
 *
 * The 1M-element timing test is the most important assertion: it would
 * block for many seconds if the guard were removed, and finishes in
 * well under a millisecond with the guard in place.
 */
describe("CVE-004 followup: sanitizeValidatorInput rejects non-string inputs", () => {
  // Generous upper bound to avoid flakiness on slow CI runners.
  // With the guard in place, the call returns in microseconds.
  const TIMING_BUDGET_MS = 200;

  describe("non-string inputs do not throw and are rejected at the boundary", () => {
    test.each<[string, unknown]>([
      ["null", null],
      ["undefined", undefined],
      ["number", 42],
      ["boolean", true],
      ["String wrapper object", Object("x")],
      ["empty array", []],
      ["plain object with length property", { length: 5, 0: "a", 1: "b" }],
      ["Map with 1000 entries", new Map(Array.from({ length: 1000 }, (_, i) => [i, "x"]))],
      ["Set with 1000 entries", new Set(Array.from({ length: 1000 }, () => "x"))],
    ])("returns a string prompt and does not throw on %s", (_label, badInput) => {
      let prompt: string | undefined;
      expect(() => {
        // @ts-expect-error — forcing a bad input type at the boundary
        prompt = buildValidatorPrompt(badInput, ["criterion"], "desc");
      }).not.toThrow();
      expect(typeof prompt).toBe("string");
      // Prompt structure is preserved; the bad input was replaced with an empty string.
      expect(prompt).toContain("Agent Output to Validate");
    });
  });

  test("rejects 1M-element iterable in under the timing budget (DoS guard)", () => {
    const big = Array.from({ length: 1_000_000 }, () => "a");
    const t0 = performance.now();
    // @ts-expect-error — forcing a bad input type at the boundary
    const prompt = buildValidatorPrompt(big, ["criterion"], "desc");
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(TIMING_BUDGET_MS);
    // Sanity: the bad input was replaced with '' so the prompt must NOT be
    // 1M+ chars long. The expected prompt is well under 2KB.
    expect(prompt.length).toBeLessThan(2_000);
  });

  test("rejects Proxy of a string-like iterable in under the timing budget", () => {
    // A Proxy of an array would normally trap property access; the typeof guard
    // short-circuits before iteration regardless of the trap behavior.
    const target = Array.from({ length: 1_000_000 }, () => "x");
    const proxied = new Proxy(target, {});
    const t0 = performance.now();
    // @ts-expect-error — forcing a bad input type at the boundary
    expect(() => buildValidatorPrompt(proxied, ["c"], "desc")).not.toThrow();
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(TIMING_BUDGET_MS);
  });

  test("regression: valid string input still sanitizes control characters", () => {
    const input = "hello\x00world\x07";
    const prompt = buildValidatorPrompt(input, ["criterion"], "desc");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).not.toContain("\x00");
    expect(prompt).not.toContain("\x07");
    expect(prompt).toContain("helloworld");
  });

  test("regression: empty string input produces a valid prompt", () => {
    const prompt = buildValidatorPrompt("", ["criterion"], "desc");
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("Validation Criteria");
    expect(prompt).toContain("criterion");
  });
});
