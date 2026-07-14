#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");
const publicRoot = path.join(webRoot, "public");
const assetsDir = path.join(publicRoot, "assets");
const docsDir = path.join(publicRoot, "docs");

const assetFiles = [
  "dashboard_preview.mp4",
  "dashboard_preview.gif",
];

const docFiles = [
  "README.md",
  "AGENTS.md",
  "llms.txt",
  "llms-full.txt",
  "architecture.md",
  "api-reference.md",
  "custom-agents.md",
  "troubleshooting.md",
  "PERFORMANCE.md",
  "HOWTO-perf.md",
  "overdrive-patterns.md",
  "repository.md",
];

rmSync(assetsDir, { recursive: true, force: true });
rmSync(docsDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });
mkdirSync(docsDir, { recursive: true });

for (const file of assetFiles) {
  const source = path.join(repoRoot, "docs/images", file);
  if (!existsSync(source)) {
    throw new Error(`Missing showcase asset: ${source}`);
  }
  cpSync(source, path.join(assetsDir, file));
}

for (const file of docFiles) {
  const fromDocs = path.join(repoRoot, "docs", file);
  const fromRoot = path.join(repoRoot, file);
  const source = existsSync(fromDocs) ? fromDocs : fromRoot;
  if (!existsSync(source)) {
    throw new Error(`Missing documentation file: ${file}`);
  }
  cpSync(source, path.join(docsDir, file));
}

console.log(`Staged ${assetFiles.length} assets and ${docFiles.length} docs into ${publicRoot}`);
