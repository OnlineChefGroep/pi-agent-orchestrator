/**
 * agent-tree.ts — Visual and JSON representations for Agent swarms.
 *
 * Provides three export formats (all using parentId for hierarchy):
 *   - `buildAgentTreeMermaid` — Mermaid flowchart diagram
 *   - `buildAgentTreeText`    — Unicode box-drawing text tree
 *   - `buildAgentTreeJson`    — Structured JSON hierarchy
 */

import type { AgentRecord } from "./types.js";

/**
 * Formats a clean label string for Mermaid/visual charts.
 */
function label(record: AgentRecord): string {
  const safeDescription = record.description.replace(/["\n\r]/g, " ").trim();
  return `${record.id}<br/>${record.type}<br/>${record.status}<br/>${safeDescription}`;
}

/**
 * Build a tree of AgentRecords using parentId relationships.
 * Returns root nodes and a children map for efficient traversal.
 */
function buildTree(records: AgentRecord[]): {
  roots: AgentRecord[];
  childrenMap: Map<string, AgentRecord[]>;
  nodeMap: Map<string, AgentRecord>;
} {
  const roots: AgentRecord[] = [];
  const childrenMap = new Map<string, AgentRecord[]>();
  const nodeMap = new Map<string, AgentRecord>();

  for (const r of records) {
    nodeMap.set(r.id, r);
  }

  for (const r of records) {
    if (r.parentId && nodeMap.has(r.parentId)) {
      if (!childrenMap.has(r.parentId)) {
        childrenMap.set(r.parentId, []);
      }
      childrenMap.get(r.parentId)!.push(r);
    } else {
      roots.push(r);
    }
  }

  return { roots, childrenMap, nodeMap };
}

/**
 * Builds a Mermaid Flowchart definition mapping the agent hierarchy.
 * Uses parentId relationships (same as text and JSON formats).
 */
export function buildAgentTreeMermaid(records: AgentRecord[]): string {
  const sorted = [...records].sort((a, b) => a.spawnedAt - b.spawnedAt);
  const lines = ["flowchart TD"];

  if (sorted.length === 0) {
    lines.push('  empty["No agents in this session"]');
    return lines.join("\n");
  }

  // Use the shared buildTree helper for parentId-based hierarchy
  const { roots, childrenMap, nodeMap } = buildTree(sorted);

  // Node declarations for all agents
  for (const record of sorted) {
    lines.push(`  ${record.id.replace(/-/g, "_")}["${label(record)}"]`);
  }

  // Edges: parent → child (using parentId from buildTree)
  for (const [parentId, children] of childrenMap) {
    for (const child of children) {
      lines.push(`  ${parentId.replace(/-/g, "_")} --> ${child.id.replace(/-/g, "_")}`);
    }
  }

  // Also add edges for groupId (swarm/group membership) as dashed lines
  for (const record of sorted) {
    if (record.groupId && nodeMap.has(record.groupId)) {
      // Avoid duplicate edges when parentId === groupId
      const alreadyHasParentEdge = record.parentId === record.groupId;
      if (!alreadyHasParentEdge) {
        lines.push(`  ${record.groupId.replace(/-/g, "_")} -.-> ${record.id.replace(/-/g, "_")}`);
      }
    }
  }

  // Show root nodes that have no groupId — link from a virtual "session" node
  if (roots.length > 1) {
    lines.push('  session["Session"]');
    for (const root of roots) {
      lines.push(`  session --> ${root.id.replace(/-/g, "_")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a plain-text Unicode box-drawing tree of the agent hierarchy.
 * Uses parentId relationships to determine the tree structure.
 *
 * Example output:
 *   agent-1 (Explore) [running]
 *   ├─ agent-2 (Plan) [completed]
 *   │  └─ agent-4 (Explore) [running]
 *   └─ agent-3 (Analysis) [queued]
 */
export function buildAgentTreeText(records: AgentRecord[]): string {
  if (records.length === 0) return "No execution tree available.";

  const { roots, childrenMap, nodeMap } = buildTree(records);

  let out = "";
  const render = (nodeId: string, indent: string, isLast: boolean): void => {
    const r = nodeMap.get(nodeId);
    if (!r) return;
    const branch = indent ? (isLast ? "\u2514\u2500 " : "\u251C\u2500 ") : "";
    out += `${indent}${branch}${r.id} (${r.type}) [${r.status}]\n`;
    const children = childrenMap.get(nodeId) || [];
    for (let i = 0; i < children.length; i++) {
      // Continuation indent: "   " (last sibling) or "│  " (more siblings follow).
      // Always compute it — children of a root (indent="") still need indent.
      const cont = indent + (isLast ? "   " : "\u2502  ");
      render(children[i].id, cont, i === children.length - 1);
    }
  };

  for (let i = 0; i < roots.length; i++) {
    render(roots[i].id, "", i === roots.length - 1);
  }
  return out;
}

/**
 * Generates a clean JSON array of agent tree nodes with children.
 * Each root node recursively contains its descendants.
 */
export function buildAgentTreeJson(records: AgentRecord[]): string {
  interface TreeNode {
    id: string;
    type: string;
    status: string;
    description: string;
    children: TreeNode[];
  }

  const { roots, childrenMap } = buildTree(records);

  const toNode = (r: AgentRecord): TreeNode => {
    const childRecords = childrenMap.get(r.id) || [];
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      description: r.description,
      children: childRecords.map(toNode),
    };
  };

  return JSON.stringify(roots.map(toNode), null, 2);
}
