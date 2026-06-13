import { describe, expect, it } from "vitest";

import type { AgentRecord } from "../src/types.js";

/**
 * Pure function test: buildExecutionTree
 *
 * Inlined from src/output-handler.ts for testability.
 * The function has zero runtime dependencies beyond string operations.
 */
function buildExecutionTree(records: AgentRecord[], format: "text" | "mermaid" | "json"): string {
  type TreeNode = { id: string; type: string; status: string; description: string; children: TreeNode[] };

  if (format === "json") {
    const roots: TreeNode[] = [];
    const map = new Map<string, TreeNode>();
    for (const r of records) {
      map.set(r.id, { id: r.id, type: r.type, status: r.status, description: r.description, children: [] });
    }
    for (const r of records) {
      const node = map.get(r.id)!;
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return JSON.stringify(roots, null, 2);
  }

  if (format === "mermaid") {
    const mermaidParts: string[] = ["graph TD\n"];
    for (const r of records) {
      const cleanType = r.type.replace(/"/g, "'");
      mermaidParts.push(`  ${r.id.replace(/-/g, "_")}["[${cleanType}] ${r.id}"]\n`);
      if (r.parentId) {
        mermaidParts.push(`  ${r.parentId.replace(/-/g, "_")} --> ${r.id.replace(/-/g, "_")}\n`);
      }
    }
    return mermaidParts.join("");
  }

  if (format === "text") {
    const roots: AgentRecord[] = [];
    const childrenMap = new Map<string, AgentRecord[]>();
    const nodeMap = new Map<string, AgentRecord>();

    for (const r of records) {
      nodeMap.set(r.id, r);
      if (!r.parentId) {
        roots.push(r);
      } else {
        if (!childrenMap.has(r.parentId)) {
          childrenMap.set(r.parentId, []);
        }
        childrenMap.get(r.parentId)!.push(r);
      }
    }

    let out = "";
    const render = (nodeId: string, indent: string, isLast: boolean) => {
      const r = nodeMap.get(nodeId);
      if (!r) return;
      const branch = indent ? (isLast ? "└─ " : "├─ ") : "";
      out += `${indent}${branch}${r.id} (${r.type}) [${r.status}]\n`;
      const children = childrenMap.get(nodeId) || [];
      for (let i = 0; i < children.length; i++) {
        render(children[i].id, indent + (indent ? (isLast ? "   " : "│  ") : ""), i === children.length - 1);
      }
    };
    for (let i = 0; i < roots.length; i++) {
      render(roots[i].id, "", i === roots.length - 1);
    }
    return out || "No execution tree available.";
  }

  return "";
}

function makeRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    type: "Explore",
    status: "completed",
    description: "Searched files",
    spawnedAt: Date.now(),
    swarmId: undefined,
    handoff: undefined,
    invocation: undefined,
    compactionCount: 0,
    toolUses: 0,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    ...overrides,
  } as AgentRecord;
}

