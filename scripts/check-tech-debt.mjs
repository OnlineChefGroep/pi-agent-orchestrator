#!/usr/bin/env node
/**
 * check-tech-debt.mjs — Scans for TODO/FIXME/HACK/XXX markers in source code.
 *
 * Reports all technical debt markers found in src/ and scripts/, categorized
 * by type. Exits with code 1 if any unlinked TODOs are found (TODO without
 * an issue reference like TODO(CHEF-123) or TODO(#123)).
 *
 * Categories:
 *   - TODO:  Planned work, should link to an issue
 *   - FIXME: Known bugs that need fixing
 *   - HACK:  Workarounds that should be cleaned up
 *   - XXX:   Warning/danger markers
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const SCAN_DIRS = ["src", "scripts"];
const SCAN_EXTS = [".ts", ".mjs"];
const IGNORE = ["node_modules", "dist", "graphify-out", "droid-wiki", "check-tech-debt.mjs"];

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b(?:\s*\(([^)]+)\))?\s*:?\s*(.*)/g;

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
    } else if (SCAN_EXTS.includes(extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = SCAN_DIRS.flatMap((d) => walkDir(join(ROOT, d)));
const markers = [];
const unlinked = [];

for (const filePath of files) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    MARKER_RE.lastIndex = 0;
    let match = MARKER_RE.exec(lines[i]);
    while (match !== null) {
      const [, type, issueRef, description] = match;
      const relPath = relative(ROOT, filePath);
      const entry = {
        type,
        file: relPath,
        line: i + 1,
        issue: issueRef || null,
        description: description.trim(),
      };
      markers.push(entry);

      // TODOs and FIXMEs should link to an issue
      if ((type === "TODO" || type === "FIXME") && !issueRef) {
        unlinked.push(entry);
      }
      match = MARKER_RE.exec(lines[i]);
    }
  }
}

// Summary report
if (markers.length > 0) {
  const byType = {};
  for (const m of markers) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }
  console.log("tech-debt: Technical debt markers found:\n");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log("");

  for (const m of markers) {
    const issue = m.issue ? `[${m.issue}]` : "[unlinked]";
    console.log(`  ${m.type} ${issue} ${m.file}:${m.line} — ${m.description}`);
  }
  console.log(`\nTotal: ${markers.length} marker(s), ${unlinked.length} unlinked`);
}

if (unlinked.length > 0) {
  console.error(`\ntech-debt: ${unlinked.length} TODO/FIXME marker(s) without issue reference.`);
  console.error("Link markers to issues: TODO(CHEF-123) or TODO(#123)\n");
  process.exit(1);
}

if (markers.length === 0) {
  console.log("tech-debt: OK — no TODO/FIXME markers found");
}
process.exit(0);
