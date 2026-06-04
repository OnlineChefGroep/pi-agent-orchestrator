import { visibleWidth } from "@earendil-works/pi-tui";
import type { AgentRecord } from "../../types.js";
import { getDisplayName } from "../agent-format.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { fastTruncate, padVisible } from "../theme.js";
import { activityText, agentStats, statusColor, statusIcon } from "./helpers.js";
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
  const checked = state.selectedIds.has(rec.id) ? `${th.success}✓${th.reset} ` : " ";
  const icon = `${statusColor(rec, th)}${statusIcon(rec, state.frame)}${th.reset}`;
  const name = `${th.title}${getDisplayName(rec.type)}${th.reset}`;
  const stats = `${th.dim}${agentStats(rec, activity)}${th.reset}`;
  const gap = Math.max(1, contentW - visibleWidth(`${checked}${icon} ${name}`) - visibleWidth(stats));
  const description = rec.description || "(no description)";
  const act = activityText(rec, activity);
  const actIcon = rec.status === "running" ? `${th.accent}┊${th.reset}` : `${th.dim}┊${th.reset}`;

  // TrueColor background for card (empty string for retro/plain)
  const bg = th.bgCard || "";
  const bgSel = selected ? (th.bgSelected || "") : "";
  const wrapBg = (s: string, useBg: string) => {
    if (!useBg) return s;
    // Re-apply bg after each internal reset so the background persists across the full line
    return `${useBg}${s.replaceAll(th.reset, `${th.reset}${useBg}`)}${th.reset}`;
  };

  const top = wrapBg(` ${th.border}${box.tl}${box.h.repeat(Math.max(0, cardW - 2))}${box.tr}${th.reset}`, bgSel || bg);
  const line1 = wrapBg(` ${th.border}${box.l}${th.reset} ${fastTruncate(padVisible(`${checked}${icon} ${name}${" ".repeat(gap)}${stats}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`, bgSel || bg);
  const line2 = wrapBg(` ${th.border}${box.l}${th.reset} ${fastTruncate(padVisible(`${th.muted}${description}${th.reset}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`, bgSel || bg);
  const bottom = wrapBg(` ${th.border}${box.bl}${box.h.repeat(Math.max(0, cardW - 2))}${box.br}${th.reset}`, bg);
  const actPad = " ".repeat(Math.max(1, 3));
  const actLine = `${actPad}${actIcon} ${th.dim}${fastTruncate(act, Math.max(8, innerW - 8))}${th.reset}`;
  const focusMarker = selected ? `${th.highlight} ◀ focus${th.reset}` : "";
  const lines = [top + focusMarker, line1, line2, bottom, actLine];
  // Progress bar inside the card (between description and bottom border) — only when data exists
  if (rec.status === "running" && activity?.maxTurns) {
    const progressContent = `  ${renderTurnProgress(activity.turnCount, activity.maxTurns, 10, th)}`;
    const line3 = wrapBg(` ${th.border}${box.l}${th.reset} ${fastTruncate(padVisible(progressContent, contentW), contentW)} ${th.border}${box.r}${th.reset}`, bgSel || bg);
    lines.splice(3, 0, line3); // insert before bottom border
  }
  return lines;
}
