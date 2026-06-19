import { describe, expect, it } from "vitest";
import { buildAgentTreeJson, buildAgentTreeMermaid, buildAgentTreeText } from "../src/agent-tree.js";
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

    it("renders parent-child relationships using parentId", () => {
      const parent = createMockRecord({ id: "parent-1", spawnedAt: 1000 });
      const child1 = createMockRecord({ id: "child-1", parentId: "parent-1", spawnedAt: 2000 });
      const child2 = createMockRecord({ id: "child-2", parentId: "parent-1", spawnedAt: 3000 });

      const result = buildAgentTreeMermaid([child2, parent, child1]); // Out of order to test sorting

      expect(result).toContain('parent_1["parent-1<br/>general-purpose<br/>running<br/>test description"]');
      expect(result).toContain('child_1["child-1<br/>general-purpose<br/>running<br/>test description"]');
      expect(result).toContain('child_2["child-2<br/>general-purpose<br/>running<br/>test description"]');

      expect(result).toContain("parent_1 --> child_1");
      expect(result).toContain("parent_1 --> child_2");
    });

    it("adds dashed edges for groupId distinct from parentId", () => {
      const group = createMockRecord({ id: "swarm-leader", spawnedAt: 1000 });
      const member = createMockRecord({
        id: "swarm-member",
        parentId: "other-parent",
        groupId: "swarm-leader",
        spawnedAt: 2000,
      });
      const otherParent = createMockRecord({ id: "other-parent", spawnedAt: 500 });

      const result = buildAgentTreeMermaid([group, member, otherParent]);

      // parentId edge (solid)
      expect(result).toContain("other_parent --> swarm_member");
      // groupId edge (dashed)
      expect(result).toContain("swarm_leader -.-> swarm_member");
      // Two roots (group + otherParent) → Session node should appear
      expect(result).toContain('session["Session"]');
    });

    it("skips dashed groupId edge when it duplicates parentId", () => {
      const parent = createMockRecord({ id: "parent", spawnedAt: 1000 });
      const child = createMockRecord({
        id: "child",
        parentId: "parent",
        groupId: "parent",  // same as parentId → no duplicate dashed edge
        spawnedAt: 2000,
      });

      const result = buildAgentTreeMermaid([parent, child]);

      // Solid parentId edge should exist
      expect(result).toContain("parent --> child");
      // Dashed edge must NOT appear (would be a duplicate)
      expect(result).not.toContain("parent -.-> child");
    });

    it("adds a virtual Session node when there are multiple roots", () => {
      const root1 = createMockRecord({ id: "root-1", spawnedAt: 1000 });
      const root2 = createMockRecord({ id: "root-2", spawnedAt: 2000 });
      const root3 = createMockRecord({ id: "root-3", spawnedAt: 3000 });

      const result = buildAgentTreeMermaid([root1, root2, root3]);

      // Virtual session node
      expect(result).toContain('session["Session"]');
      expect(result).toContain("session --> root_1");
      expect(result).toContain("session --> root_2");
      expect(result).toContain("session --> root_3");
    });

    it("does not add Session node for a single root", () => {
      const root = createMockRecord({ id: "only-root", spawnedAt: 1000 });

      const result = buildAgentTreeMermaid([root]);

      expect(result).not.toContain('session["Session"]');
      expect(result).not.toContain("session -->");
    });

    it("adds Session node for roots with parents outside the tree", () => {
      // Two agents with parentId pointing to an agent NOT in this record set —
      // they become roots, so Session connects them.
      const orphan1 = createMockRecord({ id: "orphan-1", parentId: "deleted-parent", spawnedAt: 1000 });
      const orphan2 = createMockRecord({ id: "orphan-2", parentId: "deleted-parent", spawnedAt: 2000 });

      const result = buildAgentTreeMermaid([orphan1, orphan2]);

      expect(result).toContain('session["Session"]');
      expect(result).toContain("session --> orphan_1");
      expect(result).toContain("session --> orphan_2");
    });
  });

  describe("buildAgentTreeJson", () => {
    it("returns empty JSON array when records array is empty", () => {
      const result = buildAgentTreeJson([]);
      expect(result).toBe("[]");
    });

    it("maps a single agent record to a root node with empty children", () => {
      const record = createMockRecord({
        id: "agent-123",
        type: "Explore",
        description: "Exploring files",
        status: "completed",
      });

      const result = buildAgentTreeJson([record]);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "agent-123",
        type: "Explore",
        description: "Exploring files",
        status: "completed",
        children: [],
      });
    });

    it("builds a hierarchical tree using parentId relationships", () => {
      const parent = createMockRecord({ id: "root", type: "Explore", description: "Root", status: "running" });
      const child = createMockRecord({ id: "child", type: "Plan", description: "Child", status: "completed", parentId: "root" });
      const grandchild = createMockRecord({ id: "gc", type: "Explore", description: "Grandchild", status: "running", parentId: "child" });

      const result = buildAgentTreeJson([grandchild, parent, child]); // Out of order
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("root");
      expect(parsed[0].children).toHaveLength(1);
      expect(parsed[0].children[0].id).toBe("child");
      expect(parsed[0].children[0].children).toHaveLength(1);
      expect(parsed[0].children[0].children[0].id).toBe("gc");
      expect(parsed[0].children[0].children[0].children).toEqual([]);
    });
  });

  describe("buildAgentTreeText", () => {
    it("returns empty message when records array is empty", () => {
      const result = buildAgentTreeText([]);
      expect(result).toBe("No execution tree available.");
    });

    it("renders a single agent without tree branches", () => {
      const record = createMockRecord({ id: "agent-1", type: "Explore", status: "running" });
      const result = buildAgentTreeText([record]);
      expect(result).toContain("agent-1 (Explore) [running]");
      expect(result).not.toContain("\u251C");
      expect(result).not.toContain("\u2514");
    });

    it("renders a parent-child hierarchy with branch characters", () => {
      const parent = createMockRecord({ id: "root", type: "Explore", status: "running" });
      const child1 = createMockRecord({ id: "child-1", type: "Plan", status: "completed", parentId: "root" });
      const child2 = createMockRecord({ id: "child-2", type: "Plan", status: "queued", parentId: "root" });

      const result = buildAgentTreeText([parent, child1, child2]);

      expect(result).toContain("root (Explore) [running]");
      expect(result).toContain("\u251C\u2500 child-1 (Plan) [completed]");
      expect(result).toContain("\u2514\u2500 child-2 (Plan) [queued]");
    });

    it("renders a deeply nested tree with correct indentation", () => {
      const root = createMockRecord({ id: "root", type: "Explore", status: "running" });
      const a = createMockRecord({ id: "a", type: "Plan", status: "completed", parentId: "root" });
      const b = createMockRecord({ id: "b", type: "Explore", status: "running", parentId: "a" });

      const result = buildAgentTreeText([root, a, b]);

      expect(result).toContain("root (Explore) [running]");
      expect(result).toContain("\u2514\u2500 a (Plan) [completed]");
      expect(result).toContain("   \u2514\u2500 b (Explore) [running]");
    });
  });
});
