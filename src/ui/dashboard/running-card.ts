import type { AgentRecord } from "../../types.js";
import { getDisplayName } from "../agent-format.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { fastTruncate, padAndTruncate } from "../theme.js";
import { visibleWidth } from "../tui-shim.js";
import { activityText, agentStats, statusColor, statusIcon, statusLabel } from "./helpers.js";
import { renderTurnProgress } from "./progress.js";
import type { DashboardRenderState } from "./types.js";

export function renderRunningCard(
  rec: AgentRecord,
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
): string[] {
  const cardW = Math.max(24, innerW - 2);
  const contentW = Math.max(1, cardW - 4);
  const activity = state.agentActivity.get(rec.id);
  const selected = state.agents[state.selectedIndex]?.id === rec.id;
  const checked = state.selectedIds.has(rec.id) ? `${th.success}✓${th.reset} ` : "";
  const color = statusColor(rec, th);
  const icon = `${color}${statusIcon(rec, state.frame)}${th.reset}`;
  const badge = `${color}[${statusLabel(rec)}]${th.reset}`;
  const name = `${th.title}${getDisplayName(rec.type)}${th.reset}`;
  const stats = `${th.dim}${agentStats(rec, activity)}${th.reset}`;
  const left = `${checked}${icon} ${name} ${badge}`;
  const gap = Math.max(1, contentW - visibleWidth(left) - visibleWidth(stats));
  const description = rec.description || "No task description provided";
  const currentActivity = activityText(rec, activity);
  const activityGlyph = rec.status === "running" ? `${th.accent}┊${th.reset}` : `${th.dim}┊${th.reset}`;
  const background = selected ? (th.bgSelected || th.bgCard || "") : (th.bgCard || "");

  const wrapBackground = (line: string): string => {
    if (!background) return line;
    return `${background}${line.replaceAll(th.reset, `${th.reset}${background}`)}${th.reset}`;
  };
  const cardLine = (content: string): string => wrapBackground(
    ` ${th.border}${box.l}${th.reset} ${padAndTruncate(content, contentW)} ${th.border}${box.r}${th.reset}`,
  );

  const topLabel = selected ? `${th.highlight} focus ${th.reset}` : "";
  const topFill = Math.max(0, cardW - 2 - visibleWidth(topLabel));
  const top = wrapBackground(` ${th.border}${box.tl}${box.h.repeat(topFill)}${th.reset}${topLabel}${th.border}${box.tr}${th.reset}`);
  const lines = [
    top,
    cardLine(`${left}${" ".repeat(gap)}${stats}`),
    cardLine(`${th.muted}› ${fastTruncate(description, Math.max(1, contentW - 2))}${th.reset}`),
    cardLine(`${activityGlyph} ${th.dim}${fastTruncate(currentActivity, Math.max(1, contentW - 2))}${th.reset}`),
  ];

  if (rec.status === "running" && activity?.maxTurns) {
    lines.push(cardLine(`${th.dim}turn budget${th.reset}  ${renderTurnProgress(activity.turnCount, activity.maxTurns, 14, th)}`));
  }

  lines.push(wrapBackground(` ${th.border}${box.bl}${box.h.repeat(Math.max(0, cardW - 2))}${box.br}${th.reset}`));
  return lines;
}
