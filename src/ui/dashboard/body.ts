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

  // Window around selected index
  const halfWindow = Math.floor(VIRTUAL_WINDOW / 2);
  const windowStart = Math.max(0, selectedIndex - halfWindow);
  const windowEnd = Math.min(total, selectedIndex + halfWindow);

  // Separate sections in a single pass to avoid O(N) filtering multiple times
  const solo: AgentRecord[] = [];
  const running: AgentRecord[] = [];
  const queued: AgentRecord[] = [];
  const done: AgentRecord[] = [];
  const swarmsSet = new Set<string>();
  const firstSwarmAgentMap = new Map<string, AgentRecord>();

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.swarmId) {
      solo.push(a);
      if (a.status === "running") running.push(a);
      else if (a.status === "queued") queued.push(a);
      else done.push(a);
    } else {
      swarmsSet.add(a.swarmId);
      if (!firstSwarmAgentMap.has(a.swarmId)) {
        firstSwarmAgentMap.set(a.swarmId, a);
      }
    }
  }
  const swarms = Array.from(swarmsSet);

  const lines: string[] = [];

  // Swarm section with virtual scroll for large swarm counts.
  // Swarm count is typically small, so we just show the first SWARM_VIRTUAL_WINDOW
  // when there are too many. selectedIndex is global (not swarm-relative), so we don't
  // try to center the window around it — that would produce incorrect results.
  const SWARM_VIRTUAL_WINDOW = 10;
  const showAllSwarms = swarms.length <= SWARM_VIRTUAL_WINDOW;
  const displaySwarms = showAllSwarms ? swarms : swarms.slice(0, SWARM_VIRTUAL_WINDOW);

  if (swarms.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◆ SWARMS", `${swarms.length} swarms · ${total} agents`, innerW, th, box));
    for (const swarmId of displaySwarms) {
      const first = firstSwarmAgentMap.get(swarmId);
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

  // Running section with virtual window
  if (running.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("▶ RUNNING", `${running.length} active`, innerW, th, box));

    const winRunStart = Math.max(0, windowStart);
    const winRunEnd = Math.min(running.length, windowEnd);
    for (let i = winRunStart; i < winRunEnd; i++) {
      const rec = running[i];
      focusLineByAgentId.set(rec.id, lines.length + 1);
      lines.push(...renderRunningCard(rec, innerW, th, box, state));
    }
    if (winRunStart > 0) {
      lines.push(`  ${th.dim}+ ${winRunStart} earlier running agents${th.reset}`);
    }
    if (winRunEnd < running.length) {
      lines.push(`  ${th.dim}+ ${running.length - winRunEnd} more running agents${th.reset}`);
    }
  }

  // Queued section
  if (queued.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("◔ QUEUED", `${queued.length} queued`, innerW, th, box));
    const winQStart = Math.max(0, windowStart);
    const winQEnd = Math.min(queued.length, windowEnd);
    for (let i = winQStart; i < winQEnd; i++) {
      const rec = queued[i];
      focusLineByAgentId.set(rec.id, lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
    if (winQStart > 0) {
      lines.push(`  ${th.dim}+ ${winQStart} earlier queued${th.reset}`);
    }
    if (winQEnd < queued.length) {
      lines.push(`  ${th.dim}+ ${queued.length - winQEnd} more queued${th.reset}`);
    }
  }

  // Done section — most relevant for inspection, show in chunks
  if (done.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("✓ DONE", `${done.length} finished`, innerW, th, box));

    // Map the global selectedIndex to a done-section-relative index.
    // The global agents array is: [running agents][queued agents][done agents]
    // We need to find which done agent the selectedIndex points to.
    const doneOffset = selectedIndex - running.length - queued.length;
    const halfWindow = Math.floor(VIRTUAL_WINDOW / 2);

    // Window within the done section — always VIRTUAL_WINDOW sized, centered around
    // doneOffset. When doneOffset < 0 (selection in running/queued), show the most recent
    // VIRTUAL_WINDOW agents from the end of the done list (recent history scrollback).
    const winDStart = doneOffset < 0
      ? Math.max(0, done.length - VIRTUAL_WINDOW)
      : Math.max(0, doneOffset - halfWindow);
    const winDEnd = doneOffset < 0
      ? done.length
      : Math.min(done.length, doneOffset + halfWindow);

    const startIdx = winDStart;
    const endIdx = winDEnd;

    for (let i = startIdx; i < endIdx; i++) {
      const rec = done[i];
      focusLineByAgentId.set(rec.id, lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
    if (startIdx > 0) {
      lines.push(`  ${th.dim}+ ${startIdx} earlier finished agents${th.reset}`);
    }
    if (endIdx < done.length) {
      lines.push(`  ${th.dim}+ ${done.length - endIdx} more finished agents${th.reset}`);
    }
  }

  // Virtual scroll indicator
  if (total > VIRTUAL_WINDOW) {
    lines.push("");
    lines.push(`  ${th.dim}◈ ${total} total agents — showing window around selection${th.reset}`);
  }

  return { lines, focusLineByAgentId };
}