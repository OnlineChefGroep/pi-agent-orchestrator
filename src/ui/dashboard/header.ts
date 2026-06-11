import { visibleWidth } from "@earendil-works/pi-tui";
import type { AgentManager } from "../../agent-manager.js";
import { getUiStyle } from "../../agent-registry.js";
import { type BoxChars, borderLine, type DashboardTheme, framedRow, padVisible } from "../theme.js";
import type { DashboardRenderState } from "./types.js";

/**
 * Build a horizontal summary bar showing agent counts and optional session meters.
 *
 * Constructs a colored, padded summary string that includes counts of agents by status: running, queued, and done (completed or steered). Includes an error segment only when there are errored/aborted agents, and a selected indicator when `state.selectedIds` is non-empty. When `manager` is provided and session limits exist, appends usage meters for spawned agents and total turns formatted as `current/max` with colors chosen by percentage thresholds.
 *
 * @param state - Render state containing `agents` and `selectedIds`
 * @param innerW - Available inner width used to compute padding
 * @param th - Theme tokens (colors and styling sequences) used for segments
 * @param manager - Optional AgentManager used to obtain session usage and limits; when omitted, meters are not shown
 * @returns A single-line summary string, colored and padded to fit the available inner width
 */
function dashboardSummaryBar(
  state: DashboardRenderState,
  innerW: number,
  th: DashboardTheme,
  manager?: AgentManager,
): string {
  let running = 0, queued = 0, completed = 0, errored = 0;
  for (const a of state.agents) {
    if (a.status === "running") running++;
    else if (a.status === "queued") queued++;
    else if (a.status === "completed" || a.status === "steered") completed++;
    else if (a.status === "error" || a.status === "aborted") errored++;
  }
  const selected = state.selectedIds.size > 0
    ? `  ${th.highlight}◆ ${state.selectedIds.size} selected${th.reset}`
    : "";
  const sep = `  ${th.border}│${th.reset}  `;
  const parts = [
    `${th.accent}● ${running} running${th.reset}`,
    `${th.dim}◔ ${queued} queued${th.reset}`,
    `${th.success}✓ ${completed} done${th.reset}`,
    ...(errored > 0 ? [`${th.error}✗ ${errored} error${th.reset}`] : []),
  ];

  // Session usage meters when manager is available
  if (manager) {
    const usage = manager.getSessionUsage();
    const maxAgents = manager.getSessionMaxSpawns();
    const maxTurns = manager.getSessionMaxTurns();

    if (maxAgents > 0 || maxTurns > 0) {
      const meterParts: string[] = [];

      if (maxAgents > 0) {
        const pct = Math.round((usage.spawnedAgents / maxAgents) * 100);
        const color = pct >= 90 ? th.error : pct >= 75 ? th.dim : th.accent;
        meterParts.push(`${color}⬡ ${usage.spawnedAgents}/${maxAgents} agents${th.reset}`);
      }

      if (maxTurns > 0) {
        const pct = Math.round((usage.totalTurns / maxTurns) * 100);
        const color = pct >= 90 ? th.error : pct >= 75 ? th.dim : th.dim;
        meterParts.push(`${color}⟳ ${usage.totalTurns}/${maxTurns} turns${th.reset}`);
      }

      if (meterParts.length > 0) {
        return padVisible(` ${parts.join(sep)}${selected}  ${meterParts.join(sep)}`, innerW - 2);
      }
    }
  }

  return padVisible(` ${parts.join(sep)}${selected}`, innerW - 2);
}

export function renderDashboardHeader(
  width: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  manager?: AgentManager,
): string[] {
  const innerW = Math.max(1, width - 4);
  const style = getUiStyle();
  const titleLeft = `${th.title}◈  AGENT DASHBOARD${th.reset}`;
  const titleRight = `${th.dim}${style} mode${th.reset}`;
  const titleGap = Math.max(1, innerW - visibleWidth(titleLeft) - visibleWidth(titleRight));
  const summary = dashboardSummaryBar(state, innerW, th, manager);
  // TrueColor header background (empty string for retro/plain)
  const bg = th.bgHeader || "";
  const wrapBg = (s: string) => {
    if (!bg) return s;
    // Re-apply bg after each internal reset so the background persists across the full line
    return `${bg}${s.replaceAll(th.reset, `${th.reset}${bg}`)}${th.reset}`;
  };
  return [
    wrapBg(borderLine(width, th, box, "top")),
    wrapBg(framedRow(`${titleLeft}${" ".repeat(titleGap)}${titleRight}`, innerW, th, box)),
    wrapBg(`${th.border}${box.ml}${th.reset}${th.dim}${box.h.repeat(Math.max(0, width - 2))}${th.reset}${th.border}${box.mr}${th.reset}`),
    wrapBg(framedRow(summary, innerW, th, box)),
    wrapBg(borderLine(width, th, box, "mid")),
  ];
}
