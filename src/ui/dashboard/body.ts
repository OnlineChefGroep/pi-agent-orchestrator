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

  const SWARM_VIRTUAL_WINDOW = 10;
  let totalSwarms = 0;
  const seenSwarms: Record<string, boolean> = Object.create(null);
  const displaySwarms: AgentRecord[] = [];

  for (let i = 0; i < total; i++) {
    const a = agents[i];
    const sId = a.swarmId;
    if (sId !== undefined) {
      if (seenSwarms[sId] === undefined) {
        seenSwarms[sId] = true;
        totalSwarms++;
        if (displaySwarms.length < SWARM_VIRTUAL_WINDOW) {
          displaySwarms.push(a);
        }
      }
    } else {
      const s = a.status;
      if (s === "running") runningCount++;
      else if (s === "queued") queuedCount++;
      else doneCount++;
    }
  }

  const winRunStart = Math.max(0, windowStart);
  const winRunEnd = Math.min(runningCount, windowEnd);

  const winQStart = Math.max(0, windowStart);
  const winQEnd = Math.min(queuedCount, windowEnd);

  const doneOffset = selectedIndex - runningCount - queuedCount;
  const winDStart = doneOffset < 0
    ? Math.max(0, doneCount - VIRTUAL_WINDOW)
    : Math.max(0, doneOffset - halfWindow);
  const winDEnd = doneOffset < 0
    ? doneCount
    : Math.min(doneCount, doneOffset + halfWindow);

  const lines: string[] = [];

  if (totalSwarms > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◆ SWARMS", `${totalSwarms} swarms · ${total} agents`, innerW, th, box));
    for (let i = 0; i < displaySwarms.length; i++) {
      const first = displaySwarms[i];
      focusLineByAgentId.set(first.id, lines.length);
      lines.push(`  ${renderCompactRow(first, innerW - 2, th, state)}`);
    }
    if (totalSwarms > SWARM_VIRTUAL_WINDOW) {
      lines.push(`  ${th.dim}+ ${totalSwarms - SWARM_VIRTUAL_WINDOW} more swarms${th.reset}`);
    } else if (totalSwarms > 5) {
      lines.push(`  ${th.dim}+ ${totalSwarms - 5} more swarms${th.reset}`);
    }
  }

  if (runningCount > 0 || queuedCount > 0 || doneCount > 0) {
      let rIdx = 0;
      let qIdx = 0;
      let dIdx = 0;

      // Instead of an intermediate array, just push directly when in window bounds!
      // But wait! We need to output all RUNNING, then all QUEUED, then all DONE.
      // Since agents can be interleaved in the global list, we DO need some way to group them.
      // But we only ever need to store the items IN the window, which is max VIRTUAL_WINDOW.

      const rcMax = Math.max(0, winRunEnd - winRunStart);
      const qcMax = Math.max(0, winQEnd - winQStart);
      const dcMax = Math.max(0, winDEnd - winDStart);

      const runNodes: AgentRecord[] = new Array(rcMax);
      const queNodes: AgentRecord[] = new Array(qcMax);
      const doneNodes: AgentRecord[] = new Array(dcMax);

      let rc = 0;
      let qc = 0;
      let dc = 0;

      for (let i = 0; i < total; i++) {
        const a = agents[i];
        if (a.swarmId === undefined) {
          const s = a.status;
          if (s === "running") {
            if (rIdx >= winRunStart && rIdx < winRunEnd) runNodes[rc++] = a;
            rIdx++;
          } else if (s === "queued") {
            if (qIdx >= winQStart && qIdx < winQEnd) queNodes[qc++] = a;
            qIdx++;
          } else {
            if (dIdx >= winDStart && dIdx < winDEnd) doneNodes[dc++] = a;
            dIdx++;
          }
        }
      }

      if (runningCount > 0) {
        lines.push("");
        lines.push(renderSectionTitle("▶ RUNNING", `${runningCount} active`, innerW, th, box));
        for (let i = 0; i < rcMax; i++) {
            const a = runNodes[i];
            focusLineByAgentId.set(a.id, lines.length + 1);
            lines.push(...renderRunningCard(a, innerW, th, box, state));
        }
        if (winRunStart > 0) lines.push(`  ${th.dim}+ ${winRunStart} earlier running agents${th.reset}`);
        if (winRunEnd < runningCount) lines.push(`  ${th.dim}+ ${runningCount - winRunEnd} more running agents${th.reset}`);
      }

      if (queuedCount > 0) {
        lines.push("");
        lines.push(renderSectionTitle("◔ QUEUED", `${queuedCount} queued`, innerW, th, box));
        for (let i = 0; i < qcMax; i++) {
            const a = queNodes[i];
            focusLineByAgentId.set(a.id, lines.length);
            lines.push(`  ${renderCompactRow(a, innerW - 2, th, state)}`);
        }
        if (winQStart > 0) lines.push(`  ${th.dim}+ ${winQStart} earlier queued${th.reset}`);
        if (winQEnd < queuedCount) lines.push(`  ${th.dim}+ ${queuedCount - winQEnd} more queued${th.reset}`);
      }

      if (doneCount > 0) {
        lines.push("");
        lines.push(renderSectionTitle("✓ DONE", `${doneCount} finished`, innerW, th, box));
        for (let i = 0; i < dcMax; i++) {
            const a = doneNodes[i];
            focusLineByAgentId.set(a.id, lines.length);
            lines.push(`  ${renderCompactRow(a, innerW - 2, th, state)}`);
        }
        if (winDStart > 0) lines.push(`  ${th.dim}+ ${winDStart} earlier finished agents${th.reset}`);
        if (winDEnd < doneCount) lines.push(`  ${th.dim}+ ${doneCount - winDEnd} more finished agents${th.reset}`);
      }
  }

  if (total > VIRTUAL_WINDOW) {
    lines.push("");
    lines.push(`  ${th.dim}◈ ${total} total agents — showing window around selection${th.reset}`);
  }

  return { lines, focusLineByAgentId };
}