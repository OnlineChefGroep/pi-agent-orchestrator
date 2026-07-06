#!/usr/bin/env node
/**
 * check-agents-md.mjs — Validates AGENTS.md stays consistent with code.
 *
 * Checks:
 * 1. All documented npm commands exist in package.json scripts
 * 2. All documented file paths actually exist
 * 3. All internal links are valid (no broken markdown references)
 *
 * Exit code: 0 if valid, 1 if issues found.
 */

import { existsSync, readFileSync } from "node:fs";

const _ROOT = new URL("../", import.meta.url).pathname;

// Load files
const agentsMd = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf-8");
const pkgRaw = readFileSync(new URL("../package.json", import.meta.url), "utf-8");
const pkg = JSON.parse(pkgRaw);
const scripts = pkg.scripts || {};

const failures = [];

// 1. Check documented npm commands exist in package.json
const commandChecks = [
  { script: "typecheck" },
  { script: "lint" },
  { script: "test" },
  { script: "lint:fix" },
  { script: "format" },
  { script: "build" },
];

for (const { script } of commandChecks) {
  if (!scripts[script]) {
    failures.push(`Command 'npm run ${script}' not found in package.json scripts`);
  }
  // Check AGENTS.md references the command (use script name or "npm run script" or "npm script")
  const variants = [`npm run ${script}`, `npm ${script}`, `\`${script}\``, `\`npm run ${script}\``];
  const found = variants.some((v) => agentsMd.includes(v));
  if (!found) {
    failures.push(`Command 'npm run ${script}' not referenced in AGENTS.md`);
  }
}

// 2. Check documented file paths exist
const fileRefs = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "tsconfig.json",
  "biome.json",
  "package.json",
  "package-lock.json",
  "vitest.config.ts",
  "SECURITY.md",
  "docs/architecture.md",
  "docs/custom-agents.md",
  "docs/runbooks.md",
  "docs/api-reference.md",
  ".github/CODEOWNERS",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/code-quality.yml",
  ".github/workflows/coverage.yml",
  ".github/workflows/alerts.yml",
  ".github/workflows/error-to-issue.yml",
  ".github/dependabot.yml",
  ".devcontainer/devcontainer.json",
  ".gitattributes",
  ".gitignore",
  "scripts/setup-git-hooks.sh",
  "src/index.ts",
  "src/logger.ts",
  "src/error-tracking.ts",
  "src/feature-flags.ts",
  "src/analytics.ts",
];

for (const ref of fileRefs) {
  if (!existsSync(new URL(`../${ref}`, import.meta.url))) {
    failures.push(`Referenced file missing: ${ref}`);
  }
}

// 3. Check markdown links within the repo are valid
const linkMatches = agentsMd.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
for (const m of linkMatches) {
  const link = m[2];
  // Only check relative internal links
  if (link.startsWith("http") || link.startsWith("#") || link.startsWith("mailto:")) continue;
  const target = new URL(`../${link}`, import.meta.url);
  if (!existsSync(target)) {
    failures.push(`Broken internal link in AGENTS.md: ${link}`);
  }
}

if (failures.length === 0) {
  console.log("agents-md: OK — AGENTS.md is consistent with codebase");
  process.exit(0);
}

console.error("agents-md: AGENTS.md validation failed:\n");
for (const f of failures) {
  console.error(`  - ${f}`);
}
console.error("");
process.exit(1);
