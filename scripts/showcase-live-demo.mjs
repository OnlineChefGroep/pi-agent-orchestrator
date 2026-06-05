#!/usr/bin/env node
/**
 * Live terminal playback of dashboard / top / widget (dist renderers).
 * Record with: asciinema rec -c "node scripts/showcase-live-demo.mjs --auto"
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const {
  getThemeColors,
  getBoxChars,
  framedRow,
  plainTheme,
  activeTheme,
} = await import(path.join(root, "dist/ui/theme.js"));
const {
  buildDashboardBodyLines,
  renderDashboardHeader,
  renderDashboardFooter,
  renderDashboardHelp,
} = await import(path.join(root, "dist/ui/dashboard/index.js"));
const {
  getAgentTopEntries,
  renderTopTable,
  sortEntries,
} = await import(path.join(root, "dist/ui/agent-top-renderer.js"));
const { renderAgentWidget } = await import(path.join(root, "dist/ui/agent-widget-renderer.js"));

const WIDTH = 110;
const HEIGHT = 32;
const CSI = "\x1b[";
const CLEAR = `${CSI}2J${CSI}H`;
const AUTO = process.argv.includes("--auto");

const th = getThemeColors();
const box = getBoxChars();
const widgetTheme = activeTheme(plainTheme());

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function mockAgents(frame) {
  const t = Date.now() - frame * 350;
  return [
    { id: "a1", type: "Explore", description: "Trace RPC + swarm health handlers", status: "running", swarmId: "swarm-alpha", joinMode: "swarm", toolUses: 14, startedAt: t - 50_000, spawnedAt: t - 50_000 },
    { id: "a2", type: "Explore", description: "Scan test/ coverage gaps", status: "running", swarmId: "swarm-alpha", joinMode: "swarm", toolUses: 9, startedAt: t - 35_000, spawnedAt: t - 35_000 },
    { id: "a3", type: "Plan", description: "v0.11.0 release checklist", status: "running", toolUses: 6, startedAt: t - 22_000, spawnedAt: t - 22_000 },
    { id: "a4", type: "general-purpose", description: "Virtual scroll + heatmap polish", status: "queued", toolUses: 0, startedAt: t, spawnedAt: t },
    { id: "a5", type: "Analysis", description: "Benchmark fastTruncate", status: "completed", toolUses: 22, startedAt: t - 100_000, completedAt: t - 12_000, spawnedAt: t - 100_000 },
    { id: "a6", type: "Plan", description: "Schedule bounds audit", status: "error", error: "rate limited", toolUses: 2, startedAt: t - 70_000, completedAt: t - 65_000, spawnedAt: t - 70_000 },
  ].map((a, i) => ({
    compactionCount: 0, currentLevel: 0, totalSpawned: 0,
    lifetimeUsage: { input: 5000 + i * 900, output: 1800 + i * 300, cacheWrite: 120 },
    ...a,
  }));
}

function mockActivity(agents, frame) {
  const map = new Map();
  const ts = Date.now();
  for (const a of agents) {
    if (a.status !== "running" && a.status !== "queued") continue;
    const tools = new Map();
    if (a.status === "running") {
      tools.set("read", "src/ui/agent-dashboard.ts");
      if (frame % 3 === 0) tools.set("grep", "renderTopTable");
    }
    map.set(a.id, {
      activeTools: tools,
      toolUses: a.toolUses,
      responseText: a.status === "running" ? "Streaming analysis…" : "",
      turnCount: a.status === "running" ? 4 + (frame % 5) : 0,
      maxTurns: 12,
      lifetimeUsage: a.lifetimeUsage,
      lastSeenMs: ts - (frame % 6) * 150,
    });
  }
  return map;
}

function state(agents, activity, frame, selectedIndex) {
  return { agents, selectedIndex, selectedIds: new Set(), frame, agentActivity: activity };
}

function padLines(lines) {
  const pad = s => {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    return plain.length >= WIDTH ? s : s + " ".repeat(WIDTH - plain.length);
  };
  const rows = lines.slice(0, HEIGHT - 1).map(pad);
  while (rows.length < HEIGHT - 1) rows.push(" ".repeat(WIDTH));
  return rows;
}

function renderList(frame, sel, hint) {
  const agents = mockAgents(frame);
  const activity = mockActivity(agents, frame);
  const st = state(agents, activity, frame, sel);
  const innerW = WIDTH - 4;
  const lines = renderDashboardHeader(WIDTH, th, box, st);
  const body = buildDashboardBodyLines(innerW, th, box, st);
  const vh = 16;
  for (const line of body.lines.slice(0, vh)) lines.push(framedRow(line, innerW, th, box));
  for (let i = Math.min(vh, body.lines.length); i < vh; i++) lines.push(framedRow("", innerW, th, box));
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity));
  if (hint) lines.push(framedRow(` ${th.dim}› ${hint}${th.reset}`, innerW, th, box));
  return padLines(lines);
}

function renderTop(frame, sortKey, hint) {
  const agents = mockAgents(frame);
  const activity = mockActivity(agents, frame);
  const st = state(agents, activity, frame, 0);
  const entries = sortEntries(getAgentTopEntries(agents, activity), sortKey, false);
  const lines = renderDashboardHeader(WIDTH, th, box, st);
  lines.push(...renderTopTable(entries, sortKey, false, 0, 10, th, WIDTH, "t: back to list"));
  const innerW = WIDTH - 4;
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity));
  if (hint) lines.push(framedRow(` ${th.dim}› ${hint}${th.reset}`, innerW, th, box));
  return padLines(lines);
}

function renderHelp(frame) {
  const agents = mockAgents(frame);
  const activity = mockActivity(agents, frame);
  const st = state(agents, activity, frame, 1);
  const innerW = WIDTH - 4;
  const lines = renderDashboardHeader(WIDTH, th, box, st);
  lines.push(...renderDashboardHelp(innerW, th, box));
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity));
  return padLines(lines);
}

function renderWidgetScreen(frame, hint) {
  const agents = mockAgents(frame).filter(a => a.status === "running" || a.status === "queued");
  const activity = mockActivity(mockAgents(frame), frame);
  const lines = renderAgentWidget({
    agents,
    agentActivity: activity,
    frame,
    shouldShowFinished: () => false,
    theme: widgetTheme,
    tui: { terminal: { columns: WIDTH } },
    pageIndex: 0,
    pageCount: 1,
  });
  if (hint) lines.push(`${CSI}2;${lines.length + 1}H${CSI}2m› ${hint}${CSI}0m`);
  return padLines(lines);
}

async function show(lines, ms = 400) {
  process.stdout.write(`${CLEAR + lines.join("\r\n")}\r\n`);
  if (AUTO) await sleep(ms);
}

async function runAuto() {
  process.stdout.write(CLEAR);
  await show(renderList(0, 0, "j/k navigate agents"), 900);
  for (let i = 1; i <= 4; i++) {
    await show(renderList(i, i, `j — select agent ${i + 1}`), 550);
  }
  await show(renderHelp(2), 1200);
  await show(renderList(4, 2, "t — switch to TOP view"), 700);
  await show(renderTop(5, "tokens", "t — sort by tokens (toggle asc)"), 1000);
  await show(renderTop(8, "lastSeen", "l — sort by last seen"), 1000);
  await show(renderList(10, 1, "t — back to dashboard list"), 800);
  await show(renderWidgetScreen(12, "widget heatmap — live agents above editor"), 1400);
  for (let f = 13; f < 18; f++) {
    await show(renderWidgetScreen(f, ""), 280);
  }
  await show(renderList(20, 3, "w — swarm topology · K kill · q quit"), 1200);
  process.stdout.write(`${CSI}0m`);
}

async function runInteractive() {
  console.log("Showcase live demo — press Ctrl+D to end recording");
  await runAuto();
}

if (!process.stdout.isTTY && !AUTO) {
  console.error("Use --auto for non-TTY capture");
  process.exit(1);
}

await (AUTO ? runAuto() : runInteractive());