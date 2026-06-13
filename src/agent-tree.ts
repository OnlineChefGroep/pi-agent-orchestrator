/**
 * tree-builder.ts — Visual and JSON representations for Agent swarms.
 */

import type { AgentRecord } from "./types.js";

/**
 * Formats a clean label string for Mermaid charts.
 */
function label(record: AgentRecord): string {
  const safeDescription = record.description.replace(/["\n\r]/g, " ").trim();
  return `${record.id}<br/>${record.type}<br/>${record.status}<br/>${safeDescription}`;
}

/**
 * Builds a Mermaid Flowchart definition mapping the hierarchy of agents.
 */
export function buildAgentTreeMermaid(records: AgentRecord[]): string {
  const sorted = [...records].sort((a, b) => a.spawnedAt - b.spawnedAt);
  const lines = ["flowchart TD"];
  
  if (sorted.length === 0) {
    lines.push('  empty["No agents in this session"]');
    return lines.join("\n");
  }

  // Group by groupId to avoid O(N^2) complexity
  const childrenMap = new Map<string, AgentRecord[]>();

  // Pre-calculate node declarations and build relationships map
  for (const record of sorted) {
    lines.push(`  ${record.id.replace(/-/g, "_")}["${label(record)}"]`);
    if (record.groupId) {
      if (!childrenMap.has(record.groupId)) {
        childrenMap.set(record.groupId, []);
      }
      childrenMap.get(record.groupId)!.push(record);
    }
  }
  
  // NOTE: A duplicate loop over `sorted` to build childrenMap was removed here to prevent 
  // duplicate edge generation in the resulting Mermaid chart.

  // Add edges mapping parents to children
  for (const record of sorted) {
    const children = childrenMap.get(record.id) || [];
    for (const child of children) {
      lines.push(`  ${record.id.replace(/-/g, "_")} --> ${child.id.replace(/-/g, "_")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generates a clean JSON array of essential agent states for logging/UI.
 */
export function buildAgentTreeJson(records: AgentRecord[]): string {
  return JSON.stringify(
    records.map((record) => ({
      id: record.id,
      type: record.type,
      description: record.description,
      status: record.status,
      spawnedAt: record.spawnedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      currentLevel: record.currentLevel,
      totalSpawned: record.totalSpawned,
      groupId: record.groupId,
      swarmId: record.swarmId,
      joinMode: record.joinMode,
    })),
    null,
    2,
  );
}