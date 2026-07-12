#!/usr/bin/env node
/**
 * check-benchmark-thresholds.mjs — CI threshold checker for render benchmarks.
 *
 * Runs the widget-render-perf test file, parses structured [BENCHMARK] output,
 * and produces a summary table. Warnings are emitted when measured values
 * approach (80%) or exceed (100%) of their threshold.
 *
 * Exit codes:
 *   0 — all benchmarks OK or only warnings (no failures)
 *   1 — one or more benchmarks FAILED (measured > threshold)
 *
 * Usage:
 *   node scripts/check-benchmark-thresholds.mjs
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ANSI colors
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

function color (status, text) {
  if (status === 'OK') return `${GREEN}${text}${RESET}`
  if (status === 'WARN') return `${YELLOW}${text}${RESET}`
  if (status === 'FAIL') return `${RED}${text}${RESET}`
  return text
}

async function main () {
  console.log(`\n${BOLD}═══ Render Benchmark Threshold Check ═══${RESET}\n`)

  const testFiles = [
    'test/widget-render-perf.test.ts',
    'test/dashboard-render-perf.test.ts',
    'test/dashboard.benchmark.test.ts',
    'test/spawn-latency-bench.test.ts',
    'test/spawn-latency-e2e-bench.test.ts',
    'test/handoff-v2.test.ts'
  ]
    .map((f) => resolve(ROOT, f))
    .filter((f) => existsSync(f))

  if (testFiles.length === 0) {
    console.error(`${RED}ERROR:${RESET} No benchmark test files found`)
    process.exit(1)
  }

  const paths = testFiles.map((f) => `"${f}"`).join(' ')
  let rawOutput
  let vitestExitCode = 0
  try {
    rawOutput = execSync(
      `npx vitest run ${paths} --reporter=verbose --retry=0 2>&1`,
      {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024
      }
    )
  } catch (err) {
    vitestExitCode = err.status ?? 1
    rawOutput = err.stderr
      ? `${err.stdout || ''}\n${err.stderr}`
      : err.stdout || String(err)
  }

  // Parse structured [BENCHMARK] lines
  const benchLines = rawOutput.match(/\[BENCHMARK\].*/g) || []

  if (benchLines.length === 0) {
    console.error(
      `${RED}ERROR:${RESET} No [BENCHMARK] lines found in output.\n` +
        'Make sure the test file has benchmarkLog() calls.\n'
    )
    console.log(rawOutput.slice(0, 2000))
    console.log('...')
    process.exit(1)
  }

  const results = []
  for (const line of benchLines) {
    // Format: [BENCHMARK] <name> <measured>/<threshold> <pct>% <OK|WARN|FAIL>
    const match = line.match(
      /\[BENCHMARK\] (.+) (.+?)\/(.+?) (\d+)% (.+)/
    )
    if (!match) {
      console.warn(`${YELLOW}Warning:${RESET} Could not parse: ${line}`)
      continue
    }
    const [, name, measuredStr, thresholdStr, pctStr, status] = match
    results.push({
      name: name.trim(),
      measured: measuredStr.trim(),
      threshold: thresholdStr.trim(),
      pct: Number.parseInt(pctStr, 10),
      status: status.trim()
    })
  }

  // Print summary table
  const nameWidth = Math.max(
    ...results.map((r) => r.name.length),
    25
  )
  const sep = '─'.repeat(nameWidth + 50)

  console.log(` ${BOLD}Results${RESET}`)
  console.log(` ${sep}`)
  console.log(
    ` ${'Benchmark'.padEnd(nameWidth)}  ${'Measured'.padEnd(14)}  ${'Threshold'.padEnd(14)}  %     Status`
  )
  console.log(` ${sep}`)

  let ok = 0
  let warned = 0
  let failed = 0

  for (const r of results) {
    const statusLabel = r.status === 'OK'
      ? color('OK', 'OK')
      : r.status === 'WARN'
        ? color('WARN', 'WARN')
        : color('FAIL', 'FAIL')

    console.log(
      ` ${r.name.padEnd(nameWidth)}  ${r.measured.padEnd(14)}  ${r.threshold.padEnd(14)}  ${String(r.pct).padStart(3)}%  ${statusLabel}`
    )

    if (r.status === 'OK') ok++
    else if (r.status === 'WARN') warned++
    else if (r.status === 'FAIL') failed++
  }

  console.log(` ${sep}`)
  console.log(
    ` ${BOLD}Summary:${RESET} ${ok} OK, ${warned > 0 ? `${YELLOW}${warned} WARN${RESET}` : '0 WARN'}, ${failed > 0 ? `${RED}${failed} FAIL${RESET}` : '0 FAIL'}`
  )
  console.log()

  // Print warnings/errors summary
  if (warned > 0) {
    console.warn(`${YELLOW}Benchmark warnings (approaching threshold):${RESET}`)
    for (const r of results) {
      if (r.status === 'WARN') {
        console.warn(
          `  ⚠️  ${r.name}: ${r.measured} / ${r.threshold} (${r.pct}%)`
        )
      }
    }
    console.warn()
  }

  if (failed > 0) {
    console.error(`${RED}Benchmark failures (exceeded threshold):${RESET}`)
    for (const r of results) {
      if (r.status === 'FAIL') {
        console.error(
          `  ❌ ${r.name}: ${r.measured} exceeds ${r.threshold}`
        )
      }
    }
    console.error()
    process.exit(1)
  }

  if (vitestExitCode !== 0) {
    console.error(
      `${RED}ERROR:${RESET} vitest exited with code ${vitestExitCode} despite passing benchmark thresholds`
    )
    process.exit(vitestExitCode)
  }

  console.log(`${GREEN}✓ All render benchmarks within thresholds${RESET}\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err)
  process.exit(1)
})
