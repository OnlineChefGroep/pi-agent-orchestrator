#!/usr/bin/env node
import {spawn} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const output = path.join(root, "showcase/remotion/public/showcase.json");
const demo = path.join(root, "scripts/showcase-live-demo.mjs");
const clear = "\u001b[2J\u001b[H";
const start = performance.now();
const frames = [];
let current = "";
let currentStartedAt = 0;
let stderr = "";

const normalizeScreen = (value) => {
  const withoutTerminalControl = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u001b\](?:.|\n)*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[(?![0-9;]*m)[0-9;?]*[A-Za-z]/g, "")
    .replace(/\u001b\[[0-9]+;[0-9]+H/g, "")
    .replace(/\u001b\[H/g, "");

  const lines = withoutTerminalControl.split("\n");
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  return `${lines.slice(0, 32).join("\n")}\u001b[0m`;
};

const elapsed = () => Number(((performance.now() - start) / 1000).toFixed(3));

const commitCurrent = () => {
  const screen = normalizeScreen(current);
  if (screen.replace(/\u001b\[[0-9;]*m/g, "").trim()) {
    frames.push({t: currentStartedAt, screen});
  }
};

const consume = (chunk) => {
  const parts = chunk.split(clear);
  current += parts.shift() ?? "";
  for (const part of parts) {
    commitCurrent();
    current = part;
    currentStartedAt = elapsed();
  }
};

const child = spawn(process.execPath, [demo, "--auto"], {
  cwd: root,
  env: {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "3",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", consume);
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});

commitCurrent();

if (exitCode !== 0) {
  throw new Error(`showcase demo exited with ${exitCode}\n${stderr}`);
}
if (frames.length < 2) {
  throw new Error(`expected multiple terminal frames, captured ${frames.length}`);
}

let packageVersion = "unknown";
try {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  packageVersion = packageJson.version ?? "unknown";
} catch {
  // Metadata only; the capture remains valid without a package version.
}

const durationSeconds = Math.max(16, Number((frames.at(-1).t + 1.4).toFixed(3)));
const payload = {
  version: 1,
  cols: 110,
  rows: 32,
  durationSeconds,
  generatedAt: new Date().toISOString(),
  source: "scripts/showcase-live-demo.mjs --auto",
  packageVersion,
  frames,
};

await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Captured ${frames.length} terminal frames to ${path.relative(root, output)}`);
