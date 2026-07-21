/**
 * render-screenshots.mjs — Generate real terminal screenshots for the docs.
 *
 * This drives the extension's ACTUAL dashboard renderers (compiled to dist/)
 * with a realistic, deterministic agent session, captures the true ANSI output,
 * and rasterizes it to a self-contained SVG. No mockups, no hand-drawing — the
 * pixels come from the same code that renders the live `/agents` dashboard.
 *
 * Usage:  npm run screenshots         (runs `npm run build` first)
 *         node scripts/render-screenshots.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { registerAgents } from "../dist/agent-types.js";
import {
  buildDashboardBodyLines,
  renderDashboardDetailPanel,
  renderDashboardFooter,
  renderDashboardHeader,
} from "../dist/ui/agent-dashboard-renderer.js";
import { getBoxChars, getThemeColors } from "../dist/ui/theme.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WIDTH = 92; // terminal columns

// Load the built-in agent configs so getDisplayName() resolves real names.
registerAgents(new Map());

// ---- Deterministic fixtures ---------------------------------------------

const zeroUsage = () => ({ input: 0, output: 0, cacheWrite: 0 });

const session = (input, output, cacheWrite, percent) => ({
  getSessionStats: () => ({ tokens: { input, output, cacheWrite }, contextUsage: { percent } }),
});

// Durations are computed against the real wall clock for running agents
// (formatDuration uses Date.now()), so anchor fixtures to now.
const NOW = Date.now();
const ago = (ms) => NOW - ms;

const activity = (tool, target, responseText, turnCount, maxTurns, usage, sess) => ({
  activeTools: new Map(tool ? [[tool, target]] : []),
  toolUses: 0,
  responseText,
  session: sess,
  turnCount,
  maxTurns,
  lifetimeUsage: usage,
});

const agents = [
  {
    id: "a-explore",
    type: "Explore",
    description: "map the auth + session subsystem",
    status: "running",
    toolUses: 14,
    spawnedAt: ago(42_000),
    startedAt: ago(41_000),
    lifetimeUsage: { input: 38_200, output: 6_400, cacheWrite: 12_100 },
    compactionCount: 0,
    currentLevel: 1,
    totalSpawned: 0,
    swarmId: "swarm-7f3",
    joinMode: "swarm",
  },
  {
    id: "a-plan",
    type: "Plan",
    description: "design the token-refresh migration",
    status: "running",
    toolUses: 9,
    spawnedAt: ago(41_000),
    startedAt: ago(40_000),
    lifetimeUsage: { input: 51_900, output: 9_800, cacheWrite: 20_400 },
    compactionCount: 1,
    currentLevel: 1,
    totalSpawned: 0,
    swarmId: "swarm-7f3",
    joinMode: "swarm",
  },
  {
    id: "a-gp",
    type: "general-purpose",
    description: "implement refresh-token rotation in src/auth.ts",
    status: "running",
    toolUses: 23,
    spawnedAt: ago(88_000),
    startedAt: ago(86_000),
    lifetimeUsage: { input: 96_500, output: 18_300, cacheWrite: 41_200 },
    compactionCount: 2,
    currentLevel: 0,
    totalSpawned: 2,
  },
  {
    id: "a-analysis",
    type: "Analysis",
    description: "profile the slow login query",
    status: "queued",
    toolUses: 0,
    spawnedAt: ago(5_000),
    startedAt: ago(5_000),
    lifetimeUsage: zeroUsage(),
    compactionCount: 0,
    currentLevel: 1,
    totalSpawned: 0,
  },
  {
    id: "a-done",
    type: "Explore",
    description: "inventory existing test coverage",
    status: "completed",
    result: "Found 46 test files, 795 cases. Gaps: token rotation, swarm join races.",
    toolUses: 31,
    spawnedAt: ago(240_000),
    startedAt: ago(238_000),
    completedAt: ago(120_000),
    lifetimeUsage: { input: 120_000, output: 22_000, cacheWrite: 60_000 },
    compactionCount: 1,
    currentLevel: 1,
    totalSpawned: 0,
    validationResults: [{ agentId: "v", passed: true, criteria: [], summary: "ok" }],
    validated: true,
  },
  {
    id: "a-steered",
    type: "Plan",
    description: "draft the rollout checklist",
    status: "steered",
    result: "Wrapped up at the turn limit with a partial checklist.",
    toolUses: 12,
    spawnedAt: ago(200_000),
    startedAt: ago(198_000),
    completedAt: ago(150_000),
    lifetimeUsage: { input: 80_000, output: 15_000, cacheWrite: 30_000 },
    compactionCount: 0,
    currentLevel: 1,
    totalSpawned: 0,
  },
];

const agentActivity = new Map([
  ["a-explore", activity("call-1", "grep", "tracing the middleware chain", 6, 20, agents[0].lifetimeUsage, session(38_200, 6_400, 12_100, 31))],
  ["a-plan", activity("call-2", "read", "comparing rotation strategies", 9, 20, agents[1].lifetimeUsage, session(51_900, 9_800, 20_400, 47))],
  ["a-gp", activity("call-3", "edit", "wiring the rotation guard", 14, 40, agents[2].lifetimeUsage, session(96_500, 18_300, 41_200, 68))],
]);

const state = {
  agents,
  selectedIndex: 2, // the general-purpose running card
  selectedIds: new Set(["a-gp"]),
  frame: 2,
  agentActivity,
};

// ---- ANSI helpers --------------------------------------------------------

const ANSI_PATTERN = "\\x1b\\[([0-9;]*)m";

function stripAnsi(s) {
  return s.replace(new RegExp(ANSI_PATTERN, "g"), "");
}

function visibleWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue; // variation selector
    w += 1;
  }
  return w;
}

function padToInner(line, w) {
  const vis = visibleWidth(line);
  return vis >= w ? line : line + " ".repeat(w - vis);
}

// ---- Compose the full dashboard frame ------------------------------------

const th = getThemeColors();
const box = getBoxChars();
const innerW = Math.max(1, WIDTH - 4);

const body = buildDashboardBodyLines(innerW, th, box, state);
const lines = [
  ...renderDashboardHeader(WIDTH, th, box, state),
  ...body.lines.map((l) => (l === "" ? "" : `${th.border}${box.l}${th.reset} ${padToInner(l, innerW)} ${th.border}${box.r}${th.reset}`)),
  ...renderDashboardDetailPanel(WIDTH, th, box, state),
  ...renderDashboardFooter(WIDTH, th, box),
];

// ---- ANSI → SVG ----------------------------------------------------------

const PREMIUM = {
  default: "#d6d8e0",
  border: "#ff6464",
  title: "#dcdcdc",
  muted: "#a0a0aa",
  highlight: "#ffc864",
  accent: "#78b4ff",
  success: "#50dc8c",
  error: "#ff6478",
};

// Translate the SGR sequences this codebase emits into a style.
function applySgr(style, params) {
  const codes = params.split(";").map((n) => (n === "" ? 0 : Number(n)));
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) { style.color = PREMIUM.default; style.bold = false; style.dim = false; }
    else if (c === 1) style.bold = true;
    else if (c === 2) style.dim = true;
    else if (c === 22) { style.bold = false; style.dim = false; }
    else if (c === 31) style.color = PREMIUM.error;
    else if (c === 32) style.color = PREMIUM.success;
    else if (c === 33) style.color = PREMIUM.highlight;
    else if (c === 36) style.color = PREMIUM.accent;
    else if (c === 37) style.color = PREMIUM.muted;
    else if (c === 38 && codes[i + 1] === 2) {
      style.color = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
      i += 4;
    } else if (c === 39) style.color = PREMIUM.default;
  }
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lineToSpans(line, charW) {
  const spans = [];
  let col = 0;
  const style = { color: PREMIUM.default, bold: false, dim: false };
  let last = 0;
  const re = new RegExp(ANSI_PATTERN, "g");
  let m = re.exec(line);
  const flush = (text) => {
    if (!text) return;
    spans.push({ text, x: col * charW, color: style.color, bold: style.bold, dim: style.dim });
    col += visibleWidth(text);
  };
  while (m !== null) {
    flush(line.slice(last, m.index));
    applySgr(style, m[1]);
    last = re.lastIndex;
    m = re.exec(line);
  }
  flush(line.slice(last));
  return spans;
}

function toSvg(rows) {
  const fontSize = 15;
  const charW = fontSize * 0.6;
  const lineH = fontSize * 1.4;
  const padX = 18;
  const padTop = 44; // room for the title bar
  const padBottom = 16;
  const cols = Math.max(...rows.map(visibleWidth));
  const w = Math.ceil(padX * 2 + cols * charW);
  const h = Math.ceil(padTop + rows.length * lineH + padBottom);
  const font = "ui-monospace, 'SF Mono', 'Cascadia Code', 'Menlo', 'Consolas', monospace";

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${font}" font-size="${fontSize}px">`);
  out.push(`<rect width="${w}" height="${h}" rx="10" fill="#0d0d12"/>`);
  out.push(`<rect width="${w}" height="30" rx="10" fill="#17171f"/><rect y="20" width="${w}" height="10" fill="#17171f"/>`);
  out.push(`<circle cx="18" cy="15" r="5" fill="#ff5f57"/><circle cx="36" cy="15" r="5" fill="#febc2e"/><circle cx="54" cy="15" r="5" fill="#28c840"/>`);
  out.push(`<text x="${w / 2}" y="19" fill="#8a8a96" text-anchor="middle" font-size="12px">/agents — pi-agent-orchestrator</text>`);

  rows.forEach((line, i) => {
    const y = (padTop + i * lineH + fontSize).toFixed(1);
    for (const s of lineToSpans(line, charW)) {
      const text = escapeXml(s.text);
      if (!text.trim() && s.color === PREMIUM.default) continue;
      const weight = s.bold ? ' font-weight="700"' : "";
      const opacity = s.dim ? ' opacity="0.55"' : "";
      out.push(`<text x="${(padX + s.x).toFixed(1)}" y="${y}" fill="${s.color}"${weight}${opacity} xml:space="preserve">${text}</text>`);
    }
  });
  out.push("</svg>");
  return out.join("\n");
}

const svg = toSvg(lines);
// Output path is overridable so Cloud artifact generation can render the real
// dashboard without overwriting the tracked docs/images/dashboard_preview.svg.
// `resolve` handles absolute paths on every platform (Linux, macOS, Windows)
// and falls back to joining against REPO_ROOT for relative paths.
const outPath = process.env.SCREENSHOT_OUT
  ? resolve(REPO_ROOT, process.env.SCREENSHOT_OUT)
  : join(REPO_ROOT, "docs", "images", "dashboard_preview.svg");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${svg}\n`, "utf-8");

process.stdout.write(`Wrote ${outPath} (${lines.length} rows, ${visibleWidth(lines[0])} cols)\n`);
