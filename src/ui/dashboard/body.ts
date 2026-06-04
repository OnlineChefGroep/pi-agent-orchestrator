import type { AgentRecord } from "../../types.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { renderCompactRow } from "./compact-row.js";
import { renderRunningCard } from "./running-card.js";
import { renderSectionTitle } from "./section-title.js";
import { renderSwarmSection } from "./swarm-section.js";
import type { DashboardBody, DashboardRenderState } from "./types.js";

function renderAgentSections(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  focus: Map<string, number>,
  baseLine = 0,
): string[] {
  const solo = state.agents.filter(a => !a.swarmId);
  const running = solo.filter(a => a.status === "running");
  const queued = solo.filter(a => a.status === "queued");
  const done = solo.filter(a => a.status !== "running" && a.status !== "queued");
  const lines: string[] = [];
  const appendCompact = (label: string, records: AgentRecord[]) => {
    if (records.length === 0) return;
    lines.push("");
    lines.push(renderSectionTitle(label, `${records.length}`, innerW, th, box));
    for (const rec of records) {
      focus.set(rec.id, baseLine + lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
  };

  if (running.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("▶ RUNNING", `${running.length} active`, innerW, th, box));
    for (const rec of running) {
      focus.set(rec.id, baseLine + lines.length + 1);
      lines.push(...renderRunningCard(rec, innerW, th, box, state));
    }
  }
  appendCompact("◔ QUEUED", queued);
  appendCompact("✓ DONE", done);
  return lines;
}

export function buildDashboardBodyLines(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
): DashboardBody {
  const focusLineByAgentId = new Map<string, number>();
  const swarmLines = renderSwarmSection(innerW, th, box, state, focusLineByAgentId);
  const agentLines = renderAgentSections(innerW, th, box, state, focusLineByAgentId, swarmLines.length);
  return { lines: [...swarmLines, ...agentLines], focusLineByAgentId };
}
