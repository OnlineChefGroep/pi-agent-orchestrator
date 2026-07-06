#!/usr/bin/env node
/**
 * check-complexity.mjs — Scans src/ for high-cyclomatic-complexity functions.
 *
 * Uses a heuristic approach: counts decision points (if, else if, for, while,
 * case, catch, &&, ||, ?, ??) per function declaration. Functions exceeding
 * the threshold are flagged with file, line, and score.
 *
 * Threshold: 15 (industry standard for "should refactor").
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const COMPLEXITY_THRESHOLD = 15;
const SRC_DIR = new URL("../src/", import.meta.url).pathname;

const DECISION_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\b/g,
  /\bfor\s*\(/g,
  /\bwhile\s*\(/g,
  /\bswitch\s*\(/g,
  /\bcase\b/g,
  /\bcatch\s*\(/g,
  /&&/g,
  /\|\|/g,
  /\?\?/g,
  /\?\.\[/g,
];

function isCommentLine(trimmed) {
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function countLineComplexity(line) {
  let complexity = 0;
  for (const pattern of DECISION_PATTERNS) {
    const matches = line.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }
  return complexity;
}

function processClosingBraces(line, braceDepthRef, funcStack) {
  let braceDepth = braceDepthRef.value;
  const completed = [];
  for (const ch of line) {
    if (ch === "{") braceDepth++;
    if (ch === "}") {
      braceDepth--;
      if (funcStack.length > 0 && braceDepth <= funcStack[funcStack.length - 1].braceDepth) {
        completed.push(funcStack.pop());
      }
    }
  }
  braceDepthRef.value = braceDepth;
  return completed;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations = [];

  // Track function boundaries and their complexity
  let funcStack = [];
  const braceDepthRef = { value: 0 };
  let _inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and strings heuristically
    if (isCommentLine(trimmed)) {
      continue;
    }

    // Detect function/method declarations
    const funcMatch = trimmed.match(
      /(?:export\s+)?(?:async\s+)?(?:function\s+|function\s*\*|get\s+|set\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
    );

    if (funcMatch) {
      funcStack.push({
        name: funcMatch[1] || "anonymous",
        line: i + 1,
        complexity: 1,
        braceDepth: braceDepthRef.value,
      });
      _inFunction = true;
    }

    // Count decision points in current function context
    if (funcStack.length > 0) {
      funcStack[funcStack.length - 1].complexity += countLineComplexity(line);
    }

    // Track braces
    const completed = processClosingBraces(line, braceDepthRef, funcStack);
    for (const c of completed) {
      if (c.complexity > COMPLEXITY_THRESHOLD) {
        violations.push({
          file: filePath,
          function: c.name,
          line: c.line,
          complexity: c.complexity,
        });
      }
    }
  }

  return violations;
}

function walkDir(dir, ext = ".ts") {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && entry !== "node_modules" && entry !== "dist") {
      results.push(...walkDir(fullPath, ext));
    } else if (extname(entry) === ext) {
      results.push(fullPath);
    }
  }
  return results;
}

// Main
const files = walkDir(SRC_DIR);
let allViolations = [];

for (const file of files) {
  allViolations.push(...scanFile(file));
}

if (allViolations.length === 0) {
  console.log(`complexity: OK — no functions exceed threshold ${COMPLEXITY_THRESHOLD}`);
  process.exit(0);
}

allViolations.sort((a, b) => b.complexity - a.complexity);
console.log(`complexity: ${allViolations.length} function(s) exceed threshold ${COMPLEXITY_THRESHOLD}:\n`);
for (const v of allViolations) {
  const relPath = v.file.replace(SRC_DIR, "src/");
  console.log(`  ${v.complexity}  ${relPath}:${v.line}  ${v.function}()`);
}
console.log("");
process.exit(1);
