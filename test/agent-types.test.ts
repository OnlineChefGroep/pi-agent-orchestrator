import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_TOOL_NAMES,
  type EffectiveConfig,
  getAgentConfig,
  getAvailableTypes,
  getConfig,
  getDefaultAgentNames,
  getMemoryToolNames,
  getReadOnlyMemoryToolNames,
  getToolNamesForType,
  getUserAgentNames,
  isValidType,
  registerAgents,
  resolveType,
} from "../src/agent-types.js";
import type { AgentConfig } from "../src/types.js";

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    description: "Test agent",
    builtinToolNames: ["read", "grep"],
    extensions: false,
    skills: false,
    systemPrompt: "You are a test agent.",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
    ...overrides,
  };
}

describe("agent type registry", () => {
  beforeEach(() => {
    registerAgents(new Map());
  });

  describe("default agents", () => {
    it("recognizes all default agent types", () => {
      expect(isValidType("general-purpose")).toBe(true);
      expect(isValidType("Explore")).toBe(true);
      expect(isValidType("Plan")).toBe(true);
    });

    it("does not include removed agents", () => {
      expect(isValidType("statusline-setup")).toBe(false);
      expect(isValidType("claude-code-guide")).toBe(false);
    });

    it("rejects unknown types", () => {
      expect(isValidType("nonexistent")).toBe(false);
      expect(isValidType("")).toBe(false);
    });

    it("case-insensitive lookup works for isValidType", () => {
      expect(isValidType("explore")).toBe(true);
      expect(isValidType("EXPLORE")).toBe(true);
      expect(isValidType("General-Purpose")).toBe(true);
      expect(isValidType("plan")).toBe(true);
    });

    it("case-insensitive lookup works for getAgentConfig", () => {
      const config = getAgentConfig("explore");
      expect(config?.name).toBe("Explore");
      expect(config?.model).toBe("anthropic/claude-haiku-4-5");
    });

    it("resolveType returns canonical key or undefined", () => {
      expect(resolveType("Explore")).toBe("Explore");
      expect(resolveType("explore")).toBe("Explore");
      expect(resolveType("GENERAL-PURPOSE")).toBe("general-purpose");
      expect(resolveType("nonexistent")).toBeUndefined();
    });

    it("returns correct config for default types", () => {
      const config = getConfig("general-purpose");
      expect(config.displayName).toBe("Agent");
      expect(config.builtinToolNames).toEqual(BUILTIN_TOOL_NAMES);
      expect(config.extensions).toBe(true);
      expect(config.skills).toBe(true);
    });

    it("Explore has read-only tools", () => {
      const config = getConfig("Explore");
      expect(config.builtinToolNames).toEqual(["read", "bash", "grep", "find", "ls"]);
      expect(config.builtinToolNames).not.toContain("edit");
      expect(config.builtinToolNames).not.toContain("write");
    });

    it("Explore has haiku model in config", () => {
      const cfg = getAgentConfig("Explore");
      expect(cfg?.model).toBe("anthropic/claude-haiku-4-5");
    });

    it("default agents are marked isDefault", () => {
      const cfg = getAgentConfig("general-purpose");
      expect(cfg?.isDefault).toBe(true);
    });

    // Regression guard for #37 — default agents must not bake in callsite-strategy fields.
    // An explicit `false` here would silently win over the caller's `true` via `??` in
    // resolveAgentInvocationConfig, breaking documented Agent tool params.
    it("default agents do not lock strategy fields (run_in_background / inherit_context / isolated)", () => {
      for (const name of ["general-purpose", "Explore", "Plan"]) {
        const cfg = getAgentConfig(name);
        expect(cfg?.runInBackground, `${name}.runInBackground`).toBeUndefined();
        expect(cfg?.inheritContext, `${name}.inheritContext`).toBeUndefined();
        expect(cfg?.isolated, `${name}.isolated`).toBeUndefined();
      }
    });

    it("getDefaultAgentNames returns default agent names", () => {
      const names = getDefaultAgentNames();
      expect(names).toContain("general-purpose");
      expect(names).toContain("Explore");
      expect(names).toContain("Plan");
    });

    it("BUILTIN_TOOL_NAMES includes all built-in tools", () => {
      expect(BUILTIN_TOOL_NAMES).toContain("read");
      expect(BUILTIN_TOOL_NAMES).toContain("bash");
      expect(BUILTIN_TOOL_NAMES).toContain("edit");
      expect(BUILTIN_TOOL_NAMES).toContain("write");
      expect(BUILTIN_TOOL_NAMES).toContain("grep");
      expect(BUILTIN_TOOL_NAMES).toContain("find");
      expect(BUILTIN_TOOL_NAMES).toContain("ls");
      expect(BUILTIN_TOOL_NAMES.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe("user agents", () => {
    it("registers and retrieves user agents", () => {
      const agents = new Map([["auditor", makeAgentConfig({ name: "auditor", description: "Auditor" })]]);
      registerAgents(agents);

      expect(isValidType("auditor")).toBe(true);
      expect(getAgentConfig("auditor")?.description).toBe("Auditor");
    });

    it("includes user agents in available types", () => {
      const agents = new Map([["auditor", makeAgentConfig({ name: "auditor" })]]);
      registerAgents(agents);

      const types = getAvailableTypes();
      expect(types).toContain("general-purpose");
      expect(types).toContain("Explore");
      expect(types).toContain("auditor");
    });

    it("lists user agent names separately", () => {
      const agents = new Map([
        ["auditor", makeAgentConfig({ name: "auditor" })],
        ["reviewer", makeAgentConfig({ name: "reviewer" })],
      ]);
      registerAgents(agents);

      const names = getUserAgentNames();
      expect(names).toEqual(["auditor", "reviewer"]);
      expect(names).not.toContain("general-purpose");
    });

    it("getConfig returns config for user agents", () => {
      const agents = new Map([["auditor", makeAgentConfig({
        name: "auditor",
        description: "Security auditor",
        builtinToolNames: ["read", "grep"],
        extensions: false,
        skills: true,
      })]]);
      registerAgents(agents);

      const config = getConfig("auditor");
      expect(config.displayName).toBe("auditor");
      expect(config.description).toBe("Security auditor");
      expect(config.builtinToolNames).toEqual(["read", "grep"]);
      expect(config.extensions).toBe(false);
      expect(config.skills).toBe(true);
    });

    it("getConfig returns extension allowlist for user agents", () => {
      const agents = new Map([["partial", makeAgentConfig({
        name: "partial",
        extensions: ["web-search"],
        skills: ["planning"],
      })]]);
      registerAgents(agents);

      const config = getConfig("partial");
      expect(config.extensions).toEqual(["web-search"]);
      expect(config.skills).toEqual(["planning"]);
    });

    it("getToolNamesForType works for user agents", () => {
      const agents = new Map([["auditor", makeAgentConfig({
        name: "auditor",
        builtinToolNames: ["read", "grep", "find"],
      })]]);
      registerAgents(agents);

      const names = getToolNamesForType("auditor");
      expect(names).toEqual(["read", "grep", "find"]);
    });

    it("getConfig falls back to general-purpose for unknown types", () => {
      const config = getConfig("nonexistent");
      expect(config.displayName).toBe("Agent");
      expect(config.description).toBe("General-purpose agent for complex, multi-step tasks");
    });

    it("clearing user agents works (defaults remain)", () => {
      const agents = new Map([["auditor", makeAgentConfig({ name: "auditor" })]]);
      registerAgents(agents);
      expect(isValidType("auditor")).toBe(true);

      registerAgents(new Map());
      expect(isValidType("auditor")).toBe(false);
      expect(isValidType("general-purpose")).toBe(true);
    });

    it("user agent overrides default with same name", () => {
      const agents = new Map([["Explore", makeAgentConfig({
        name: "Explore",
        description: "Custom Explore",
        builtinToolNames: BUILTIN_TOOL_NAMES,
      })]]);
      registerAgents(agents);

      const config = getConfig("Explore");
      expect(config.description).toBe("Custom Explore");
      expect(config.builtinToolNames).toEqual(BUILTIN_TOOL_NAMES);
    });

    it("disabled agent is excluded from available types", () => {
      const agents = new Map([["Plan", makeAgentConfig({
        name: "Plan",
        enabled: false,
      })]]);
      registerAgents(agents);

      expect(isValidType("Plan")).toBe(false);
      expect(getAvailableTypes()).not.toContain("Plan");
    });

    it("general-purpose can be disabled but fallback still works", () => {
      const agents = new Map([["general-purpose", makeAgentConfig({
        name: "general-purpose",
        enabled: false,
      })]]);
      registerAgents(agents);

      expect(isValidType("general-purpose")).toBe(false);
      // getConfig fallback should still return something reasonable
      const config = getConfig("general-purpose");
      expect(config.displayName).toBe("Agent");
    });
  });

  describe("getMemoryToolNames", () => {
    it("returns read, write, edit when none exist", () => {
      const names = getMemoryToolNames(new Set());
      expect(names).toContain("read");
      expect(names).toContain("write");
      expect(names).toContain("edit");
      expect(names).toHaveLength(3);
    });

    it("skips tools that already exist", () => {
      const names = getMemoryToolNames(new Set(["read", "edit"]));
      expect(names).toEqual(["write"]);
    });

    it("returns empty when all memory tools already exist", () => {
      const names = getMemoryToolNames(new Set(["read", "write", "edit"]));
      expect(names).toHaveLength(0);
    });
  });

  describe("getReadOnlyMemoryToolNames", () => {
    it("returns only read when missing", () => {
      const names = getReadOnlyMemoryToolNames(new Set());
      expect(names).toEqual(["read"]);
    });

    it("returns empty when read already exists", () => {
      const names = getReadOnlyMemoryToolNames(new Set(["read"]));
      expect(names).toHaveLength(0);
    });
  });

  describe("permission inheritance", () => {
    const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
    const ALL_TOOLS = BUILTIN_TOOL_NAMES;

    it("RO parent spawns child → child tools are subset of parent RO tools", () => {
      // Explore (RO) spawns general-purpose (RW-configured) child
      // Child must be restricted to parent's RO tool set
      const parentConfig: EffectiveConfig = {
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: true,
        skills: true,
      };

      const child = getConfig("general-purpose", parentConfig);

      // Child should not have write/edit (parent doesn't have them)
      expect(child.builtinToolNames).not.toContain("write");
      expect(child.builtinToolNames).not.toContain("edit");
      // Child should have read-only tools (intersection with parent)
      expect(child.builtinToolNames).toContain("read");
      expect(child.builtinToolNames).toContain("bash");
      expect(child.builtinToolNames).toContain("grep");
      expect(child.builtinToolNames).toContain("find");
      expect(child.builtinToolNames).toContain("ls");
      // Child's tool count should equal parent's (intersection = parent's smaller set)
      expect(child.builtinToolNames).toEqual(READ_ONLY_TOOLS);
    });

    it("RO parent → RO child: child keeps RO tools (no further restriction needed)", () => {
      // Explore (RO) spawns Plan (also RO) child
      const parentConfig: EffectiveConfig = {
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: true,
        skills: true,
      };

      const child = getConfig("Plan", parentConfig);

      // Plan is already RO, intersection with RO parent = still RO
      expect(child.builtinToolNames).not.toContain("write");
      expect(child.builtinToolNames).not.toContain("edit");
      expect(child.builtinToolNames).toEqual(READ_ONLY_TOOLS);
    });

    it("RW parent spawns RO child → child has only RO tools", () => {
      // General-purpose (RW) spawns Explore (RO) child
      const parentConfig: EffectiveConfig = {
        builtinToolNames: ALL_TOOLS,
        extensions: true,
        skills: true,
      };

      const child = getConfig("Explore", parentConfig);

      // Child's own config restricts to RO; parent allows all; intersection = RO
      expect(child.builtinToolNames).not.toContain("write");
      expect(child.builtinToolNames).not.toContain("edit");
      expect(child.builtinToolNames).toEqual(READ_ONLY_TOOLS);
    });

    it("RO parent → RW child: child is FORCED to RO (key security guarantee)", () => {
      // Explore (RO) spawns general-purpose (RW-configured) child
      // Parent's restriction wins: child can only use what parent can use
      const parentConfig: EffectiveConfig = {
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: true,
        skills: true,
      };

      const child = getConfig("general-purpose", parentConfig);

      // Even though general-purpose is configured with all tools,
      // the intersection with RO parent forces RO
      expect(child.builtinToolNames).not.toContain("write");
      expect(child.builtinToolNames).not.toContain("edit");
      expect(child.builtinToolNames).toEqual(READ_ONLY_TOOLS);
    });

    it("restricted parent (deny write_file) spawns child → child cannot use write_file even if configured", () => {
      // Parent has all tools except "write"
      const parentTools = ALL_TOOLS.filter((t) => t !== "write");
      const parentConfig: EffectiveConfig = {
        builtinToolNames: parentTools,
        extensions: true,
        skills: true,
      };

      const child = getConfig("general-purpose", parentConfig);

      // Child should NOT have write
      expect(child.builtinToolNames).not.toContain("write");
      // Child should have all other tools
      expect(child.builtinToolNames).toContain("read");
      expect(child.builtinToolNames).toContain("bash");
      expect(child.builtinToolNames).toContain("edit");
      expect(child.builtinToolNames).toContain("grep");
      expect(child.builtinToolNames).toContain("find");
      expect(child.builtinToolNames).toContain("ls");
    });

    it("parent with no restrictions → child gets full configured tools (no inheritance when no restrictions)", () => {
      // No parentConfig passed
      const child = getConfig("general-purpose");

      // Child gets full tool set (general-purpose has no builtinToolNames → BUILTIN_TOOL_NAMES fallback)
      expect(child.builtinToolNames).toContain("read");
      expect(child.builtinToolNames).toContain("write");
      expect(child.builtinToolNames).toContain("edit");
      expect(child.builtinToolNames).toContain("bash");
    });

    it("parent restricts extensions → child inherits restriction", () => {
      // Register a user agent with extensions: true
      const agents = new Map([["worker", makeAgentConfig({
        name: "worker",
        description: "Worker agent",
        extensions: true,
        skills: true,
      })]]);
      registerAgents(agents);

      // Parent only allows web-search extension
      const parentConfig: EffectiveConfig = {
        builtinToolNames: ALL_TOOLS,
        extensions: ["web-search"],
        skills: true,
      };

      const child = getConfig("worker", parentConfig);

      // Child's extensions: true → intersected with parent's ["web-search"] → ["web-search"]
      expect(child.extensions).toEqual(["web-search"]);
    });

    it("parent denies all extensions → child gets none", () => {
      const agents = new Map([["worker", makeAgentConfig({
        name: "worker",
        description: "Worker agent",
        extensions: true,
        skills: true,
      })]]);
      registerAgents(agents);

      const parentConfig: EffectiveConfig = {
        builtinToolNames: ALL_TOOLS,
        extensions: false,
        skills: true,
      };

      const child = getConfig("worker", parentConfig);

      expect(child.extensions).toBe(false);
    });

    it("parent restricts skills → child inherits restriction", () => {
      const agents = new Map([["worker", makeAgentConfig({
        name: "worker",
        description: "Worker agent",
        extensions: true,
        skills: true,
      })]]);
      registerAgents(agents);

      // Parent only allows specific skills
      const parentConfig: EffectiveConfig = {
        builtinToolNames: ALL_TOOLS,
        extensions: true,
        skills: ["planning", "code-review"],
      };

      const child = getConfig("worker", parentConfig);

      // Child's skills: true → intersected with parent's ["planning","code-review"] → parent's list
      expect(child.skills).toEqual(["planning", "code-review"]);
    });

    it("both parent and child have extension allowlists → intersection", () => {
      const agents = new Map([["worker", makeAgentConfig({
        name: "worker",
        description: "Worker agent",
        extensions: ["web-search", "file-ops", "tools"],
        skills: true,
      })]]);
      registerAgents(agents);

      const parentConfig: EffectiveConfig = {
        builtinToolNames: ALL_TOOLS,
        extensions: ["web-search", "data-fetch"],
        skills: true,
      };

      const child = getConfig("worker", parentConfig);

      // Intersection of ["web-search","file-ops","tools"] ∩ ["web-search","data-fetch"] = ["web-search"]
      expect(child.extensions).toEqual(["web-search"]);
    });

    it("existing tests are not broken: getConfig without parentConfig works as before", () => {
      // This tests the backward-compatible path
      const withoutParent = getConfig("Explore");
      expect(withoutParent.builtinToolNames).toEqual(READ_ONLY_TOOLS);
      expect(withoutParent.extensions).toBe(true);
      expect(withoutParent.skills).toBe(true);

      const gp = getConfig("general-purpose");
      expect(gp.builtinToolNames).toEqual(ALL_TOOLS);
      expect(gp.extensions).toBe(true);
      expect(gp.skills).toBe(true);
    });

    it("fallback configs also respect parent restrictions", () => {
      // When type is unknown, fallback to general-purpose. Parent restrictions still apply.
      const parentConfig: EffectiveConfig = {
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: false,
        skills: false,
      };

      const child = getConfig("nonexistent", parentConfig);

      // Fallback general-purpose config, restricted by parent
      expect(child.builtinToolNames).toEqual(READ_ONLY_TOOLS);
      expect(child.extensions).toBe(false);
      expect(child.skills).toBe(false);
    });
  });
});
