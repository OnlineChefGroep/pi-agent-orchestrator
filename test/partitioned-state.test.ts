import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_TOOL_NAMES, filterByPartitions, getConfig, registerAgents } from "../src/agent-types.js";
import type { AgentConfig } from "../src/types.js";

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "worker",
    description: "Worker agent",
    builtinToolNames: ["read", "write", "bash", "grep"],
    extensions: false,
    skills: false,
    systemPrompt: "You are a worker.",
    promptMode: "replace",
    ...overrides,
  };
}

describe("filterByPartitions", () => {
  it("no partitions → returns all built-in tools (backward compat)", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: ["read", "write"] },
    });

    const result = filterByPartitions(config, undefined);
    expect(result).toEqual(["read", "write", "bash", "grep"]);
  });

  it("empty partitions array → returns all built-in tools", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: ["read", "write"] },
    });

    const result = filterByPartitions(config, []);
    expect(result).toEqual(["read", "write", "bash", "grep"]);
  });

  it("single partition → only that partition's tools", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: ["read", "write", "bash"] },
    });

    const result = filterByPartitions(config, ["frontend"]);
    expect(result).toEqual(["read", "write", "bash"]);
  });

  it("multiple partitions → union of all partitions' tools", () => {
    const config = makeAgentConfig({
      partitionMembership: {
        frontend: ["read", "write"],
        backend: ["bash", "grep"],
      },
    });

    const result = filterByPartitions(config, ["frontend", "backend"]);
    // Union should contain all 4, order may vary
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set(["read", "write", "bash", "grep"]));
  });

  it("overlapping partitions → deduplicated union", () => {
    const config = makeAgentConfig({
      partitionMembership: {
        frontend: ["read", "write", "bash"],
        backend: ["bash", "grep"],
      },
    });

    const result = filterByPartitions(config, ["frontend", "backend"]);
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set(["read", "write", "bash", "grep"]));
  });

  it("unknown partition name → no tools (isolated)", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: ["read", "write"] },
    });

    const result = filterByPartitions(config, ["nonexistent"]);
    expect(result).toEqual([]);
  });

  it("one known + one unknown partition → only known tools", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: ["read", "write"] },
    });

    const result = filterByPartitions(config, ["frontend", "nonexistent"]);
    expect(result).toEqual(["read", "write"]);
  });

  it("AgentConfig without partitionMembership → feature disabled (all tools)", () => {
    const config = makeAgentConfig({
      // No partitionMembership at all
    });

    const result = filterByPartitions(config, ["frontend"]);
    expect(result).toEqual(["read", "write", "bash", "grep"]);
  });

  it("empty partitionMembership {} → no tools for any partition", () => {
    const config = makeAgentConfig({
      partitionMembership: {},
    });

    const result = filterByPartitions(config, ["frontend"]);
    expect(result).toEqual([]);
  });

  it("partitionMembership with empty tool array → no tools", () => {
    const config = makeAgentConfig({
      partitionMembership: { frontend: [] },
    });

    const result = filterByPartitions(config, ["frontend"]);
    expect(result).toEqual([]);
  });
});

describe("getConfig with partitions", () => {
  beforeEach(() => {
    registerAgents(new Map());
  });

  it("no partitions → all tools available (backward compat)", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          partitionMembership: { frontend: ["read", "write"] },
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, undefined);
    expect(config.builtinToolNames).toEqual(["read", "write", "bash", "grep"]);
  });

  it("single partition → only that partition's tools", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          partitionMembership: { frontend: ["read", "write"] },
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["frontend"]);
    expect(config.builtinToolNames).toEqual(["read", "write"]);
  });

  it("multiple partitions → union then intersect with config tools", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          builtinToolNames: BUILTIN_TOOL_NAMES,
          partitionMembership: {
            frontend: ["read", "write"],
            backend: ["bash", "grep", "edit"],
          },
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["frontend", "backend"]);
    expect(config.builtinToolNames).toHaveLength(5);
    expect(new Set(config.builtinToolNames)).toEqual(new Set(["read", "write", "bash", "grep", "edit"]));
  });

  it("unknown partition name → no tools (isolated)", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          partitionMembership: { frontend: ["read", "write"] },
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["nonexistent"]);
    expect(config.builtinToolNames).toEqual([]);
  });

  it("partition + permission inheritance: intersection applied", () => {
    // Parent is RO (Explore tools)
    const READ_ONLY_TOOLS = ["read", "bash", "grep"];
    const parentConfig = {
      builtinToolNames: READ_ONLY_TOOLS,
      extensions: true as const,
      skills: true as const,
    };

    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          builtinToolNames: BUILTIN_TOOL_NAMES,
          partitionMembership: { frontend: ["read", "write", "edit"] },
        }),
      ],
    ]);
    registerAgents(agents);

    // Partition allows [read, write, edit]
    // Parent allows [read, bash, grep]
    // Intersection = [read] only
    const config = getConfig("worker", parentConfig, ["frontend"]);
    expect(config.builtinToolNames).toEqual(["read"]);
  });

  it("partition + parent fully restricted → empty tools", () => {
    const READ_ONLY_TOOLS = ["read", "bash", "grep"];
    const parentConfig = {
      builtinToolNames: READ_ONLY_TOOLS,
      extensions: true as const,
      skills: true as const,
    };

    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          builtinToolNames: BUILTIN_TOOL_NAMES,
          partitionMembership: { frontend: ["write", "edit"] },
        }),
      ],
    ]);
    registerAgents(agents);

    // Partition allows [write, edit]
    // Parent allows [read, bash, grep]
    // Intersection = [] — no overlap
    const config = getConfig("worker", parentConfig, ["frontend"]);
    expect(config.builtinToolNames).toEqual([]);
  });

  it("empty partitionMembership on config → no tools for any partition", () => {
    const agents = new Map([["worker", makeAgentConfig({ name: "worker", partitionMembership: {} })]]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["frontend"]);
    expect(config.builtinToolNames).toEqual([]);
  });

  it("AgentConfig without partitionMembership → all tools (feature disabled)", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          // No partitionMembership
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["frontend"]);
    expect(config.builtinToolNames).toEqual(["read", "write", "bash", "grep"]);
  });

  it("partition filtering does not affect extensions or skills", () => {
    const agents = new Map([
      [
        "worker",
        makeAgentConfig({
          name: "worker",
          extensions: ["web-search"],
          skills: ["planning"],
          partitionMembership: { frontend: ["read", "write"] },
        }),
      ],
    ]);
    registerAgents(agents);

    const config = getConfig("worker", undefined, ["frontend"]);
    expect(config.extensions).toEqual(["web-search"]);
    expect(config.skills).toEqual(["planning"]);
    expect(config.builtinToolNames).toEqual(["read", "write"]);
  });
});
