#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");
const publicRoot = path.join(webRoot, "public");
const assetsDir = path.join(publicRoot, "assets");
const wellKnownDir = path.join(publicRoot, ".well-known");

/** Copied before every dev/build; missing required files fail fast. */
const requiredAssets = [
  "dashboard_preview.mp4",
  "dashboard_preview.gif",
];

/** Showcase gallery — included when present (Remotion CI may generate these). */
const optionalAssets = [
  "dashboard_preview.png",
  "dashboard_preview_programmatic.gif",
  "product_film.mp4",
  "feature_tour.mp4",
  "architecture_overview.png",
  "promo_banner.png",
  "social_preview.png",
  "orchestrator_architecture.png",
  "orchestrator_banner.png",
  "showcase_dashboard.gif",
  "showcase_top_view.gif",
  "showcase_widget.gif",
  "showcase_tmux.mp4",
  "showcase_tmux.gif",
  "showcase_live.mp4",
  "showcase_live.gif",
  "showcase_vhs.mp4",
  "showcase_vhs.gif",
];

/** Public crawler and agent-discovery surfaces copied verbatim from repository SSOTs. */
const rootSiteFiles = [
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "llms-full.txt",
  "sitemap.md",
  "AGENTS.md",
  "agent-permissions.json",
];

rmSync(assetsDir, { recursive: true, force: true });
rmSync(path.join(publicRoot, "docs"), { recursive: true, force: true });
rmSync(wellKnownDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });
mkdirSync(wellKnownDir, { recursive: true });

function copyAsset(file, required) {
  const source = path.join(repoRoot, "docs/images", file);
  if (!existsSync(source)) {
    if (required) throw new Error(`Missing required showcase asset: ${source}`);
    return false;
  }
  cpSync(source, path.join(assetsDir, file));
  return true;
}

let requiredCount = 0;
for (const file of requiredAssets) {
  if (copyAsset(file, true)) requiredCount++;
}

let optionalCount = 0;
for (const file of optionalAssets) {
  if (copyAsset(file, false)) optionalCount++;
}

for (const file of rootSiteFiles) {
  const source = path.join(repoRoot, file);
  if (!existsSync(source)) throw new Error(`Missing site file: ${source}`);
  cpSync(source, path.join(publicRoot, file));
}

cpSync(
  path.join(repoRoot, "agent-permissions.json"),
  path.join(wellKnownDir, "agent-permissions.json"),
);

console.log(
  `Staged ${requiredCount} required + ${optionalCount} optional showcase assets, ${rootSiteFiles.length} discovery files, and the well-known permissions mirror into ${publicRoot}`,
);
