/**
 * overdrive-lint.test.ts — Tests for the 3 overdrive linter detectors.
 *
 * Each detector is tested with positive cases (anti-pattern present) and
 * negative cases (anti-pattern absent or legitimate use). Tests use the
 * detector functions directly via dynamic import so the test does not
 * require the runner script.
 */

import { describe, expect, it } from "vitest";

describe("detect-filter-map-join", () => {
  it("flags .filter().map().join() chain", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const result = arr.filter(x => x.active).map(x => x.name).join("\\n");`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].rule).toBe("detect-filter-map-join");
    expect(findings[0].line).toBe(1);
  });

  it("flags .map().filter() chain", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const result = arr.map(x => x.name).filter(n => n.length > 0);`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag single .map() call", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const result = arr.map(x => x.name);`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });

  it("does NOT flag single .filter() call", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const result = arr.filter(x => x.active);`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });

  it("flags chains across multiple lines (known v1 limitation)", async () => {
    // v1 detector is line-based; multi-line chains are a known limitation.
    // The detector catches the canonical single-line `.filter().map().join()` pattern.
    // For multi-line chains, use an AST-based detector (future work).
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const filtered = arr
  .filter(x => x.active)
  .map(x => x.name);`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    // v1 limitation: multi-line chains are not detected
    expect(findings.length).toBe(0);
  });

  it("flags single-line chain (the canonical anti-pattern)", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `const result = arr.filter(x => x.active).map(x => x.name).join("\\n");`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag pure comments", async () => {
    const { detectFilterMapJoin } = await import("../scripts/overdrive/detect-filter-map-join.mjs");
    const src = `// arr.filter(x => x).map(x => x).join()\nconst x = 1;`;
    const findings = detectFilterMapJoin(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });
});

describe("detect-double-compute", () => {
  it("flags .trim() called twice on same identifier", async () => {
    const { detectDoubleCompute } = await import("../scripts/overdrive/detect-double-compute.mjs");
    const src = `if (text.trim()) {
  parts.push(\`[User]: \${text.trim()}\`);
}`;
    const findings = detectDoubleCompute(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].rule).toBe("detect-double-compute");
  });

  it("flags .toLowerCase() called twice", async () => {
    const { detectDoubleCompute } = await import("../scripts/overdrive/detect-double-compute.mjs");
    const src = `if (str.toLowerCase() === "x") {
  return str.toLowerCase();
}`;
    const findings = detectDoubleCompute(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag single .trim() call", async () => {
    const { detectDoubleCompute } = await import("../scripts/overdrive/detect-double-compute.mjs");
    const src = `const t = text.trim();
parts.push(t);`;
    const findings = detectDoubleCompute(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });

  it("does NOT flag .length property access", async () => {
    const { detectDoubleCompute } = await import("../scripts/overdrive/detect-double-compute.mjs");
    const src = `if (arr.length) {
  return arr.length;
}`;
    const findings = detectDoubleCompute(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });

  it("does NOT flag different methods on same identifier", async () => {
    const { detectDoubleCompute } = await import("../scripts/overdrive/detect-double-compute.mjs");
    const src = `const t = text.trim();
const l = text.toLowerCase();`;
    const findings = detectDoubleCompute(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });
});

describe("detect-shift-in-loop", () => {
  it("flags .shift() inside while loop", async () => {
    const { detectShiftInLoop } = await import("../scripts/overdrive/detect-shift-in-loop.mjs");
    const src = `const queue = [1, 2, 3];
while (queue.length > 0) {
  const item = queue.shift();
  process(item);
}`;
    const findings = detectShiftInLoop(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].rule).toBe("detect-shift-in-loop");
  });

  it("flags .shift() inside for loop", async () => {
    const { detectShiftInLoop } = await import("../scripts/overdrive/detect-shift-in-loop.mjs");
    const src = `const queue = [1, 2, 3];
for (let i = 0; i < 10; i++) {
  const item = queue.shift();
  process(item);
}`;
    const findings = detectShiftInLoop(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags .shift() inside for...of loop", async () => {
    const { detectShiftInLoop } = await import("../scripts/overdrive/detect-shift-in-loop.mjs");
    const src = `const queue = [1, 2, 3];
for (const item of queue) {
  process(item);
  queue.shift();
}`;
    const findings = detectShiftInLoop(src, { filePath: "test.ts" });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag .shift() outside a loop", async () => {
    const { detectShiftInLoop } = await import("../scripts/overdrive/detect-shift-in-loop.mjs");
    const src = `const queue = [1, 2, 3];
const first = queue.shift();
process(first);`;
    const findings = detectShiftInLoop(src, { filePath: "test.ts" });
    expect(findings.length).toBe(0);
  });

  it("does NOT flag .shift() in a function called from a loop", async () => {
    // The detector is conservative — it flags .shift() inside the lexical
    // scope of a loop. If the shift is in a separate function, the detector
    // correctly does not flag it (the function's caller should be reviewed).
    const { detectShiftInLoop } = await import("../scripts/overdrive/detect-shift-in-loop.mjs");
    const src = `function popOne() {
  return queue.shift();
}
while (queue.length > 0) {
  process(popOne());
}`;
    const findings = detectShiftInLoop(src, { filePath: "test.ts" });
    // The shift is in popOne, which is at module scope (not inside the while)
    // So the detector should NOT flag it
    expect(findings.length).toBe(0);
  });
});

describe("overdrive pattern catalogue", () => {
  it("documents all 8 patterns", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const content = readFileSync(resolve(__dirname, "../docs/overdrive-patterns.md"), "utf-8");
    const patterns = content.match(/^## P\d+ —/gm) ?? [];
    expect(patterns.length).toBe(8);
  });

  it("maps each detector to a pattern", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const content = readFileSync(resolve(__dirname, "../docs/overdrive-patterns.md"), "utf-8");
    expect(content).toContain("detect-filter-map-join");
    expect(content).toContain("detect-double-compute");
    expect(content).toContain("detect-shift-in-loop");
  });
});
