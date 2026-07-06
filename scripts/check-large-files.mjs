#!/usr/bin/env node
/**
 * check-large-files.mjs — Detects overly large source files.
 *
 * Flags any file in src/, test/, or scripts/ that exceeds the line or byte
 * threshold. Runs in CI as part of the code-quality workflow.
 *
 * Thresholds:
 *   - Source files (.ts): 1200 lines max
 *   - Script files (.mjs): 500 lines max
 *   - Any source file: 100KB max byte size
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const MAX_LINES = { ".ts": 1200, ".mjs": 500 };
const MAX_BYTES = 100 * 1024; // 100KB

const SCAN_DIRS = ["src", "test", "scripts"];
const IGNORE = ["node_modules", "dist", "graphify-out", "droid-wiki", "reports"];

function walkDir(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (IGNORE.includes(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push({ path: fullPath, size: stat.size });
    }
  }
  return results;
}

const files = SCAN_DIRS.flatMap((d) => walkDir(join(ROOT, d)));
const violations = [];

for (const file of files) {
  const ext = extname(file.path);
  const relPath = relative(ROOT, file.path);

  // Check byte size
  if (file.size > MAX_BYTES) {
    violations.push({
      file: relPath,
      metric: "bytes",
      value: file.size,
      threshold: MAX_BYTES,
    });
    continue; // Skip line count if already over byte limit
  }

  // Check line count (read file and count)
  const maxLines = MAX_LINES[ext];
  if (maxLines) {
    const content = readFileSync(file.path, "utf-8");
    const lines = content.split("\n").length;
    if (lines > maxLines) {
      violations.push({
        file: relPath,
        metric: "lines",
        value: lines,
        threshold: maxLines,
      });
    }
  }
}

if (violations.length === 0) {
  console.log("large-files: OK — all files within size limits");
  process.exit(0);
}

console.error(`large-files: ${violations.length} file(s) exceed thresholds:\n`);
for (const v of violations) {
  if (v.metric === "bytes") {
    console.error(`  ${(v.value / 1024).toFixed(1)}KB  ${v.file}  (max: ${v.threshold / 1024}KB)`);
  } else {
    console.error(`  ${v.value} lines  ${v.file}  (max: ${v.threshold} lines)`);
  }
}
console.error("");
process.exit(1);
