import type { AgentRecord } from "../../types.js";
import type { BoxChars, DashboardTheme } from "../theme.js";
import { renderCompactRow } from "./compact-row.js";
import { renderRunningCard } from "./running-card.js";
import { renderSectionTitle } from "./section-title.js";
import { renderSwarmSection } from "./swarm-section.js";
import type { DashboardBody, DashboardRenderState } from "./types.js";

/**
 * Virtual scrolling window size — only render agents in this range around the viewport.
 * This keeps rendering O(viewport_height) regardless of total agent count.
 */
const VIRTUAL_WINDOW = 50;

function renderAgentSections(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  focus: Map<string, number>,
  baseLine = 0,
): string[] {
  const solo: AgentRecord[] = [];
  const running: AgentRecord[] = [];
  const queued: AgentRecord[] = [];
  const done: AgentRecord[] = [];

  for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    if (!a.swarmId) {
      solo.push(a);
      if (a.status === "running") running.push(a);
      else if (a.status === "queued") queued.push(a);
      else done.push(a);
    }
  }
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

/**
 * Build dashboard body lines with optional virtual scrolling window.
 *
 * When total agent count exceeds VIRTUAL_WINDOW, only agents within a window
 * around the selected index are fully rendered. This keeps render time O(vh)
 * regardless of how many agents exist (50+ agents no longer block the event loop).
 *
 * @param innerW Inner width for content
 * @param th Dashboard theme
 * @param box Box drawing characters
 * @param state Render state (agents, selection, activity)
 * @returns DashboardBody with lines and focus map
 */
export function buildDashboardBodyLines(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
): DashboardBody {
  const focusLineByAgentId = new Map<string, number>();

  // --- Virtual scroll path: large agent lists use windowed rendering ---
  if (state.agents.length > VIRTUAL_WINDOW) {
    return buildVirtualBodyLines(innerW, th, box, state, focusLineByAgentId);
  }

  // --- Normal path: render all agents (fast for typical counts) ---
  const swarmLines = renderSwarmSection(innerW, th, box, state, focusLineByAgentId);
  const agentLines = renderAgentSections(innerW, th, box, state, focusLineByAgentId, swarmLines.length);
  return { lines: [...swarmLines, ...agentLines], focusLineByAgentId };
}

/**
 * Virtual-scrolled body rendering for large agent lists.
 *
 * Renders only agents within a window around the selected index:
 * - window_start = max(0, selectedIndex - VIRTUAL_WINDOW / 2)
 * - window_end = min(agents.length, selectedIndex + VIRTUAL_WINDOW / 2)
 *
 * Missing agents are represented by compact skeleton lines showing count.
 * This gives O(vh) rendering time even with hundreds of agents.
 */
