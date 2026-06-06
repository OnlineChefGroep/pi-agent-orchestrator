import { visibleWidth } from "@earendil-works/pi-tui";
import type { AgentRecord } from "../../types.js";
import { getDisplayName } from "../agent-format.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { fastTruncate, padVisible } from "../theme.js";
import { activityText, agentStats, statusColor, statusIcon } from "./helpers.js";
import { renderSectionTitle } from "./section-title.js";
import type { DashboardRenderState } from "./types.js";

export function renderSwarmSection(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  focus: Map<string, number>,
  baseLine = 0,
): string[] {
  const grouped = new Map<string, AgentRecord[]>();
  for (const rec of state.agents) {
    if (!rec.swarmId) continue;
    const list = grouped.get(rec.swarmId) ?? [];
    list.push(rec);
    grouped.set(rec.swarmId, list);
  }
  if (grouped.size === 0) return [];

  const total = Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0);
  const lines = ["", renderSectionTitle("⌬ SWARMS", `${grouped.size} swarms · ${total} agents`, innerW, th, box)];

  // Hoist calculations invariant to the loop
  const cardW = Math.max(28, innerW - 2);
  const contentW = Math.max(1, cardW - 4);
  const actW = Math.max(8, contentW - 38);
  const bottomDash = box.h.repeat(Math.max(0, cardW - 2));

  for (const [swarmId, members] of grouped) {
    const mode = members[0]?.joinMode ?? "group";
    const header = ` ${swarmId} · ${mode} · ${members.length} agents `;
    const dash = box.h.repeat(Math.max(2, cardW - visibleWidth(header) - 2));
    lines.push(` ${th.border}${box.tl}${box.h}${th.reset}${th.highlight}${header}${th.reset}${th.border}${dash}${box.tr}${th.reset}`);
    for (const member of members) {
      focus.set(member.id, baseLine + lines.length);
      const activity = state.agentActivity.get(member.id);
      const selected = state.agents[state.selectedIndex]?.id === member.id;
      const prefix = selected ? `${th.highlight}▶${th.reset}` : " ";
      const checked = state.selectedIds.has(member.id) ? `${th.success}✓${th.reset}` : " ";
      const icon = `${statusColor(member, th)}${statusIcon(member, state.frame)}${th.reset}`;
      const name = fastTruncate(getDisplayName(member.type), 16);
      const act = fastTruncate(activityText(member, activity), actW);
      const stats = agentStats(member, activity);
      lines.push(` ${th.border}${box.l}${th.reset} ${fastTruncate(padVisible(`${prefix}${checked} ${icon} ${th.title}${name}${th.reset}  ${th.muted}${act}${th.reset} ${th.dim}${stats}${th.reset}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`);
    }
    lines.push(` ${th.border}${box.bl}${bottomDash}${box.br}${th.reset}`);
  }
  return lines;
}
