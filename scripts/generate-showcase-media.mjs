#!/usr/bin/env node
/**
 * Generate asciicast recordings from real dashboard / top-view / widget renderers.
 * Output: $TMPDIR/showcase-*.cast — convert with agg + ffmpeg (see create_showcase.sh).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
).version

// Use the platform temp directory instead of hardcoding /tmp (works on Windows
// and macOS sandbox where /tmp may not be writable).
const TMP_DIR = process.env.TMPDIR
  ? process.env.TMPDIR.replace(/\/$/, '')
  : os.tmpdir()

// Fail fast with a clear message if build artifacts are missing. Without this
// the dynamic import errors look like cryptic "Cannot find module" stack traces.
const distTheme = path.join(root, 'dist/ui/theme.js')
if (!fs.existsSync(distTheme)) {
  console.error(
    `Error: build artifacts not found at ${distTheme}.\n` +
      'Run \'npm run build\' first, then re-run this script.'
  )
  process.exit(1)
}

let getThemeColors, getBoxChars, framedRow, plainTheme
let buildDashboardBodyLines, renderDashboardHeader, renderDashboardFooter, renderDashboardHelp
let getAgentTopEntries, renderTopTable, sortEntries
let renderAgentWidget, activeTheme
try {
  ({
    getThemeColors,
    getBoxChars,
    framedRow,
    plainTheme
  } = await import(path.join(root, 'dist/ui/theme.js')));
  ({
    buildDashboardBodyLines,
    renderDashboardHeader,
    renderDashboardFooter,
    renderDashboardHelp
  } = await import(path.join(root, 'dist/ui/dashboard/index.js')));
  ({
    getAgentTopEntries,
    renderTopTable,
    sortEntries
  } = await import(path.join(root, 'dist/ui/agent-top-renderer.js')));
  ({ renderAgentWidget } = await import(path.join(root, 'dist/ui/agent-widget-renderer.js')));
  ({ activeTheme } = await import(path.join(root, 'dist/ui/theme.js')))
} catch (err) {
  console.error(
    'Error: failed to import dist/ui/* renderers.\n' +
      'Run \'npm run build\' first, then re-run this script.\n' +
      `Underlying error: ${err.message}`
  )
  process.exit(1)
}

const WIDTH = 110
const HEIGHT = 34
const CSI = '\u001b['
const CLEAR = `${CSI}2J${CSI}H`

const th = getThemeColors()
const box = getBoxChars()
const widgetTheme = activeTheme(plainTheme())

function now () {
  return Date.now()
}

function mockAgents (frame) {
  const t = now() - frame * 400
  const base = [
    { id: 'agent-explore-1', type: 'Explore', description: 'Map src/ and trace RPC handlers', status: 'running', swarmId: 'swarm-alpha', joinMode: 'swarm', toolUses: 12 + (frame % 3), startedAt: t - 45_000, spawnedAt: t - 45_000 },
    { id: 'agent-explore-2', type: 'Explore', description: 'Scan test/ for coverage gaps', status: 'running', swarmId: 'swarm-alpha', joinMode: 'swarm', toolUses: 8, startedAt: t - 30_000, spawnedAt: t - 30_000 },
    { id: 'agent-plan-1', type: 'Plan', description: `Verify v${packageVersion} release artifact`, status: 'running', toolUses: 5 + (frame % 2), startedAt: t - 20_000, spawnedAt: t - 20_000 },
    { id: 'agent-gp-1', type: 'general-purpose', description: 'Implement virtual scroll hints', status: 'queued', toolUses: 0, startedAt: t, spawnedAt: t },
    { id: 'agent-gp-2', type: 'general-purpose', description: 'Wire swarmHealth RPC audit', status: 'queued', toolUses: 0, startedAt: t, spawnedAt: t },
    { id: 'agent-analysis-1', type: 'Analysis', description: 'Benchmark fastTruncate paths', status: 'completed', toolUses: 24, startedAt: t - 120_000, completedAt: t - 15_000, spawnedAt: t - 120_000 },
    { id: 'agent-explore-3', type: 'Explore', description: 'Profile dashboard render loop', status: 'completed', toolUses: 18, startedAt: t - 90_000, completedAt: t - 40_000, spawnedAt: t - 90_000 },
    { id: 'agent-plan-2', type: 'Plan', description: 'Security audit schedule bounds', status: 'error', error: 'rate limited', toolUses: 2, startedAt: t - 60_000, completedAt: t - 55_000, spawnedAt: t - 60_000 }
  ]
  return base.map((a, i) => ({
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
    lifetimeUsage: { input: 4000 + i * 800, output: 1200 + i * 200, cacheWrite: 100 },
    ...a
  }))
}

function mockActivity (agents, frame) {
  const map = new Map()
  const ts = now()
  for (const a of agents) {
    if (a.status !== 'running' && a.status !== 'queued') continue
    const tools = new Map()
    if (a.status === 'running') {
      tools.set('read', 'src/ui/agent-dashboard.ts')
      if (frame % 2 === 0) tools.set('grep', 'renderTopTable')
    }
    map.set(a.id, {
      activeTools: tools,
      toolUses: a.toolUses,
      responseText: a.status === 'running' ? 'Analyzing module graph…' : '',
      turnCount: a.status === 'running' ? 3 + (frame % 4) : 0,
      maxTurns: 12,
      lifetimeUsage: a.lifetimeUsage,
      lastSeenMs: ts - (frame % 5) * 200
    })
  }
  return map
}

function dashboardState (agents, activity, frame, selectedIndex) {
  return {
    agents,
    selectedIndex,
    selectedIds: new Set(),
    frame,
    agentActivity: activity
  }
}

function renderDashboardList (frame, selectedIndex) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const state = dashboardState(agents, activity, frame, selectedIndex)
  const safeWidth = WIDTH
  const innerW = Math.max(1, safeWidth - 4)
  const vh = 18

  const lines = renderDashboardHeader(safeWidth, th, box, state)
  const body = buildDashboardBodyLines(innerW, th, box, state)
  const start = 0
  const visible = body.lines.slice(start, start + vh)
  for (const line of visible) lines.push(framedRow(line, innerW, th, box))
  for (let i = visible.length; i < vh; i++) lines.push(framedRow('', innerW, th, box))
  lines.push(...renderDashboardFooter(safeWidth, th, box, activity))
  return lines
}

function renderDashboardTop (frame, sortKey, sortAsc, page) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const state = dashboardState(agents, activity, frame, 0)
  const safeWidth = WIDTH
  const entries = sortEntries(getAgentTopEntries(agents, activity), sortKey, sortAsc)
  const pageSize = 10

  const lines = renderDashboardHeader(safeWidth, th, box, state)
  lines.push(...renderTopTable(entries, sortKey, sortAsc, page, pageSize, th, safeWidth, 't: back to list'))
  const innerW = Math.max(1, safeWidth - 4)
  for (let i = lines.length; i < 22; i++) lines.push(framedRow('', innerW, th, box))
  lines.push(...renderDashboardFooter(safeWidth, th, box, activity))
  return lines
}

function renderWidget (frame) {
  const agents = mockAgents(frame).filter(a => a.status === 'running' || a.status === 'queued')
  const activity = mockActivity(mockAgents(frame), frame)
  const tui = { terminal: { columns: WIDTH } }
  return renderAgentWidget({
    agents,
    agentActivity: activity,
    frame,
    shouldShowFinished: () => false,
    theme: widgetTheme,
    tui,
    pageIndex: 0,
    pageCount: 1
  })
}

function screenToOutput (lines) {
  const pad = (s) => {
    // eslint-disable-next-line no-control-regex
    const plain = s.replace(/\u001b\[[0-9;]*m/g, '')
    if (plain.length >= WIDTH) return s
    return s + ' '.repeat(WIDTH - plain.length)
  }
  const rows = lines.slice(0, HEIGHT).map(pad)
  while (rows.length < HEIGHT) rows.push(' '.repeat(WIDTH))
  return `${CLEAR + rows.join('\r\n')}\r\n`
}

function writeCast (outPath, frameSpecs) {
  const header = {
    version: 2,
    width: WIDTH,
    height: HEIGHT,
    timestamp: Math.floor(Date.now() / 1000),
    env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', SHELL: '/bin/bash' }
  }
  const lines = [JSON.stringify(header)]
  let t = 0
  for (const spec of frameSpecs) {
    t += spec.dt
    lines.push(JSON.stringify([t, 'o', screenToOutput(spec.lines)]))
    if (spec.cursor) {
      lines.push(JSON.stringify([t + 0.01, 'o', spec.cursor]))
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`)
  console.log(`Wrote ${outPath} (${frameSpecs.length} frames)`)
}

function renderDashboardHelpScreen (frame) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const state = dashboardState(agents, activity, frame, 1)
  const safeWidth = WIDTH
  const innerW = Math.max(1, safeWidth - 4)
  const lines = renderDashboardHeader(safeWidth, th, box, state)
  lines.push(...renderDashboardHelp(innerW, th, box))
  lines.push(...renderDashboardFooter(safeWidth, th, box, activity))
  return lines
}

// ── Dashboard list: selection moves, spinners animate, help overlay ──
{
  const specs = []
  for (let f = 0; f < 32; f++) {
    const sel = f % 6
    specs.push({
      dt: f === 0 ? 0.35 : 0.2,
      lines: renderDashboardList(f, sel),
      cursor: `${CSI}${4 + sel * 3};3H`
    })
  }
  specs.push({ dt: 0.6, lines: renderDashboardHelpScreen(8) })
  for (let f = 32; f < 36; f++) {
    specs.push({ dt: 0.2, lines: renderDashboardList(f, f % 4) })
  }
  writeCast(path.join(TMP_DIR, 'showcase-dashboard.cast'), specs)
}

// ── Top view: sort by tokens → last seen, page flip ──
{
  const specs = []
  for (let f = 0; f < 10; f++) {
    specs.push({ dt: f === 0 ? 0.45 : 0.32, lines: renderDashboardTop(f, 'tokens', false, 0) })
  }
  for (let f = 0; f < 10; f++) {
    specs.push({ dt: 0.32, lines: renderDashboardTop(f, 'lastSeen', false, 0) })
  }
  for (let f = 0; f < 4; f++) {
    specs.push({ dt: 0.35, lines: renderDashboardTop(f, 'toolUses', false, 0) })
  }
  specs.push({ dt: 0.5, lines: renderDashboardTop(0, 'lastSeen', false, 1) })
  writeCast(path.join(TMP_DIR, 'showcase-top.cast'), specs)
}

// ── Widget: heatmap + running agents ──
{
  const specs = []
  for (let f = 0; f < 28; f++) {
    specs.push({ dt: f === 0 ? 0.35 : 0.16, lines: renderWidget(f) })
  }
  writeCast(path.join(TMP_DIR, 'showcase-widget.cast'), specs)
}

// Combined hero cast (dashboard → top → widget sequence)
{
  const specs = []
  for (let f = 0; f < 14; f++) {
    specs.push({ dt: f === 0 ? 0.55 : 0.22, lines: renderDashboardList(f, f % 4) })
  }
  specs.push({ dt: 0.55, lines: renderDashboardHelpScreen(6) })
  for (let f = 0; f < 8; f++) {
    specs.push({ dt: 0.28, lines: renderDashboardTop(f, 'tokens', false, 0) })
  }
  specs.push({ dt: 0.4, lines: renderDashboardTop(0, 'lastSeen', false, 0) })
  for (let f = 0; f < 14; f++) {
    specs.push({ dt: 0.14, lines: renderWidget(f) })
  }
  writeCast(path.join(TMP_DIR, 'showcase.cast'), specs)
}

console.log(`Showcase casts ready in ${TMP_DIR}/showcase*.cast`)