describe("buildExecutionTree", () => {
  describe("json format", () => {
    it("returns JSON array of root nodes", () => {
      const records = [makeRecord({ id: "a1" }), makeRecord({ id: "a2" })];
      const result = buildExecutionTree(records, "json");
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it("includes node properties in JSON output", () => {
      const records = [makeRecord({
        id: "a1",
        type: "Plan",
        status: "running",
        description: "Planning",
      })];
      const result = buildExecutionTree(records, "json");
      const parsed = JSON.parse(result);
      expect(parsed[0].id).toBe("a1");
      expect(parsed[0].type).toBe("Plan");
      expect(parsed[0].status).toBe("running");
    });

    it("builds parent-child relationships in JSON", () => {
      const parent = makeRecord({ id: "parent" });
      const child = makeRecord({ id: "child", parentId: "parent" });
      const result = buildExecutionTree([parent, child], "json");
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe("parent");
      expect(parsed[0].children.length).toBe(1);
      expect(parsed[0].children[0].id).toBe("child");
    });

    it("handles orphaned children (parent not in list)", () => {
      const records = [makeRecord({ id: "orphan", parentId: "missing" })];
      const result = buildExecutionTree(records, "json");
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(1);
      expect(parsed[0].id).toBe("orphan");
    });

    it("handles empty record list", () => {
      const result = buildExecutionTree([], "json");
      const parsed = JSON.parse(result);
      expect(parsed).toEqual([]);
    });

    it("handles many records with mixed parent-child", () => {
      const records = [
        makeRecord({ id: "root1" }),
        makeRecord({ id: "root2" }),
        makeRecord({ id: "child1", parentId: "root1" }),
        makeRecord({ id: "child2", parentId: "root1" }),
        makeRecord({ id: "child3", parentId: "root2" }),
      ];
      const result = buildExecutionTree(records, "json");
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(2);
      expect(parsed.find((n: any) => n.id === "root1").children.length).toBe(2);
      expect(parsed.find((n: any) => n.id === "root2").children.length).toBe(1);
    });
  });

  describe("mermaid format", () => {
    it("starts with graph TD header", () => {
      const records = [makeRecord({ id: "a1" })];
      const result = buildExecutionTree(records, "mermaid");
      expect(result).toContain("graph TD");
    });

    it("includes node definitions with type", () => {
      const records = [makeRecord({ id: "a1", type: "Explore" })];
      const result = buildExecutionTree(records, "mermaid");
      expect(result).toContain('a1["[Explore]');
    });

    it("creates edges for parent-child relationships", () => {
      const parent = makeRecord({ id: "parent" });
      const child = makeRecord({ id: "child", parentId: "parent" });
      const result = buildExecutionTree([parent, child], "mermaid");
      expect(result).toContain("parent --> child");
    });

    it("replaces dashes in IDs for mermaid compatibility", () => {
      const records = [makeRecord({ id: "agent-1" })];
      const result = buildExecutionTree(records, "mermaid");
      expect(result).toContain("agent_1");
    });

    it("handles quotes in type names for mermaid", () => {
      const records = [makeRecord({ id: "a1", type: 'Test "Quoted"' })];
      const result = buildExecutionTree(records, "mermaid");
      // Quotes should be replaced with single quotes
      expect(result).not.toContain('"[Test "Quoted"]');
    });
  });

  describe("text format", () => {
    it("renders root nodes with no indent", () => {
      const records = [makeRecord({ id: "a1", type: "Explore", status: "completed" })];
      const result = buildExecutionTree(records, "text");
      expect(result).toContain("a1 (Explore) [completed]");
    });

    it("renders children with tree indentation", () => {
      const parent = makeRecord({ id: "parent", type: "Explore", status: "completed" });
      const child = makeRecord({ id: "child", type: "Plan", status: "running", parentId: "parent" });
      const result = buildExecutionTree([parent, child], "text");
      expect(result).toContain("parent");
      expect(result).toContain("child");
      expect(result.indexOf("parent")).toBeLessThan(result.indexOf("child"));
    });

    it("shows fallback message for empty records", () => {
      const result = buildExecutionTree([], "text");
      expect(result).toBe("No execution tree available.");
    });

    it("renders hierarchical tree with grandchildren", () => {
      const parent = makeRecord({ id: "p1", type: "Explore", status: "completed" });
      const child1 = makeRecord({ id: "c1", type: "Plan", status: "completed", parentId: "p1" });
      const child2 = makeRecord({ id: "c2", type: "Analysis", status: "running", parentId: "p1" });
      const grandchild = makeRecord({ id: "gc1", type: "general-purpose", status: "queued", parentId: "c1" });
      const result = buildExecutionTree([parent, child1, child2, grandchild], "text");
      expect(result).toContain("p1");
      expect(result).toContain("c1");
      expect(result).toContain("c2");
      expect(result).toContain("gc1");
    });

    it("outputs children directly after their parent with flat indentation", () => {
      const root1 = makeRecord({ id: "root1", type: "Explore", status: "done" });
      const root2 = makeRecord({ id: "root2", type: "Plan", status: "done" });
      const child1 = makeRecord({ id: "c1", type: "Analysis", status: "done", parentId: "root1" });
      const child2 = makeRecord({ id: "c2", type: "general-purpose", status: "done", parentId: "root1" });
      const result = buildExecutionTree([root1, root2, child1, child2], "text");
      // Children appear after their parent root in the output
      const idx1 = result.indexOf("root1");
      const idx2 = result.indexOf("root2");
      const idxC1 = result.indexOf("c1");
      const idxC2 = result.indexOf("c2");
      expect(idx1).toBeLessThan(idxC1);
      expect(idxC2).toBeLessThan(idx2);
      expect(result).toContain("root1");
      expect(result).toContain("root2");
      expect(result).toContain("c1");
      expect(result).toContain("c2");
    });
  });

  describe("edge cases", () => {
    it("returns empty string for unknown format", () => {
      const result = buildExecutionTree([makeRecord()], "unknown" as unknown as "text");
      expect(result).toBe("");
    });

    it("handles record with no parentId", () => {
      const records = [makeRecord({ id: "a1" })];
      const result = buildExecutionTree(records, "json");
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(1);
    });
  });
});
