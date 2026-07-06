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

/** Single-pass counting of agent statuses and unique swarms (capped to a display window). */
function countVirtualAgents(agents: AgentRecord[]): {
  runningCount: number;
  queuedCount: number;
  doneCount: number;
  swarmsCount: number;
  displaySwarms: AgentRecord[];
} {
  let runningCount = 0;
  let queuedCount = 0;
  let doneCount = 0;
  let swarmsCount = 0;
  const seenSwarms: Record<string, boolean> = Object.create(null);
  const displaySwarms: AgentRecord[] = [];

  const SWARM_VIRTUAL_WINDOW = 10;

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.swarmId) {
      if (a.status === "running") runningCount++;
      else if (a.status === "queued") queuedCount++;
      else doneCount++;
    } else if (!seenSwarms[a.swarmId]) {
      seenSwarms[a.swarmId] = true;
      swarmsCount++;
      if (displaySwarms.length < SWARM_VIRTUAL_WINDOW) {
        displaySwarms.push(a);
      }
    }
  }

  return { runningCount, queuedCount, doneCount, swarmsCount, displaySwarms };
}

/** Compute the visible window bounds [start, end) for each status section. */
function computeWindowBounds(
  total: number,
  selectedIndex: number,
  runningCount: number,
  queuedCount: number,
  doneCount: number,
): {
  winRunStart: number;
  winRunEnd: number;
  winQStart: number;
  winQEnd: number;
  winDStart: number;
  winDEnd: number;
} {
  const halfWindow = Math.floor(VIRTUAL_WINDOW / 2);
  const windowStart = Math.max(0, selectedIndex - halfWindow);
  const windowEnd = Math.min(total, selectedIndex + halfWindow);

  const winRunStart = Math.max(0, windowStart);
  const winRunEnd = Math.min(runningCount, windowEnd);

  const winQStart = Math.max(0, windowStart);
  const winQEnd = Math.min(queuedCount, windowEnd);

  const doneOffset = selectedIndex - runningCount - queuedCount;
  const winDStart = doneOffset < 0 ? Math.max(0, doneCount - VIRTUAL_WINDOW) : Math.max(0, doneOffset - halfWindow);
  const winDEnd = doneOffset < 0 ? doneCount : Math.min(doneCount, doneOffset + halfWindow);

  return { winRunStart, winRunEnd, winQStart, winQEnd, winDStart, winDEnd };
}

/** Single-pass extraction of the running/queued/done slices within their windows. */
function sliceWindowedAgents(
  agents: AgentRecord[],
  bounds: {
    winRunStart: number;
    winRunEnd: number;
    winQStart: number;
    winQEnd: number;
    winDStart: number;
    winDEnd: number;
  },
): { runningSlice: AgentRecord[]; queuedSlice: AgentRecord[]; doneSlice: AgentRecord[] } {
  const runningSlice: AgentRecord[] = [];
  const queuedSlice: AgentRecord[] = [];
  const doneSlice: AgentRecord[] = [];

  let rIdx = 0;
  let qIdx = 0;
  let dIdx = 0;

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.swarmId) continue;
    if (a.status === "running") {
      if (rIdx >= bounds.winRunStart && rIdx < bounds.winRunEnd) runningSlice.push(a);
      rIdx++;
    } else if (a.status === "queued") {
      if (qIdx >= bounds.winQStart && qIdx < bounds.winQEnd) queuedSlice.push(a);
      qIdx++;
    } else {
      if (dIdx >= bounds.winDStart && dIdx < bounds.winDEnd) doneSlice.push(a);
      dIdx++;
    }
  }

  return { runningSlice, queuedSlice, doneSlice };
}

const SWARM_VIRTUAL_WINDOW = 10;

/** Render the swarm section header and first-N swarm rows into `lines`. */
function renderVirtualSwarmSection(
  lines: string[],
  swarmsCount: number,
  total: number,
  displaySwarms: AgentRecord[],
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  focusLineByAgentId: Map<string, number>,
): void {
  if (swarmsCount <= 0) return;
  lines.push("");
  lines.push(renderSectionTitle("◆ SWARMS", `${swarmsCount} swarms · ${total} agents`, innerW, th, box));
  for (const first of displaySwarms) {
    focusLineByAgentId.set(first.id, lines.length);
    lines.push(`  ${renderCompactRow(first, innerW - 2, th, state)}`);
  }
  const showAllSwarms = swarmsCount <= SWARM_VIRTUAL_WINDOW;
  if (!showAllSwarms) {
    lines.push(`  ${th.dim}+ ${swarmsCount - SWARM_VIRTUAL_WINDOW} more swarms${th.reset}`);
  } else if (swarmsCount > 5) {
    lines.push(`  ${th.dim}+ ${swarmsCount - 5} more swarms${th.reset}`);
  }
}

/** Render the "earlier/later" overflow hints around a windowed slice. */
function appendWindowOverflow(
  lines: string[],
  winStart: number,
  winEnd: number,
  totalCount: number,
  earlierLabel: string,
  moreLabel: string,
  th: DashboardTheme,
): void {
  if (winStart > 0) {
    lines.push(`  ${th.dim}+ ${winStart} ${earlierLabel}${th.reset}`);
  }
  if (winEnd < totalCount) {
    lines.push(`  ${th.dim}+ ${totalCount - winEnd} ${moreLabel}${th.reset}`);
  }
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

  const { runningCount, queuedCount, doneCount, swarmsCount, displaySwarms } = countVirtualAgents(agents);

  const bounds = computeWindowBounds(total, selectedIndex, runningCount, queuedCount, doneCount);
  const { runningSlice, queuedSlice, doneSlice } = sliceWindowedAgents(agents, bounds);

  const lines: string[] = [];

  renderVirtualSwarmSection(lines, swarmsCount, total, displaySwarms, innerW, th, box, state, focusLineByAgentId);

  // Running section
  if (runningCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("▶ RUNNING", `${runningCount} active`, innerW, th, box));
    for (let i = 0; i < runningSlice.length; i++) {
      const rec = runningSlice[i];
      focusLineByAgentId.set(rec.id, lines.length + 1);
      lines.push(...renderRunningCard(rec, innerW, th, box, state));
    }
    appendWindowOverflow(
      lines,
      bounds.winRunStart,
      bounds.winRunEnd,
      runningCount,
      "earlier running agents",
      "more running agents",
      th,
    );
  }

  // Queued section
  if (queuedCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◔ QUEUED", `${queuedCount} queued`, innerW, th, box));
    for (let i = 0; i < queuedSlice.length; i++) {
      const rec = queuedSlice[i];
      focusLineByAgentId.set(rec.id, lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
    appendWindowOverflow(lines, bounds.winQStart, bounds.winQEnd, queuedCount, "earlier queued", "more queued", th);
  }

  // Done section
  if (doneCount > 0) {
    lines.push("");
    lines.push(renderSectionTitle("✓ DONE", `${doneCount} finished`, innerW, th, box));
    for (let i = 0; i < doneSlice.length; i++) {
      const rec = doneSlice[i];
      focusLineByAgentId.set(rec.id, lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
    appendWindowOverflow(
      lines,
      bounds.winDStart,
      bounds.winDEnd,
      doneCount,
      "earlier finished agents",
      "more finished agents",
      th,
    );
  }

  // Virtual scroll indicator
  if (total > VIRTUAL_WINDOW) {
    lines.push("");
    lines.push(`  ${th.dim}◈ ${total} total agents — showing window around selection${th.reset}`);
  }

  return { lines, focusLineByAgentId };
}
