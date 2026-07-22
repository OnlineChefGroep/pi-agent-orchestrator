#!/usr/bin/env node
/**
 * Cheap freshness/schema gate for committed terminal capture data.
 * Full regeneration: `node scripts/capture-terminal.mjs` (requires root `npm run build`).
 */
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const showcasePath = path.join(root, "showcase/remotion/public/showcase.json");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expectedVersion = packageJson.version;
const data = JSON.parse(await readFile(showcasePath, "utf8"));

const failures = [];
const requireField = (key, predicate, message) => {
  if (!predicate(data[key])) failures.push(message ?? `invalid ${key}`);
};

requireField("version", (v) => v === 1, "version must be 1");
requireField("cols", (v) => v === 140, "cols must be 140");
requireField("rows", (v) => v === 36, "rows must be 36");
requireField(
  "source",
  (v) => v === "scripts/showcase-live-demo.mjs --auto",
  "source must point at showcase-live-demo.mjs --auto",
);
requireField(
  "packageVersion",
  (v) => v === expectedVersion,
  `packageVersion must match package.json (${expectedVersion}); got ${data.packageVersion}`,
);
requireField(
  "durationSeconds",
  (v) => typeof v === "number" && v >= 28 && v <= 50,
  `durationSeconds must cover the live-demo tour (28–50); got ${data.durationSeconds}`,
);
requireField(
  "generatedAt",
  (v) => typeof v === "string" && v.length > 0 && v !== "fallback",
  "generatedAt must be a real capture timestamp (not the fallback sentinel)",
);
requireField(
  "frames",
  (v) => Array.isArray(v) && v.length >= 18,
  `frames must include the expanded tour (>=18); got ${data.frames?.length ?? 0}`,
);

if (Array.isArray(data.frames)) {
  const screens = data.frames.map((frame) => frame?.screen ?? "").join("\n");
  if (screens.includes("Release checklist")) {
    failures.push('stale frame text still contains "Release checklist"');
  }
  if (!screens.includes(`v${expectedVersion}`)) {
    failures.push(`frames must mention package version v${expectedVersion}`);
  }
  let previousT = -1;
  for (const [index, frame] of data.frames.entries()) {
    if (typeof frame?.t !== "number" || typeof frame?.screen !== "string" || !frame.screen.trim()) {
      failures.push(`frames[${index}] must have numeric t and non-empty screen`);
      break;
    }
    if (frame.t < previousT) {
      failures.push("frame timestamps must be non-decreasing");
      break;
    }
    previousT = frame.t;
  }
}

if (failures.length > 0) {
  console.error("showcase.json freshness/schema check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("Regenerate with: npm run build && node showcase/remotion/scripts/capture-terminal.mjs");
  process.exit(1);
}

console.log(
  `showcase.json is current (${data.frames.length} frames, ${data.durationSeconds}s, v${data.packageVersion})`,
);
