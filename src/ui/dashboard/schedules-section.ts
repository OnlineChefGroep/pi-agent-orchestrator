import type { SubagentScheduler } from "../../schedule.js";
import { getTimeSpinnerFrameForRole } from "../animation.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { fastTruncate, framedRow, padVisible } from "../theme.js";
import { renderSectionTitle } from "./section-title.js";

function formatScheduleRows(
  scheduler: SubagentScheduler,
  theme: DashboardTheme,
  contentWidth: number,
): string[] {
  const jobs = scheduler.list();
  if (jobs.length === 0) return [`  ${theme.muted}No scheduled jobs configured.${theme.reset}`];

  const lines: string[] = [];
  for (const job of jobs) {
    const next = scheduler.getNextRun(job.id);
    const motion = job.enabled ? getTimeSpinnerFrameForRole("scheduler", job.id, Date.now(), 180) : "";
    const enabled = job.enabled
      ? `${theme.success}${motion || "●"} enabled${theme.reset}`
      : `${theme.error}○ disabled${theme.reset}`;
    const name = fastTruncate(job.name, 20);
    const schedule = `${job.schedule} (${job.scheduleType})`;
    const type = fastTruncate(job.subagent_type, 14);
    const nextRun = next ? formatNextRun(next) : `${theme.muted}—${theme.reset}`;
    const runs = `${job.runCount}×`;

    const row = [
      padVisible(enabled, 14),
      ` ${theme.title}${name}${theme.reset}`,
      padVisible(` ${theme.muted}${schedule}${theme.reset}`, 26),
      padVisible(` ${theme.dim}${type}${theme.reset}`, 18),
      padVisible(` ${theme.dim}${runs}${theme.reset}`, 8),
      padVisible(` ${nextRun}`, 18),
    ].join("");
    lines.push(`  ${padVisible(row, contentWidth - 2)}`);
  }

  lines.push(`  ${theme.muted}${jobs.length} job${jobs.length === 1 ? "" : "s"} total · z to toggle${theme.reset}`);
  return lines;
}

function formatNextRun(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "—";
  const difference = timestamp - Date.now();
  const absolute = Math.abs(difference);
  const future = difference > 0;

  if (absolute < 60_000) return future ? "<1m" : "now";
  const minutes = Math.round(absolute / 60_000);
  if (minutes < 60) return future ? `${minutes}m` : `-${minutes}m`;
  const hours = Math.round(absolute / 3_600_000);
  if (hours < 24) return future ? `${hours}h` : `-${hours}h`;
  const days = Math.round(absolute / 86_400_000);
  return future ? `${days}d` : `-${days}d`;
}

export function renderSchedulesSection(
  innerWidth: number,
  theme: DashboardTheme,
  box: BoxChars,
  scheduler: SubagentScheduler,
): string[] {
  if (!scheduler.isActive()) return [];

  const jobCount = scheduler.list().length;
  const sectionMotion = getTimeSpinnerFrameForRole("scheduler", "schedule-section", Date.now(), 180);
  const lines = [
    "",
    renderSectionTitle(
      `${sectionMotion || "⏱"} SCHEDULED JOBS`,
      `${jobCount} job${jobCount === 1 ? "" : "s"}`,
      innerWidth,
      theme,
      box,
    ),
    ...formatScheduleRows(scheduler, theme, innerWidth),
  ];

  for (let index = 2; index < lines.length; index++) {
    lines[index] = framedRow(lines[index], innerWidth, theme, box);
  }
  return lines;
}
