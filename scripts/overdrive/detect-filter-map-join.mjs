/**
 * detect-filter-map-join.mjs — P3 detector from the overdrive pattern catalogue.
 *
 * Scans TypeScript/JavaScript source files for chained array method calls that
 * create multiple intermediate arrays in hot paths. Catches the canonical
 * `.filter().map().join()` anti-pattern and its variants.
 *
 * Chained array methods (in any order) that allocate an intermediate array:
 *   .filter().map()        — 2 array allocs
 *   .map().filter()        — 2 array allocs
 *   .filter().flatMap()    — 2 array allocs
 *   .map().flatMap()       — 2 array allocs
 *   .filter().map().join() — 3 array allocs
 *   .flatMap().filter()    — 2 array allocs
 *   .flatMap().map()       — 2 array allocs
 *
 * The detector is conservative: it flags chains of 2+ array-allocating methods
 * on the same expression. Single-method chains (just `.map(x => x)`) are NOT
 * flagged because the single allocation is acceptable.
 *
 * Usage:
 *   import { detectFilterMapJoin } from './detect-filter-map-join.mjs';
 *   const findings = detectFilterMapJoin(sourceText, { filePath: 'src/foo.ts' });
 */

const ALLOCATING_METHODS = new Set(["filter", "map", "flatMap", "flat", "slice", "concat", "toSorted"]);

const CHAIN_PATTERN = new RegExp(
  `\\.(${Array.from(ALLOCATING_METHODS).join("|")})\\s*\\(` +
    "[^()]*\\)" + // closing of first method call (no nested parens)
    `\\s*\\.(${Array.from(ALLOCATING_METHODS).join("|")})\\s*\\(`,
  "g",
);

/**
 * @param {string} source
 * @param {{ filePath?: string }} [opts]
 * @returns {Array<{ rule: string, file: string, line: number, column: number, snippet: string, message: string }>}
 */
export function detectFilterMapJoin(source, opts = {}) {
  const filePath = opts.filePath ?? "<input>";
  const findings = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip pure comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    for (const match of line.matchAll(CHAIN_PATTERN)) {
      const firstMethod = match[1];
      const secondMethod = match[2];
      const column = match.index + 1;

      findings.push({
        rule: "detect-filter-map-join",
        file: filePath,
        line: lineNum,
        column,
        snippet: line.trim().slice(0, 200),
        message:
          `Chained array methods .${firstMethod}().${secondMethod}() create ` +
          `intermediate arrays. Replace with a single-pass loop (push into ` +
          `a pre-allocated parts array). See overdrive pattern P3.`,
      });
    }
  }

  return findings;
}
