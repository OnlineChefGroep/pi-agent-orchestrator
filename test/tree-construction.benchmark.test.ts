import { describe, expect, it } from "vitest";
import { buildExecutionTree } from "../src/output-handler.js";
import type { AgentRecord } from "../src/types.js";

// Generate test data
function generateRecords(count: number, maxDepth: number = 5): AgentRecord[] {
  const records: AgentRecord[] = [];

  for (let i = 0; i < count; i++) {
    // Top level
    if (i % maxDepth === 0) {
      records.push({
        id: `agent-${i}`,
        type: "general-purpose",
        description: `Agent ${i}`,
        status: "completed",
        spawnedAt: 1000 + i,
        startedAt: 1001 + i,
        toolUses: 0,
        currentLevel: 0,
        totalSpawned: 0,
        compactionCount: 0,
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 }
      });
    } else {
      // Child
      const parentId = `agent-${i - 1}`;
      records.push({
        id: `agent-${i}`,
        type: "general-purpose",
        description: `Agent ${i}`,
        status: "completed",
        parentId: parentId,
        spawnedAt: 1000 + i,
        startedAt: 1001 + i,
        toolUses: 0,
        currentLevel: i % maxDepth,
        totalSpawned: 0,
        compactionCount: 0,
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 }
      });
    }
  }

  return records;
}

describe("Performance: buildExecutionTree", () => {
  it("builds text tree for 1000 records", () => {
    const records = generateRecords(1000);
    const start = performance.now();
    const result = buildExecutionTree(records, "text");
    const end = performance.now();

    console.log(`1000 records: ${end - start} ms`);
    expect(result).toContain("agent-999");
  });

  it("builds text tree for 5000 records", () => {
    const records = generateRecords(5000);
    const start = performance.now();
    const result = buildExecutionTree(records, "text");
    const end = performance.now();

    console.log(`5000 records: ${end - start} ms`);
    expect(result).toContain("agent-4999");
  });

  it("builds text tree for 10000 records", () => {
    const records = generateRecords(10000);
    const start = performance.now();
    const result = buildExecutionTree(records, "text");
    const end = performance.now();

    console.log(`10000 records: ${end - start} ms`);
    expect(result).toContain("agent-9999");
  });
});