function buildVirtualBodyLines(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  focusLineByAgentId: Map<string, number>,
): DashboardBody {
  const { agents, selectedIndex } = state;
  const total = agents.length;

  const halfWindow = Math.floor(VIRTUAL_WINDOW / 2);
  const windowStart = Math.max(0, selectedIndex - halfWindow);
  const windowEnd = Math.min(total, selectedIndex + halfWindow);

  let runningCount = 0;
  let queuedCount = 0;
  let doneCount = 0;
  const swarmsSet = new Set<string>();

  for (let i = 0; i < total; i++) {
    const a = agents[i];
    if (!a.swarmId) {
      if (a.status === "running") runningCount++;
      else if (a.status === "queued") queuedCount++;
      else doneCount++;
    } else {
      swarmsSet.add(a.swarmId);
    }
  }

  const swarms = Array.from(swarmsSet);

  const lines: string[] = [];

  const SWARM_VIRTUAL_WINDOW = 10;
  const showAllSwarms = swarms.length <= SWARM_VIRTUAL_WINDOW;
  const displaySwarms = showAllSwarms ? swarms : swarms.slice(0, SWARM_VIRTUAL_WINDOW);

  if (swarms.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◆ SWARMS", `${swarms.length} swarms · ${total} agents`, innerW, th, box));
    for (const swarmId of displaySwarms) {
      let first: AgentRecord | undefined;
      for (let i = 0; i < total; i++) {
        if (agents[i].swarmId === swarmId) {
          first = agents[i];
          break;
        }
      }
      if (first) {
        focusLineByAgentId.set(first.id, lines.length);
        lines.push(`  ${renderCompactRow(first, innerW - 2, th, state)}`);
      }
    }
    if (!showAllSwarms) {
      lines.push(`  ${th.dim}+ ${swarms.length - SWARM_VIRTUAL_WINDOW} more swarms${th.reset}`);
    } else if (swarms.length > 5) {
      lines.push(`  ${th.dim}+ ${swarms.length - 5} more swarms${th.reset}`);
    }
  }

  if (runningCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("▶ RUNNING", `${runningCount} active`, innerW, th, box));

    const winRunStart = Math.max(0, windowStart);
    const winRunEnd = Math.min(runningCount, windowEnd);
    let currentIdx = 0;
    for (let i = 0; i < total; i++) {
      const rec = agents[i];
      if (!rec.swarmId && rec.status === "running") {
        if (currentIdx >= winRunStart && currentIdx < winRunEnd) {
          focusLineByAgentId.set(rec.id, lines.length + 1);
          lines.push(...renderRunningCard(rec, innerW, th, box, state));
        }
        currentIdx++;
        if (currentIdx >= winRunEnd) break;
      }
    }
    if (winRunStart > 0) {
      lines.push(`  ${th.dim}+ ${winRunStart} earlier running agents${th.reset}`);
    }
    if (winRunEnd < runningCount) {
      lines.push(`  ${th.dim}+ ${runningCount - winRunEnd} more running agents${th.reset}`);
    }
  }

  if (queuedCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◔ QUEUED", `${queuedCount} queued`, innerW, th, box));
    const winQStart = Math.max(0, windowStart);
    const winQEnd = Math.min(queuedCount, windowEnd);
    let currentIdx = 0;
    for (let i = 0; i < total; i++) {
      const rec = agents[i];
      if (!rec.swarmId && rec.status === "queued") {
        if (currentIdx >= winQStart && currentIdx < winQEnd) {
          focusLineByAgentId.set(rec.id, lines.length);
          lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
        }
        currentIdx++;
        if (currentIdx >= winQEnd) break;
      }
    }
    if (winQStart > 0) {
      lines.push(`  ${th.dim}+ ${winQStart} earlier queued${th.reset}`);
    }
    if (winQEnd < queuedCount) {
      lines.push(`  ${th.dim}+ ${queuedCount - winQEnd} more queued${th.reset}`);
    }
  }

  if (doneCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("✓ DONE", `${doneCount} finished`, innerW, th, box));

    const doneOffset = selectedIndex - runningCount - queuedCount;

    const winDStart = doneOffset < 0
      ? Math.max(0, doneCount - VIRTUAL_WINDOW)
      : Math.max(0, doneOffset - halfWindow);
    const winDEnd = doneOffset < 0
      ? doneCount
      : Math.min(doneCount, doneOffset + halfWindow);

    const startIdx = winDStart;
    const endIdx = winDEnd;

    let currentIdx = 0;
    for (let i = 0; i < total; i++) {
      const rec = agents[i];
      if (!rec.swarmId && rec.status !== "running" && rec.status !== "queued") {
        if (currentIdx >= startIdx && currentIdx < endIdx) {
          focusLineByAgentId.set(rec.id, lines.length);
          lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
        }
        currentIdx++;
        if (currentIdx >= endIdx) break;
      }
    }
    if (startIdx > 0) {
      lines.push(`  ${th.dim}+ ${startIdx} earlier finished agents${th.reset}`);
    }
    if (endIdx < doneCount) {
      lines.push(`  ${th.dim}+ ${doneCount - endIdx} more finished agents${th.reset}`);
    }
  }

  if (total > VIRTUAL_WINDOW) {
    lines.push("");
    lines.push(`  ${th.dim}◈ ${total} total agents — showing window around selection${th.reset}`);
  }

  return { lines, focusLineByAgentId };
}