/**
 * agent-tree-renderer.ts — Renders the execution tree view in the TUI dashboard.
 *
 * Displays the agent parent-child hierarchy as a Unicode box-drawing tree,
 * with status indicators, type labels, and optional Mermaid/JSON export hints.
 */

import { buildTree } from "../agent-tree.js";
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
 * Render the execution tree inside the dashboard viewport.
 * Uses an O(N) inline traversal to build colorized tree lines without
 * redundant string allocation or slow N^2 line-matching lookups.
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

  const { roots, childrenMap, nodeMap } = buildTree(records);

  const renderNode = (nodeId: string, indent: string, isLast: boolean): void => {
    const r = nodeMap.get(nodeId);
    if (!r) return;

    const branch = indent ? (isLast ? "\u2514\u2500 " : "\u251C\u2500 ") : "";

    const sc = statusColor(r, th);
    const ss = statusSymbol(r);

    const colorizedId = `${sc}${ss} ${r.id}${th.reset}`;
    const colorizedStatus = `${th.reset}[${sc}${r.status}${th.reset}]`;

    const rawLine = `${indent}${branch}${colorizedId} (${r.type}) ${colorizedStatus}`;
    lines.push(framedRow(`  ${rawLine}`, innerW, th, box));

    const children = childrenMap.get(nodeId) || [];
    for (let i = 0; i < children.length; i++) {
      const cont = indent + (isLast ? "   " : "\u2502  ");
      renderNode(children[i].id, cont, i === children.length - 1);
    }
  };

  for (let i = 0; i < roots.length; i++) {
    renderNode(roots[i].id, "", i === roots.length - 1);
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
