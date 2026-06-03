import { describe, expect, it } from "vitest";
import { buildAgentTreeJson, buildAgentTreeMermaid } from "../src/agent-tree.js";
import type { AgentRecord } from "../src/types.js";

// Helper to create basic mock AgentRecord
function createMockRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "test-id",
    type: "general-purpose",
    description: "test description",
    status: "running",
    spawnedAt: 1000,
    startedAt: 1001,
    toolUses: 0,
    currentLevel: 0,
    totalSpawned: 0,
    compactionCount: 0,
    lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
    ...overrides,
  };
}

describe("agent-tree", () => {
  describe("buildAgentTreeMermaid", () => {
    it("returns empty session message when records array is empty", () => {
      const result = buildAgentTreeMermaid([]);
      expect(result).toContain("flowchart TD");
      expect(result).toContain('empty["No agents in this session"]');
    });

    it("renders a single agent record correctly", () => {
      const record = createMockRecord({ id: "agent-1", spawnedAt: 1000 });
      const result = buildAgentTreeMermaid([record]);
      expect(result).toContain("flowchart TD");
      expect(result).toContain('agent_1["agent-1<br/>general-purpose<br/>running<br/>test description"]');
    });

    it("sanitizes quotes and newlines in descriptions", () => {
      const record = createMockRecord({
        id: "agent-dirty",
        description: 'Line 1\nLine 2\rLine 3 with "quotes"',
      });
      const result = buildAgentTreeMermaid([record]);
      expect(result).toContain('agent_dirty["agent-dirty<br/>general-purpose<br/>running<br/>Line 1 Line 2 Line 3 with  quotes"]');
    });

    it("replaces hyphens with underscores in IDs for Mermaid nodes", () => {
      const record = createMockRecord({ id: "my-cool-agent-id" });
      const result = buildAgentTreeMermaid([record]);
      expect(result).toContain('my_cool_agent_id["my-cool-agent-id<br/>general-purpose<br/>running<br/>test description"]');
    });

    it("renders parent-child relationships using groupId", () => {
      const parent = createMockRecord({ id: "parent-1", spawnedAt: 1000 });
      const child1 = createMockRecord({ id: "child-1", groupId: "parent-1", spawnedAt: 2000 });
      const child2 = createMockRecord({ id: "child-2", groupId: "parent-1", spawnedAt: 3000 });

      const result = buildAgentTreeMermaid([child2, parent, child1]); // Out of order to test sorting

      expect(result).toContain('parent_1["parent-1<br/>general-purpose<br/>running<br/>test description"]');
      expect(result).toContain('child_1["child-1<br/>general-purpose<br/>running<br/>test description"]');
      expect(result).toContain('child_2["child-2<br/>general-purpose<br/>running<br/>test description"]');

      expect(result).toContain("parent_1 --> child_1");
      expect(result).toContain("parent_1 --> child_2");
    });
  });

  describe("buildAgentTreeJson", () => {
    it("returns empty JSON array when records array is empty", () => {
      const result = buildAgentTreeJson([]);
      expect(result).toBe("[]");
    });

    it("maps agent records to the correct JSON structure", () => {
      const record = createMockRecord({
        id: "agent-123",
        type: "Explore",
        description: "Exploring files",
        status: "completed",
        spawnedAt: 1000,
        startedAt: 1001,
        completedAt: 2000,
        currentLevel: 1,
        totalSpawned: 5,
        groupId: "group-456",
        swarmId: "swarm-789",
        joinMode: "async",
      });

      const result = buildAgentTreeJson([record]);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "agent-123",
        type: "Explore",
        description: "Exploring files",
        status: "completed",
        spawnedAt: 1000,
        startedAt: 1001,
        completedAt: 2000,
        currentLevel: 1,
        totalSpawned: 5,
        groupId: "group-456",
        swarmId: "swarm-789",
        joinMode: "async",
      });
    });
  });
});
