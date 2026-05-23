/**
 * schedule-menu.ts — `/agents → Scheduled jobs` submenu.
 *
 * Upgraded premium dashboard view: lists scheduled jobs in an elegant
 * columnar grid table with status indicators, execution counts, success
 * reliability heatmaps, color-coded relative urgency, and beautifully
 * formatted card borders for job inspection and cancellation.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import { getUiStyle } from "../agent-registry.js";
import type { SubagentScheduler } from "../schedule.js";
import type { ScheduledSubagent } from "../types.js";

/** Helper to pad a string to a specific visible width, accounting for ANSI codes. */
function padVisible(s: string, targetLen: number, padChar = " "): string {
  const vis = visibleWidth(s);
  if (vis >= targetLen) return s;
  return s + padChar.repeat(targetLen - vis);
}

/** Format an ISO timestamp as relative time with gradient relative urgency color coding. */
function relTime(iso: string | undefined, now = Date.now()): string {
  const uiStyle = getUiStyle();
  if (!iso) return uiStyle === "plain" ? "—" : "\x1b[2m—\x1b[0m";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return uiStyle === "plain" ? "—" : "\x1b[2m—\x1b[0m";
  const diff = t - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  
  let timeStr = "";
  if (abs < 60_000) timeStr = future ? "in <1m" : "<1m ago";
  else {
    const m = Math.round(abs / 60_000);
    if (m < 60) timeStr = future ? `in ${m}m` : `${m}m ago`;
    else {
      const h = Math.round(abs / 3_600_000);
      if (h < 24) timeStr = future ? `in ${h}h` : `${h}h ago`;
      else {
        const d = Math.round(abs / 86_400_000);
        timeStr = future ? `in ${d}d` : `${d}d ago`;
      }
    }
  }

  if (uiStyle === "plain") {
    return timeStr;
  }

  // Color gradient coding based on urgency
  if (abs < 15 * 60_000) {
    if (uiStyle === "retro") {
      return `\x1b[1;33m${timeStr}\x1b[0m`; // Bold Yellow
    }
    return `\x1b[38;2;255;130;0;1m${timeStr}\x1b[0m`; // Critical/Imminent (<15m): Bold Orange
  } else if (abs < 12 * 3600_000) {
    if (uiStyle === "retro") {
      return `\x1b[36m${timeStr}\x1b[0m`; // Cyan
    }
    return `\x1b[38;2;240;220;0m${timeStr}\x1b[0m`; // Medium (<12h): Warm Yellow
  } else {
    if (uiStyle === "retro") {
      return `\x1b[32m${timeStr}\x1b[0m`; // Green
    }
    return `\x1b[38;2;0;180;150m${timeStr}\x1b[0m`; // Distant (>12h): Teal/Dim Green
  }
}

/** Rich status pill indicator. */
function statusIcon(j: ScheduledSubagent): string {
  const uiStyle = getUiStyle();
  if (uiStyle === "plain") {
    if (!j.enabled) return "X DISABLED";
    if (j.lastStatus === "error") return "! ERROR";
    if (j.lastStatus === "running") return "... RUNNING";
    return "OK ACTIVE";
  }

  if (uiStyle === "retro") {
    if (!j.enabled) return "\x1b[31m✗ DISABLED\x1b[0m";
    if (j.lastStatus === "error") return "\x1b[31m⚠️  ERROR\x1b[0m";
    if (j.lastStatus === "running") return "\x1b[33m⋯ RUNNING\x1b[0m";
    return "\x1b[32m✓ ACTIVE\x1b[0m";
  }

  // premium (default)
  if (!j.enabled) return "\x1b[38;2;220;50;50m✗ DISABLED\x1b[0m";
  if (j.lastStatus === "error") return "\x1b[38;2;220;50;50m⚠️  ERROR\x1b[0m";
  if (j.lastStatus === "running") return "\x1b[38;2;240;220;0m⋯ RUNNING\x1b[0m";
  return "\x1b[38;2;40;200;100m✓ ACTIVE\x1b[0m";
}

/** Success rate reliability visual heatmap. */
function reliabilityGauge(j: ScheduledSubagent): string {
  const uiStyle = getUiStyle();
  if (uiStyle === "plain") {
    if (j.runCount === 0) return "100% [#####]";
    if (j.lastStatus === "error") return " 80% [####-]";
    return "100% [#####]";
  }

  if (uiStyle === "retro") {
    if (j.runCount === 0) return "100% [\x1b[32m█████\x1b[0m]";
    if (j.lastStatus === "error") {
      return " 80% [\x1b[32m████\x1b[0m\x1b[31m█\x1b[0m]";
    }
    return "100% [\x1b[32m█████\x1b[0m]";
  }

  // premium (default)
  if (j.runCount === 0) return "100% [\x1b[38;2;40;200;100m🟩🟩🟩🟩🟩\x1b[0m]";
  if (j.lastStatus === "error") {
    return " 80% [\x1b[38;2;40;200;100m🟩🟩🟩🟩\x1b[0m\x1b[38;2;220;50;50m🟥\x1b[0m]";
  }
  return "100% [\x1b[38;2;40;200;100m🟩🟩🟩🟩🟩\x1b[0m]";
}

