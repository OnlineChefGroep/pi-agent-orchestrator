#!/usr/bin/env node
/**
 * overdrive-lint.mjs — Reusable linter runner for the 3 overdrive detectors.
 *
 * Runs the 3 detectors from `scripts/overdrive/` against the source tree and
 * reports findings as a unified table. The detectors are:
 *   - detect-filter-map-join  (P3)
 *   - detect-double-compute   (P4)
 *   - detect-shift-in-loop    (P5)
 *
 * Patterns P1, P2, P6, P7, P8 from `docs/overdrive-patterns.md` require
 * AST-level analysis and are NOT yet automated. They are tracked in the
 * pattern catalogue for manual review.
 *
 * Usage:
 *   node scripts/overdrive-lint.mjs                  # scan src/ recursively
 *   node scripts/overdrive-lint.mjs src/ test/       # scan specific dirs
 *   node scripts/overdrive-lint.mjs --rule=shift     # run only one rule
 *   node scripts/overdrive-lint.mjs --json           # JSON output
 *
 * Exit codes:
 *   0 — no findings (clean)
 *   1 — findings detected (with --strict)
 *   2 — error (no files found, invalid args)
 */

import { existsSync as fsExistsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectDoubleCompute } from "./overdrive/detect-double-compute.mjs";
import { detectFilterMapJoin } from "./overdrive/detect-filter-map-join.mjs";
import { detectShiftInLoop } from "./overdrive/detect-shift-in-loop.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RULES = {
  "filter-map-join": {
    label: "detect-filter-map-join",
    pattern: "P3",
    fn: detectFilterMapJoin,
  },
  "double-compute": {
    label: "detect-double-compute",
    pattern: "P4",
    fn: detectDoubleCompute,
  },
  "shift-in-loop": {
    label: "detect-shift-in-loop",
    pattern: "P5",
    fn: detectShiftInLoop,
  },
};

const SUPPORTED_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// --- Parse CLI args ---
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const strictMode = args.includes("--strict");
const onlyRule = args.find((a) => a.startsWith("--rule="))?.split("=")[1];
const targets = args.filter((a) => !a.startsWith("--")).map((p) => resolve(ROOT, p));
const scanRoots = targets.length > 0 ? targets : [resolve(ROOT, "src")];

const activeRules = onlyRule ? { [onlyRule]: RULES[onlyRule] } : RULES;

if (onlyRule && !activeRules[onlyRule]) {
  console.error(`Unknown rule: ${onlyRule}`);
  console.error(`Available rules: ${Object.keys(RULES).join(", ")}`);
  process.exit(2);
}

// --- Collect files ---
const filesToScan = [];
for (const root of scanRoots) {
  if (!fsExistsSync(root)) {
    console.error(`Path not found: ${root}`);
    process.exit(2);
  }
  collectFiles(root, filesToScan);
}

if (filesToScan.length === 0) {
  console.error("No source files found to scan.");
  process.exit(2);
}

// --- Run detectors ---
const allFindings = [];
for (const filePath of filesToScan) {
  const source = readFileSync(filePath, "utf-8");
  for (const rule of Object.values(activeRules)) {
    if (!rule) continue;
    allFindings.push(...rule.fn(source, { filePath }));
  }
}

// --- Report ---
if (jsonOutput) {
  console.log(JSON.stringify({ findings: allFindings, files: filesToScan.length }, null, 2));
  process.exit(allFindings.length > 0 && strictMode ? 1 : 0);
}

if (allFindings.length === 0) {
  console.log(`\n\x1b[32m✓\x1b[0m overdrive-lint: 0 findings across ${filesToScan.length} file(s)\n`);
  console.log(
    `  Rules: ${Object.keys(activeRules)
      .map((k) => activeRules[k].label)
      .join(", ")}`,
  );
  console.log(
    `  Patterns covered: ${Object.values(activeRules)
      .map((r) => r.pattern)
      .join(", ")}\n`,
  );
  process.exit(0);
}

const byFile = new Map();
for (const f of allFindings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log(`\n\x1b[1m═══ overdrive-lint: ${allFindings.length} finding(s) across ${byFile.size} file(s) ═══\x1b[0m\n`);

for (const [file, findings] of [...byFile.entries()].sort()) {
  const rel = file.replace(`${ROOT}/`, "");
  console.log(`\x1b[1m${rel}\x1b[0m`);
  for (const f of findings) {
    const patternMatch = Object.values(activeRules).find((r) => r.label === f.rule);
    const patternTag = patternMatch ? ` [${patternMatch.pattern}]` : "";
    console.log(`  \x1b[33m${f.line}:${f.column}\x1b[0m  \x1b[36m${f.rule}${patternTag}\x1b[0m`);
    console.log(`    ${f.message}`);
    console.log(`    \x1b[2m${f.snippet}\x1b[0m`);
  }
  console.log();
}

console.log(`\n\x1b[2mSee docs/overdrive-patterns.md for the full pattern catalogue.\x1b[0m\n`);
process.exit(strictMode ? 1 : 0);

// --- Helpers ---
function collectFiles(dir, out) {
  const stat = statSync(dir);
  if (stat.isFile()) {
    if (SUPPORTED_EXTS.has(extname(dir))) out.push(dir);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === ".git" ||
      entry === "coverage" ||
      entry.startsWith(".")
    ) {
      continue;
    }
    collectFiles(join(dir, entry), out);
  }
}
