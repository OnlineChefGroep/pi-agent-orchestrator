/**
 * agent-tree-renderer.ts — Renders the execution tree view in the TUI dashboard.
 *
 * Displays the agent parent-child hierarchy as a Unicode box-drawing tree,
 * with status indicators, type labels, and optional Mermaid/JSON export hints.
 */

import { buildAgentTreeText } from "../agent-tree.js";
import type { AgentRecord } from "../types.js";
import type { BoxChars, DashboardTheme } from "./theme.js";
import { framedRow } from "./theme.js";

/** Theme color mapping for agent statuses in the tree view. */
function statusColor(rec: AgentRecord, th: DashboardTheme): string {
  switch (rec.status) {
    case "running": return th.success;
    case "queued": return th.highlight;
    case "completed": return th.accent;
    case "steered": return th.accent;
    case "error": return th.error;
    case "aborted": return th.dim;
    case "stopped": return th.dim;
    default: return "";
  }
}

/** Single-character status symbol. */
function statusSymbol(rec: AgentRecord): string {
  switch (rec.status) {
    case "running": return "\u25CF";
    case "queued": return "\u25CB";
    case "completed": return "\u2713";
    case "steered": return "\u2197";
    case "error": return "\u2717";
    case "aborted": return "\u2298";
    case "stopped": return "\u25A0";
    default: return "?";
  }
}

/**
 * Build a single-pass array of tree lines from the pre-generated text tree.
 * Each line is colorized per-agent for display in the dashboard.
 */
function colorizeTreeLine(
  rawLine: string,
  records: AgentRecord[],
  th: DashboardTheme,
): string {
  // Find which agent this line belongs to by matching the id prefix
  for (const rec of records) {
    if (rawLine.includes(rec.id)) {
      const sc = statusColor(rec, th);
      const ss = statusSymbol(rec);
      // Replace status bracket with colored version
      return rawLine.replace(
        `[${rec.status}]`,
        `${th.reset}[${sc}${rec.status}${th.reset}]`,
      ).replace(
        `${rec.id}`,
        `${sc}${ss} ${rec.id}${th.reset}`,
      );
    }
  }
  return rawLine;
}

/**
 * Render the execution tree inside the dashboard viewport.
 *
 * @param innerW - Inner width of the dashboard frame
 * @param th - Dashboard theme colors
 * @param box - Box drawing characters
 * @param records - All agent records to render in the tree
 * @returns Array of rendered lines
 */
export function renderTreeView(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
  records: AgentRecord[],
): string[] {
  const lines: string[] = [];

  // Header
  lines.push(framedRow(`${th.title}Execution Tree${th.reset}${th.dim} \u2014 agent parent\u2192child hierarchy${th.reset}`, innerW, th, box));
  lines.push(framedRow("", innerW, th, box));

  if (records.length === 0) {
    lines.push(framedRow(`${th.dim}  No agents in this session \u2014 spawn an agent to see the tree.${th.reset}`, innerW, th, box));
    return lines;
  }

  // Build the raw text tree
  const rawTree = buildAgentTreeText(records);

  // Colorize each line
  for (const line of rawTree.split("\n")) {
    if (!line.trim()) continue;
    const colorized = colorizeTreeLine(line, records, th);
    lines.push(framedRow(`  ${colorized}`, innerW, th, box));
  }

  return lines;
}

/**
 * Render format selection hints for the tree view.
 * Shown at the bottom of the tree panel.
 */
export function renderTreeFooter(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
): string[] {
  const hints = [
    `${th.dim}Export formats:${th.reset}`,
    `  ${th.accent}y${th.reset} toggle tree view`,
    `  ${th.accent}/agents${th.reset} \u2192 View execution tree \u2192 ${th.accent}Mermaid${th.reset} / ${th.accent}JSON${th.reset} / ${th.accent}Text${th.reset}`,
  ];
  return hints.map((h) => framedRow(h, innerW, th, box));
}