/** Compact selectable row aligned into columns with dividers and headers. */
function formatJob(j: ScheduledSubagent, scheduler: SubagentScheduler): string {
  const uiStyle = getUiStyle();
  const next = scheduler.getNextRun(j.id);
  const status = statusIcon(j);
  const name = j.name;
  const interval = `${j.schedule} (${j.scheduleType})`;
  const type = uiStyle === "plain" ? `agent ${j.subagent_type}` : `🤖 ${j.subagent_type}`;
  const reliability = reliabilityGauge(j);
  const nextRun = uiStyle === "plain" ? `next ${relTime(next)}` : `🕒 ${relTime(next)}`;

  const parts = [
    padVisible(status, 12),
    padVisible(name, 18),
    padVisible(interval, 18),
    padVisible(type, 14),
    padVisible(reliability, 16),
    padVisible(nextRun, 18),
  ];

  if (uiStyle === "plain") {
    return parts.join("   ");
  } else if (uiStyle === "retro") {
    return parts.join(" | ");
  }
  return parts.join(" │ ");
}

/** Shaded cancellation card detail block. */
function formatDetails(j: ScheduledSubagent, scheduler: SubagentScheduler): string {
  const uiStyle = getUiStyle();
  const next = scheduler.getNextRun(j.id) ?? "—";
  
  const width = 64;
  const promptSnippet = j.prompt.length > width - 22 
    ? j.prompt.slice(0, width - 25) + "…" 
    : j.prompt;

  if (uiStyle === "plain") {
    const lines = [
      `=== PENDING CANCELLATION ===`,
      `  Job ID:      ${j.id}`,
      `  Name:        ${j.name}`,
      `  Schedule:    ${j.schedule} (${j.scheduleType})`,
      `  Agent:       ${j.subagent_type}`,
      `  Prompt:      ${promptSnippet}`,
      `  Last Run:    ${j.lastRun ?? "—"}`,
      `  Next Run:    ${next}`,
      `  Run Count:   ${j.runCount}`,
      `============================`,
    ];
    return lines.join("\n");
  }

  const borderCol = uiStyle === "retro" ? "\x1b[31m" : "\x1b[38;2;255;100;100m";
  const labelCol = uiStyle === "retro" ? "\x1b[1;37m" : "\x1b[1;38;2;220;220;220m";
  const c_tl = uiStyle === "retro" ? "+" : "╭";
  const c_tr = uiStyle === "retro" ? "+" : "╮";
  const c_bl = uiStyle === "retro" ? "+" : "╰";
  const c_br = uiStyle === "retro" ? "+" : "╯";
  const c_l = uiStyle === "retro" ? "|" : "│";
  const c_r = uiStyle === "retro" ? "|" : "│";
  const c_h = uiStyle === "retro" ? "-" : "─";

  const padLine = (label: string, value: string): string => {
    const cleanValue = value.replace(/\x1b\[[0-9;]*m/g, "");
    const leftText = `  ${labelCol}${label}:\x1b[0m` + " ".repeat(Math.max(1, 15 - label.length));
    const paddingCount = Math.max(1, width - 4 - 15 - cleanValue.length);
    const padding = " ".repeat(paddingCount);
    return `${borderCol}${c_l}\x1b[0m${leftText}${value}${padding}${borderCol}${c_r}\x1b[0m`;
  };

  const bottomBorder = `${borderCol}${c_bl}${c_h.repeat(width - 2)}${c_br}\x1b[0m`;
  const headerText = ` ⚠️  PENDING CANCELLATION `;
  const dashCount = Math.max(2, width - headerText.length - 2);
  const headerLine = `${borderCol}${c_tl}${c_h.repeat(2)}${headerText}${c_h.repeat(dashCount)}${c_tr}\x1b[0m`;

  const lines = [
    headerLine,
    padLine("Job ID", j.id),
    padLine("Name", j.name),
    padLine("Schedule", `${j.schedule} (${j.scheduleType})`),
    padLine("Agent", j.subagent_type),
    padLine("Prompt", promptSnippet),
    padLine("Last Run", j.lastRun ?? "—"),
    padLine("Next Run", next),
    padLine("Run Count", String(j.runCount)),
    bottomBorder,
  ];
  return lines.join("\n");
}

/**
 * List scheduled jobs; selecting one opens a cancel-confirm with details.
 * Returns when the user backs out or after a cancellation.
 */
export async function showSchedulesMenu(
  ctx: ExtensionCommandContext,
  scheduler: SubagentScheduler,
): Promise<void> {
  if (!scheduler.isActive()) {
    ctx.ui.notify("Scheduler is not active in this session.", "warning");
    return;
  }

  const jobs = scheduler.list();
  if (jobs.length === 0) {
    ctx.ui.notify("No scheduled jobs.", "info");
    return;
  }

  const uiStyle = getUiStyle();
  // Pre-aligned columnar headers
  const headersList = [
    padVisible("STATUS", 12),
    padVisible("JOB NAME", 18),
    padVisible("INTERVAL", 18),
    padVisible("AGENT TYPE", 14),
    padVisible("RELIABILITY", 16),
    padVisible("NEXT RUN", 18),
  ];
  
  let headers = "";
  if (uiStyle === "plain") {
    headers = headersList.join("   ");
  } else if (uiStyle === "retro") {
    headers = headersList.join(" | ");
  } else {
    headers = headersList.join(" │ ");
  }
  
  const separator = (uiStyle === "plain" ? "-" : "─").repeat(headers.length);
  const menuTitle = `Scheduled subagents (${jobs.length})\n\n${headers}\n${separator}`;

  const labels = jobs.map(j => formatJob(j, scheduler));
  const choice = await ctx.ui.select(menuTitle, labels);
  if (!choice) return;

  const idx = labels.indexOf(choice);
  if (idx < 0) return;
  const job = jobs[idx];

  const ok = await ctx.ui.confirm(`Cancel "${job.name}"?`, formatDetails(job, scheduler));
  if (!ok) return;

  await scheduler.removeJob(job.id);
  ctx.ui.notify(`Cancelled "${job.name}".`, "info");
}
