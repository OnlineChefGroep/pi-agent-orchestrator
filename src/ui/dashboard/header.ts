import type { AgentManager } from "../../agent-manager.js";
import { getUiStyle } from "../../agent-registry.js";
import { getSpinnerFrameForStyle } from "../animation.js";
import {
  type BoxChars,
  borderLine,
  type DashboardTheme,
  fastTruncate,
  framedRow,
  padVisible,
} from "../theme.js";
import { visibleWidth } from "../tui-shim.js";
import type { DashboardRenderState } from "./types.js";

type DashboardCounts = {
  running: number;
  queued: number;
  completed: number;
  errored: number;
};

function countAgents(state: DashboardRenderState): DashboardCounts {
  const counts: DashboardCounts = { running: 0, queued: 0, completed: 0, errored: 0 };
  for (const agent of state.agents) {
    if (agent.status === "running") counts.running++;
    else if (agent.status === "queued") counts.queued++;
    else if (agent.status === "completed" || agent.status === "steered") counts.completed++;
    else if (agent.status === "error" || agent.status === "aborted") counts.errored++;
  }
  return counts;
}

function compactMeter(value: number, maximum: number, width: number, th: DashboardTheme): string {
  if (maximum <= 0) return "";
  const ratio = Math.max(0, Math.min(1, value / maximum));
  const filled = Math.min(width, Math.round(ratio * width));
  const color = ratio >= 0.9 ? th.error : ratio >= 0.75 ? th.highlight : th.accent;
  return `${color}${"■".repeat(filled)}${th.reset}${th.dim}${"·".repeat(width - filled)}${th.reset}`;
}

function capacitySummary(manager: AgentManager | undefined, th: DashboardTheme, compact: boolean): string {
  if (!manager) return "";
  const usage = manager.getSessionUsage();
  const maxAgents = manager.getSessionMaxSpawns();
  const maxTurns = manager.getSessionMaxTurns();
  const pieces: string[] = [];

  if (maxAgents > 0) {
    const label = compact ? "A" : "agents";
    pieces.push(`${th.dim}${label}${th.reset} ${compactMeter(usage.spawnedAgents, maxAgents, compact ? 4 : 6, th)} ${usage.spawnedAgents}/${maxAgents}`);
  }
  if (maxTurns > 0) {
    const label = compact ? "T" : "turns";
    pieces.push(`${th.dim}${label}${th.reset} ${compactMeter(usage.totalTurns, maxTurns, compact ? 4 : 6, th)} ${usage.totalTurns}/${maxTurns}`);
  }
  return pieces.join(` ${th.border}│${th.reset} `);
}

function responsiveJoin(left: string, right: string, width: number): string {
  if (!right) return padVisible(fastTruncate(left, width), width);
  const gap = width - visibleWidth(left) - visibleWidth(right);
  if (gap >= 2) return `${left}${" ".repeat(gap)}${right}`;
  return padVisible(fastTruncate(left, width), width);
}

function dashboardSummaryBar(
  state: DashboardRenderState,
  innerW: number,
  th: DashboardTheme,
  manager?: AgentManager,
): string {
  const counts = countAgents(state);
  const compact = innerW < 94;
  const separator = `  ${th.border}│${th.reset}  `;
  const activity = counts.running > 0
    ? `${th.accent}${getSpinnerFrameForStyle("orbit", state.frame)} ${compact ? counts.running : `${counts.running} running`}${th.reset}`
    : `${th.dim}○ ${compact ? "0" : "no active runs"}${th.reset}`;
  const items = [
    activity,
    `${th.highlight}◌ ${compact ? counts.queued : `${counts.queued} queued`}${th.reset}`,
    `${th.success}✓ ${compact ? counts.completed : `${counts.completed} done`}${th.reset}`,
  ];

  if (counts.errored > 0) items.push(`${th.error}✕ ${compact ? counts.errored : `${counts.errored} failed`}${th.reset}`);
  if (state.selectedIds.size > 0) items.push(`${th.highlight}◆ ${state.selectedIds.size}${compact ? "" : " selected"}${th.reset}`);

  const left = items.join(separator);
  const right = capacitySummary(manager, th, compact);
  return responsiveJoin(` ${left}`, right, innerW - 2);
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
  const counts = countAgents(state);
  const live = counts.running > 0 || counts.queued > 0;
  const liveGlyph = live ? getSpinnerFrameForStyle("orbit", state.frame) : "○";
  const liveColor = live ? th.success : th.dim;
  const brand = `${th.title}◈ PI ORCHESTRATOR${th.reset}`;
  const mode = `${liveColor}${liveGlyph} ${live ? "LIVE" : "IDLE"}${th.reset}`;
  const total = `${th.dim}${state.agents.length} agent${state.agents.length === 1 ? "" : "s"}${th.reset}`;
  const styleLabel = `${th.dim}${style}${th.reset}`;
  const titleRight = `${mode}  ${th.border}│${th.reset}  ${total}  ${th.border}│${th.reset}  ${styleLabel}`;
  const title = responsiveJoin(brand, titleRight, innerW);
  const summary = dashboardSummaryBar(state, innerW, th, manager);
  const bg = th.bgHeader || "";
  const wrapBackground = (line: string): string => {
    if (!bg) return line;
    return `${bg}${line.replaceAll(th.reset, `${th.reset}${bg}`)}${th.reset}`;
  };

  return [
    wrapBackground(borderLine(width, th, box, "top")),
    wrapBackground(framedRow(title, innerW, th, box)),
    wrapBackground(`${th.border}${box.ml}${th.reset}${th.dim}${box.h.repeat(Math.max(0, width - 2))}${th.reset}${th.border}${box.mr}${th.reset}`),
    wrapBackground(framedRow(summary, innerW, th, box)),
    wrapBackground(borderLine(width, th, box, "mid")),
  ];
}
