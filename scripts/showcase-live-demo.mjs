#!/usr/bin/env node
/**
 * Live terminal playback of dashboard / top / widget (dist renderers).
 * Record with: asciinema rec -c "node scripts/showcase-live-demo.mjs --auto"
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
).version

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

let getThemeColors, getBoxChars, framedRow, plainTheme, activeTheme
let buildDashboardBodyLines, renderDashboardHeader, renderDashboardFooter
let renderDashboardHelp, renderDashboardPerf, renderSwarmSection
let getAgentTopEntries, renderTopTable, sortEntries
let renderAgentWidget
try {
  ({
    getThemeColors,
    getBoxChars,
    framedRow,
    plainTheme,
    activeTheme
  } = await import(path.join(root, 'dist/ui/theme.js')));
  ({
    buildDashboardBodyLines,
    renderDashboardHeader,
    renderDashboardFooter,
    renderDashboardHelp,
    renderDashboardPerf,
    renderSwarmSection
  } = await import(path.join(root, 'dist/ui/dashboard/index.js')));
  ({
    getAgentTopEntries,
    renderTopTable,
    sortEntries
  } = await import(path.join(root, 'dist/ui/agent-top-renderer.js')));
  ({ renderAgentWidget } = await import(path.join(root, 'dist/ui/agent-widget-renderer.js')))
} catch (err) {
  console.error(
    'Error: failed to import dist/ui/* renderers.\n' +
      'Run \'npm run build\' first, then re-run this script.\n' +
      `Underlying error: ${err.message}`
  )
  process.exit(1)
}

const WIDTH = 110
const HEIGHT = 32
const CSI = '\u001b['
const CLEAR = `${CSI}2J${CSI}H`
const AUTO = process.argv.includes('--auto')

const th = getThemeColors()
const box = getBoxChars()
const widgetTheme = activeTheme(plainTheme())

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function mockAgents (frame) {
  const t = Date.now() - frame * 350
  return [
    { id: 'a1', type: 'Explore', description: 'Trace RPC + swarm health handlers', status: 'running', swarmId: 'swarm-alpha', joinMode: 'swarm', toolUses: 14, startedAt: t - 50_000, spawnedAt: t - 50_000 },
    { id: 'a2', type: 'Explore', description: 'Scan test/ coverage gaps', status: 'running', swarmId: 'swarm-alpha', joinMode: 'swarm', toolUses: 9, startedAt: t - 35_000, spawnedAt: t - 35_000 },
    { id: 'a3', type: 'Plan', description: `Verify v${packageVersion} release artifact`, status: 'running', toolUses: 6, startedAt: t - 22_000, spawnedAt: t - 22_000 },
    { id: 'a4', type: 'general-purpose', description: 'Virtual scroll + heatmap polish', status: 'queued', toolUses: 0, startedAt: t, spawnedAt: t },
    { id: 'a5', type: 'Analysis', description: 'Benchmark fastTruncate', status: 'completed', toolUses: 22, startedAt: t - 100_000, completedAt: t - 12_000, spawnedAt: t - 100_000 },
    { id: 'a6', type: 'Plan', description: 'Schedule bounds audit', status: 'error', error: 'rate limited', toolUses: 2, startedAt: t - 70_000, completedAt: t - 65_000, spawnedAt: t - 70_000 }
  ].map((a, i) => ({
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
    lifetimeUsage: { input: 5000 + i * 900, output: 1800 + i * 300, cacheWrite: 120 },
    ...a
  }))
}

function mockActivity (agents, frame) {
  const map = new Map()
  const ts = Date.now()
  for (const a of agents) {
    if (a.status !== 'running' && a.status !== 'queued') continue
    const tools = new Map()
    if (a.status === 'running') {
      tools.set('read', 'src/ui/agent-dashboard.ts')
      if (frame % 3 === 0) tools.set('grep', 'renderTopTable')
    }
    map.set(a.id, {
      activeTools: tools,
      toolUses: a.toolUses,
      responseText: a.status === 'running' ? 'Streaming analysis…' : '',
      turnCount: a.status === 'running' ? 4 + (frame % 5) : 0,
      maxTurns: 12,
      lifetimeUsage: a.lifetimeUsage,
      lastSeenMs: ts - (frame % 6) * 150
    })
  }
  return map
}

function state (agents, activity, frame, selectedIndex) {
  return { agents, selectedIndex, selectedIds: new Set(), frame, agentActivity: activity }
}

function padLines (lines) {
  const pad = s => {
    // eslint-disable-next-line no-control-regex
    const plain = s.replace(/\u001b\[[0-9;]*m/g, '')
    return plain.length >= WIDTH ? s : s + ' '.repeat(WIDTH - plain.length)
  }
  const rows = lines.slice(0, HEIGHT - 1).map(pad)
  while (rows.length < HEIGHT - 1) rows.push(' '.repeat(WIDTH))
  return rows
}

function renderList (frame, sel, hint) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const st = state(agents, activity, frame, sel)
  const innerW = WIDTH - 4
  const lines = renderDashboardHeader(WIDTH, th, box, st)
  const body = buildDashboardBodyLines(innerW, th, box, st)
  const vh = 16
  for (const line of body.lines.slice(0, vh)) lines.push(framedRow(line, innerW, th, box))
  for (let i = Math.min(vh, body.lines.length); i < vh; i++) lines.push(framedRow('', innerW, th, box))
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity))
  if (hint) lines.push(framedRow(` ${th.dim}› ${hint}${th.reset}`, innerW, th, box))
  return padLines(lines)
}

function renderTop (frame, sortKey, hint) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const st = state(agents, activity, frame, 0)
  const entries = sortEntries(getAgentTopEntries(agents, activity), sortKey, false)
  const lines = renderDashboardHeader(WIDTH, th, box, st)
  lines.push(...renderTopTable(entries, sortKey, false, 0, 10, th, WIDTH, 't: back to list'))
  const innerW = WIDTH - 4
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity))
  if (hint) lines.push(framedRow(` ${th.dim}› ${hint}${th.reset}`, innerW, th, box))
  return padLines(lines)
}

function renderHelp (frame) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const st = state(agents, activity, frame, 1)
  const innerW = WIDTH - 4
  const lines = renderDashboardHeader(WIDTH, th, box, st)
  lines.push(...renderDashboardHelp(innerW, th, box))
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity))
  return padLines(lines)
}

function renderWidgetScreen (frame, hint) {
  const agents = mockAgents(frame).filter(a => a.status === 'running' || a.status === 'queued')
  const activity = mockActivity(mockAgents(frame), frame)
  const lines = renderAgentWidget({
    agents,
    agentActivity: activity,
    frame,
    shouldShowFinished: () => false,
    theme: widgetTheme,
    tui: { terminal: { columns: WIDTH } },
    pageIndex: 0,
    pageCount: 1
  })
  if (hint) lines.push(`${CSI}2;${lines.length + 1}H${CSI}2m› ${hint}${CSI}0m`)
  return padLines(lines)
}

function renderSwarmScreen (frame) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const st = state(agents, activity, frame, 0)
  const innerW = WIDTH - 4
  const lines = renderDashboardHeader(WIDTH, th, box, st)
  lines.push(...renderSwarmSection(innerW, th, box, st, new Map()))
  lines.push(...renderDashboardFooter(WIDTH, th, box, activity))
  lines.push(framedRow(` ${th.dim}› swarm-alpha · live join/leave · bounded concurrency${th.reset}`, innerW, th, box))
  return padLines(lines)
}

function renderPerfScreen (frame) {
  const agents = mockAgents(frame)
  const activity = mockActivity(agents, frame)
  const st = state(agents, activity, frame, 0)
  const innerW = WIDTH - 4
  const lines = renderDashboardHeader(WIDTH, th, box, st)
  lines.push(...renderDashboardPerf(innerW, th, box, {
    lastMs: 0.31,
    meanMs: 0.27,
    minMs: 0.19,
    maxMs: 0.68,
    requestedRenderCount: 184,
    renderCount: 62,
    skippedRenderCount: 122,
    requestToActualRatio: 2.97,
    activeAgentCount: agents.length,
    activeAgentMean: 5.8,
    activeAgentMin: 4,
    activeAgentMax: 8,
    timeToFirstVisibleMs: 12.4,
    rendersPerSecond: 3.2,
    rendersPerMinute: 192,
    elapsedMs: 19_400
  }))
  return padLines(lines)
}

function renderFeaturePanel (title, subtitle, rows) {
  const innerW = WIDTH - 4
  const lines = [
    framedRow('', innerW, th, box),
    framedRow(` ${th.title}◈ ${title}${th.reset}`, innerW, th, box),
    framedRow(` ${th.muted}${subtitle}${th.reset}`, innerW, th, box),
    framedRow('', innerW, th, box),
    ...rows.map(([label, value, status = '']) =>
      framedRow(
        `  ${th.highlight}${label.padEnd(24)}${th.reset}${value}${status ? `  ${th.success}${status}${th.reset}` : ''}`,
        innerW,
        th,
        box
      )
    ),
    framedRow('', innerW, th, box)
  ]
  return padLines(lines)
}

function renderTitle () {
  return renderFeaturePanel(
    `Pi Agent Orchestrator v${packageVersion}`,
    'Deterministic terminal scenario rendered by the current compiled extension',
    [
      ['Agent lifecycle', 'spawn · queue · steer · stop · inspect', 'READY'],
      ['Coordination', 'groups · swarms · schedules · handoffs', 'READY'],
      ['Observability', 'dashboard · top · widget · render metrics', 'LIVE'],
      ['Safety', 'permission inheritance · bounded turns', 'ENFORCED']
    ]
  )
}

async function show (lines, ms = 400) {
  process.stdout.write(`${CLEAR + lines.join('\r\n')}\r\n`)
  if (AUTO) await sleep(ms)
}

async function runAuto () {
  process.stdout.write(CLEAR)
  await show(renderTitle(), 2200)
  await show(renderList(0, 0, 'DASHBOARD · j/k navigate · live activity and budgets'), 1800)
  for (let i = 1; i <= 4; i++) {
    await show(renderList(i, i, `DASHBOARD · selected agent ${i + 1}`), 650)
  }
  await show(renderHelp(2), 2600)
  await show(renderTop(5, 'tokens', 'TOP · sorted by tokens'), 2200)
  await show(renderTop(8, 'lastSeen', 'TOP · sorted by last seen'), 2200)
  await show(renderTop(10, 'toolUses', 'TOP · sorted by tool uses'), 2200)
  await show(renderWidgetScreen(12, 'WIDGET · compact live agents above editor'), 1800)
  for (let f = 13; f < 18; f++) {
    await show(renderWidgetScreen(f, 'WIDGET · activity and token heat update in place'), 350)
  }
  await show(renderSwarmScreen(20), 3000)
  await show(renderPerfScreen(22), 3000)
  await show(renderFeaturePanel(
    'Schedules',
    'Persistent recurring work with daemon-safe execution',
    [
      ['dependency-audit', '0 8 * * 1 · Explore · next 6d', 'ENABLED'],
      ['nightly-regression', '0 2 * * * · general-purpose · next 3h', 'ENABLED'],
      ['release-readiness', 'every 6h · Plan · next 54m', 'ENABLED']
    ]
  ), 2800)
  await show(renderFeaturePanel(
    'Settings',
    'Runtime controls persisted in .pi/subagent-settings.json',
    [
      ['maxConcurrent', '3 agents'],
      ['orchestrationMode', 'single · crew/swarm opt-in'],
      ['promptCompressionLevel', 'balanced'],
      ['animationStyle', 'orchestrator'],
      ['maxEndHookRevisions', '0 · fail closed']
    ]
  ), 2800)
  await show(renderFeaturePanel(
    'Structured handoff',
    'Machine-readable completion with evidence and remaining work',
    [
      ['status', 'completed', 'VERIFIED'],
      ['summary', 'release artifact built and inspected'],
      ['artifacts', 'test report · package manifest · media'],
      ['next', 'review → merge → publish']
    ]
  ), 3000)
  await show(renderTitle(), 1800)
  process.stdout.write(`${CSI}0m`)
}

async function runInteractive () {
  console.log('Showcase live demo — press Ctrl+D to end recording')
  await runAuto()
}

if (!process.stdout.isTTY && !AUTO) {
  console.error('Use --auto for non-TTY capture')
  process.exit(1)
}

await (AUTO ? runAuto() : runInteractive())
