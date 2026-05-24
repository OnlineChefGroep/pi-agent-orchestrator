#!/usr/bin/env node
/**
 * autoresearch_helper.mjs — CLI helper for autoresearch experiment tracking.
 *
 * Handles JSONL state management, MAD-based confidence scoring, and experiment logging.
 * No external dependencies — Node.js stdlib only.
 *
 * Usage:
 *   node autoresearch_helper.mjs init --jsonl FILE --name NAME --metric-name NAME [--metric-unit UNIT] [--direction lower|higher]
 *   node autoresearch_helper.mjs log --jsonl FILE --commit SHA --metric VALUE --status STATUS --description DESC [--direction lower|higher] [--metrics '{"k":v}'] [--asi '{"k":"v"}']
 *   node autoresearch_helper.mjs evaluate --jsonl FILE --metric VALUE --direction lower|higher
 *   node autoresearch_helper.mjs summary --jsonl FILE
 *   node autoresearch_helper.mjs status --jsonl FILE
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

function readJsonl(path) {
  let config = null;
  const results = [];
  let segment = 0;

  if (!existsSync(path)) return { config, results };

  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "config") {
        if (results.length > 0) segment++;
        config = { ...entry, _segment: segment };
        continue;
      }
      entry.segment = entry.segment ?? segment;
      entry.metrics = entry.metrics ?? {};
      entry.confidence = entry.confidence ?? null;
      entry.asi = entry.asi ?? null;
      results.push(entry);
    } catch { continue; }
  }

  return { config, results };
}

function currentSegmentResults(results, segment) {
  return results.filter(r => r.segment === segment);
}

function computeMad(values) {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  return deviations.length % 2 === 0
    ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
    : deviations[Math.floor(deviations.length / 2)];
}

function computeConfidence(results, segment, direction) {
  const cur = currentSegmentResults(results, segment).filter(r => !["crash", "checks_failed"].includes(r.status));
  if (cur.length < 3) return null;

  const values = cur.map(r => r.metric);
  const mad = computeMad(values);
  if (mad === 0) return null;

  const baseline = findBaseline(results, segment);
  if (baseline == null) return null;

  let bestKept = null;
  for (const r of cur) {
    if (r.status === "keep") {
      if (bestKept == null) bestKept = r.metric;
      else if (direction === "lower" && r.metric < bestKept) bestKept = r.metric;
      else if (direction === "higher" && r.metric > bestKept) bestKept = r.metric;
    }
  }

  if (bestKept == null || bestKept === baseline) return null;
  return Math.round(Math.abs(bestKept - baseline) / mad * 100) / 100;
}

function findBaseline(results, segment) {
  const cur = currentSegmentResults(results, segment);
  return cur.length > 0 ? cur[0].metric : null;
}

function findBestKept(results, segment, direction) {
  const cur = currentSegmentResults(results, segment);
  let best = null;
  for (const r of cur) {
    if (r.status === "keep") {
      if (best == null) best = r.metric;
      else if (direction === "lower" && r.metric < best) best = r.metric;
      else if (direction === "higher" && r.metric > best) best = r.metric;
    }
  }
  return best;
}

function isBetter(current, best, direction) {
  return direction === "lower" ? current < best : current > best;
}

function cmdInit(args) {
  const config = {
    type: "config",
    name: args.values.name,
    metricName: args.values["metric-name"],
    metricUnit: args.values["metric-unit"] ?? "",
    bestDirection: args.values.direction ?? "lower",
  };
  const mode = existsSync(args.values.jsonl) ? "a" : "w";
  appendFileSync(args.values.jsonl, JSON.stringify(config) + "\n");
  console.log(`Initialized: ${args.values.name} (metric: ${args.values["metric-name"]}, direction: ${args.values.direction ?? "lower"})`);
}

function cmdLog(args) {
  const { config, results } = readJsonl(args.values.jsonl);
  if (!config) { console.error("No config found. Run 'init' first."); process.exit(1); }

  const segment = config._segment ?? 0;
  const direction = args.values.direction ?? config.bestDirection ?? "lower";

  let extraMetrics = {};
  if (args.values.metrics) {
    try { extraMetrics = JSON.parse(args.values.metrics); }
    catch { console.warn("Warning: could not parse --metrics JSON"); }
  }

  let asi = null;
  if (args.values.asi) {
    try { asi = JSON.parse(args.values.asi); }
    catch { console.warn("Warning: could not parse --asi JSON"); }
  }

  const entry = {
    run: results.length + 1,
    commit: args.values.commit ? String(args.values.commit).slice(0, 7) : "0000000",
    metric: parseFloat(args.values.metric),
    metrics: extraMetrics,
    status: args.values.status,
    description: args.values.description,
    timestamp: Date.now(),
    segment,
    confidence: null,
    asi,
  };

  results.push(entry);
  const confidence = computeConfidence(results, segment, direction);
  entry.confidence = confidence;

  appendFileSync(args.values.jsonl, JSON.stringify(entry) + "\n");

  const baseline = findBaseline(results, segment);
  const best = findBestKept(results, segment, direction);

  console.log(`Logged #${entry.run}: ${args.values.status} — ${args.values.description}`);
  console.log(`  Metric: ${args.values.metric}`);
  if (baseline != null) console.log(`  Baseline: ${baseline}`);
  if (best != null && baseline != null && baseline !== 0) {
    const deltaPct = ((best - baseline) / baseline) * 100;
    console.log(`  Best kept: ${best} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`);
  }
  if (confidence != null) {
    const label = confidence >= 2.0 ? "likely real" : confidence >= 1.0 ? "marginal" : "within noise";
    console.log(`  Confidence: ${confidence}x (${label})`);
  }
}

function cmdEvaluate(args) {
  const { config, results } = readJsonl(args.values.jsonl);
  if (!config) { console.error("No config found."); process.exit(1); }

  const segment = config._segment ?? 0;
  const direction = args.values.direction ?? config.bestDirection ?? "lower";
  const baseline = findBaseline(results, segment);
  const best = findBestKept(results, segment, direction);
  const compareAgainst = best ?? baseline;

  if (compareAgainst == null) {
    console.log("DECISION: keep (first experiment — baseline)");
    console.log(`  Metric: ${args.values.metric}`);
    process.exit(0);
  }

  const improved = isBetter(parseFloat(args.values.metric), compareAgainst, direction);
  const resultsWithNew = [...results, { metric: parseFloat(args.values.metric), status: "keep", segment }];
  const confidence = computeConfidence(resultsWithNew, segment, direction);

  const delta = parseFloat(args.values.metric) - compareAgainst;
  const deltaPct = compareAgainst !== 0 ? (delta / compareAgainst) * 100 : 0;

  console.log(`DECISION: ${improved ? "keep" : "discard"}`);
  console.log(`  Metric: ${args.values.metric}`);
  console.log(`  Compare against: ${compareAgainst} (${best != null ? "best kept" : "baseline"})`);
  console.log(`  Delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(4)} (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`);
  console.log(`  Direction: ${direction} is better`);
  if (confidence != null) {
    const label = confidence >= 2.0 ? "likely real" : confidence >= 1.0 ? "marginal" : "within noise";
    console.log(`  Confidence: ${confidence}x (${label})`);
    if (confidence < 1.0 && improved) console.log("  Warning: improvement is within noise floor. Consider re-running.");
  }
}

function cmdSummary(args) {
  const { config, results } = readJsonl(args.values.jsonl);
  if (!config) { console.log("No experiments found."); return; }

  const segment = config._segment ?? 0;
  const cur = currentSegmentResults(results, segment);
  const direction = config.bestDirection ?? "lower";

  const kept = cur.filter(r => r.status === "keep");
  const discarded = cur.filter(r => r.status === "discard");
  const crashed = cur.filter(r => ["crash", "checks_failed"].includes(r.status));
  const baseline = findBaseline(results, segment);
  const best = findBestKept(results, segment, direction);
  const confidence = computeConfidence(results, segment, direction);

  console.log(`Session: ${config.name ?? "unnamed"}`);
  console.log(`Metric: ${config.metricName ?? "metric"} (${config.metricUnit ?? ""}), ${direction} is better`);
  console.log(`Experiments: ${cur.length} total, ${kept.length} kept, ${discarded.length} discarded, ${crashed.length} crashed`);
  console.log();
  if (baseline != null) console.log(`Baseline: ${baseline}`);
  if (best != null && baseline != null && baseline !== 0) {
    console.log(`Best kept: ${best} (${(((best - baseline) / baseline) * 100).toFixed(1)}% from baseline)`);
  }
  if (confidence != null) {
    const label = confidence >= 2.0 ? "likely real" : confidence >= 1.0 ? "marginal" : "within noise";
    console.log(`Confidence: ${confidence}x (${label})`);
  }
  console.log();
  console.log("Kept experiments:");
  for (const r of kept) {
    console.log(`  #${r.run} [${r.commit}] ${config.metricName ?? "metric"}=${r.metric}  ${r.description}`);
  }
  if (crashed.length) {
    console.log();
    console.log("Crashed/failed:");
    for (const r of crashed) {
      console.log(`  #${r.run} [${r.status}] ${r.description}`);
    }
  }
}

function cmdStatus(args) {
  const { config, results } = readJsonl(args.values.jsonl);
  if (!config) { console.log(JSON.stringify({ error: "no config found" })); return; }

  const segment = config._segment ?? 0;
  const direction = config.bestDirection ?? "lower";
  const cur = currentSegmentResults(results, segment);
  const baseline = findBaseline(results, segment);
  const best = findBestKept(results, segment, direction);
  const confidence = computeConfidence(results, segment, direction);

  const status = {
    name: config.name,
    metricName: config.metricName,
    direction,
    totalExperiments: cur.length,
    keptCount: cur.filter(r => r.status === "keep").length,
    baseline,
    bestKept: best,
    confidence,
    deltaPercent: best != null && baseline != null && baseline !== 0
      ? Math.round(((best - baseline) / baseline) * 10000) / 100
      : null,
  };
  console.log(JSON.stringify(status, null, 2));
}

function main() {
  const commands = { init: cmdInit, log: cmdLog, evaluate: cmdEvaluate, summary: cmdSummary, status: cmdStatus };

  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      jsonl: { type: "string" },
      name: { type: "string" },
      "metric-name": { type: "string" },
      "metric-unit": { type: "string" },
      direction: { type: "string" },
      commit: { type: "string" },
      metric: { type: "string" },
      status: { type: "string" },
      description: { type: "string" },
      metrics: { type: "string" },
      asi: { type: "string" },
    },
  });

  const cmd = positionals[0];
  if (!cmd || !commands[cmd]) {
    console.error(`Usage: node autoresearch_helper.mjs <${Object.keys(commands).join("|")}> [options]`);
    process.exit(1);
  }

  commands[cmd]({ values });
}

main();
