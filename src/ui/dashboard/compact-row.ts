import type { AgentRecord } from "../../types.js";
import { getDisplayName } from "../agent-format.js";
import type { DashboardTheme } from "../theme.js";
import { fastTruncate } from "../theme.js";
import { activityText, agentStats, statusColor, statusIcon } from "./helpers.js";
import type { DashboardRenderState } from "./types.js";

export function renderCompactRow(
  rec: AgentRecord,
  innerW: number,
  th: DashboardTheme,
  state: DashboardRenderState,
): string {
  const activity = state.agentActivity.get(rec.id);
  const selected = state.agents[state.selectedIndex]?.id === rec.id;
  const checked = state.selectedIds.has(rec.id) ? `${th.success}✓${th.reset}` : " ";
  const pointer = selected ? `${th.highlight}▶${th.reset}` : " ";
  const icon = `${statusColor(rec, th)}${statusIcon(rec, state.frame)}${th.reset}`;
  const name = fastTruncate(getDisplayName(rec.type), 18);
  const thinking = rec.invocation?.thinking ? ` ${th.dim}🧠${rec.invocation.thinking}${th.reset}` : "";
  const desc = fastTruncate(rec.description || activityText(rec, activity), Math.max(12, innerW - 54));
  const stats = agentStats(rec, activity);
  return fastTruncate(
    `${pointer}${checked} ${icon} ${th.title}${name}${th.reset}${thinking}  ${th.muted}${desc}${th.reset} ${th.dim}· ${stats}${th.reset}`,
    innerW,
  );
}
