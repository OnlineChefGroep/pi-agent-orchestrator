import type { SubagentScheduler } from "../../schedule.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { fastTruncate, framedRow, padVisible } from "../theme.js";
import { renderSectionTitle } from "./section-title.js";

/** Format a single schedule row for the compact dashboard table. */
function formatScheduleRow(scheduler: SubagentScheduler, th: DashboardTheme, contentW: number): string[] {
  const jobs = scheduler.list();
  const lines: string[] = [];

  if (jobs.length === 0) {
    lines.push(`  ${th.muted}No scheduled jobs configured.${th.reset}`);
    return lines;
  }

  for (const job of jobs) {
    const next = scheduler.getNextRun(job.id);
    const enabled = job.enabled ? `${th.success}● enabled${th.reset}` : `${th.error}○ disabled${th.reset}`;
    const name = fastTruncate(job.name, 20);
    const schedule = `${job.schedule} (${job.scheduleType})`;
    const type = fastTruncate(job.subagent_type, 14);
    const nextRun = next ? formatNextRun(next) : `${th.muted}—${th.reset}`;
    const runs = `${job.runCount}×`;

    const row = [
      padVisible(enabled, 14),
      ` ${th.title}${name}${th.reset}`,
      padVisible(` ${th.muted}${schedule}${th.reset}`, 26),
      padVisible(` ${th.dim}${type}${th.reset}`, 18),
      padVisible(` ${th.dim}${runs}${th.reset}`, 8),
      padVisible(` ${nextRun}`, 18),
    ].join("");

    lines.push(`  ${padVisible(row, contentW - 2)}`);
  }

  lines.push(`  ${th.muted}${jobs.length} job${jobs.length === 1 ? "" : "s"} total · z to toggle${th.reset}`);
  return lines;
}

/** Format a next-run ISO timestamp as a short relative string. */
function formatNextRun(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;

  if (abs < 60_000) return future ? "<1m" : "now";
  const m = Math.round(abs / 60_000);
  if (m < 60) return future ? `${m}m` : `-${m}m`;
  const h = Math.round(abs / 3_600_000);
  if (h < 24) return future ? `${h}h` : `-${h}h`;
  const d = Math.round(abs / 86_400_000);
  return future ? `${d}d` : `-${d}d`;
}

/** Render the schedules section for the dashboard body. */
export function renderSchedulesSection(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  scheduler: SubagentScheduler,
): string[] {
  if (!scheduler.isActive()) return [];

  const lines = [
    "",
    renderSectionTitle(
      "⏱ SCHEDULED JOBS",
      `${scheduler.list().length} job${scheduler.list().length === 1 ? "" : "s"}`,
      innerW,
      th,
      box,
    ),
  ];

  lines.push(...formatScheduleRow(scheduler, th, innerW));

  // Wrap each body line in framedRow for consistent dashboard border rendering.
  for (let i = 2; i < lines.length; i++) {
    lines[i] = framedRow(lines[i], innerW, th, box);
  }
  return lines;
}
