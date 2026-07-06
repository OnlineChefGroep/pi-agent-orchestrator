import { describe, expect, it } from "vitest";
import { resolveAgentInvocationConfig, resolveJoinMode } from "../src/invocation-config.js";
import type { AgentConfig, IsolationMode, JoinMode, ThinkingLevel } from "../src/types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Factory helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    systemPrompt: "Test agent",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
    ...overrides,
  };
}

/** Full agent config matching real default-agents.ts patterns. */
function makeFullConfig(): AgentConfig {
  return makeConfig({
    name: "Explore",
    model: "anthropic/claude-haiku-4-5",
    thinking: "high",
    maxTurns: 42,
    inheritContext: true,
    runInBackground: true,
    isolated: true,
    isolation: "worktree",
  });
}

/** All valid ThinkingLevel values. */
const THINKING_LEVELS: ThinkingLevel[] = ["minimal", "low", "medium", "high"];

/** All valid JoinMode values. */
const JOIN_MODES: JoinMode[] = ["smart", "async", "group", "merge"];

/** Model identifiers covering different provider formats. */
const MODEL_IDS = [
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-sonnet-4-5-20250901",
  "openai/gpt-4o",
  "openai/o3-mini",
  "opencode/mimo-v2.5-free",
  "openrouter/mistral/mistral-large",
  "google/gemini-2.0-flash",
  "meta/llama-3.3-70b",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// MODEL RESOLUTION — params override config (the bug fix)
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — model priority: params win over config", () => {
  it("uses tool-call model param when agent config also defines a model", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: "anthropic/claude-haiku-4-5" }), {
      model: "opencode/mimo-v2.5-free",
    });

    expect(resolved.modelInput).toBe("opencode/mimo-v2.5-free");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("falls back to agent config model when no param model provided", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: "anthropic/claude-haiku-4-5" }), {});

    expect(resolved.modelInput).toBe("anthropic/claude-haiku-4-5");
    expect(resolved.modelFromParams).toBe(false);
  });

  it("uses param model when config has no model set", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: undefined }), { model: "openai/gpt-4o" });

    expect(resolved.modelInput).toBe("openai/gpt-4o");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("returns undefined model when neither config nor params provide one", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: undefined }), {});

    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.modelFromParams).toBe(false);
  });

  it("handles empty string model param via nullish coalescing", () => {
    // ?? only treats null/undefined as nullish — empty string is a valid value
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: "anthropic/claude-haiku-4-5" }), { model: "" });

    // Empty string passes through ?? (it's not nullish), so it becomes modelInput
    expect(resolved.modelInput).toBe("");
    // modelFromParams checks != null, so empty string IS from params
    expect(resolved.modelFromParams).toBe(true);
  });

  // Test all model ID formats from params override config defaults
  for (const modelId of MODEL_IDS) {
    it(`param model "${modelId}" overrides config model`, () => {
      const resolved = resolveAgentInvocationConfig(makeConfig({ model: "anthropic/claude-haiku-4-5" }), {
        model: modelId,
      });

      expect(resolved.modelInput).toBe(modelId);
      expect(resolved.modelFromParams).toBe(true);
    });
  }

  // Test all model ID formats from config when no param provided
  for (const modelId of MODEL_IDS) {
    it(`config model "${modelId}" used when no param model provided`, () => {
      const resolved = resolveAgentInvocationConfig(makeConfig({ model: modelId }), {});

      expect(resolved.modelInput).toBe(modelId);
      expect(resolved.modelFromParams).toBe(false);
    });
  }

  it("param model with nested provider path (openrouter/mistral/mistral-large)", () => {
    const resolved = resolveAgentInvocationConfig(makeFullConfig(), { model: "openrouter/mistral/mistral-large" });

    expect(resolved.modelInput).toBe("openrouter/mistral/mistral-large");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("param model with free tier suffix (opencode/mimo-v2.5-free)", () => {
    const resolved = resolveAgentInvocationConfig(makeFullConfig(), { model: "opencode/mimo-v2.5-free" });

    expect(resolved.modelInput).toBe("opencode/mimo-v2.5-free");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("modelFromParams is true when only params.model is set (no config)", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { model: "openai/gpt-4o" });
    expect(resolved.modelFromParams).toBe(true);
  });

  it("modelFromParams is false when only config.model is set (no params)", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ model: "anthropic/claude-haiku-4-5" }), {});
    expect(resolved.modelFromParams).toBe(false);
  });

  it("modelFromParams is false when neither config nor params has model", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {});
    expect(resolved.modelFromParams).toBe(false);
  });

  it("modelFromParams is true when params.model is empty string (edge case)", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { model: "" });
    // "" != null evaluates to true
    expect(resolved.modelFromParams).toBe(true);
  });

  it("modelFromParams is false when params.model is undefined", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { model: undefined });
    expect(resolved.modelFromParams).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LOCKED FIELDS — agent config wins over params (intentional constraints)
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — locked fields: config wins", () => {
  it("agent config thinking wins over param thinking", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ thinking: "high" }), { thinking: "minimal" });
    expect(resolved.thinking).toBe("high");
  });

  it("agent config maxTurns wins over param max_turns", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ maxTurns: 42 }), { max_turns: 1 });
    expect(resolved.maxTurns).toBe(42);
  });

  it("agent config inheritContext wins over param inherit_context", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ inheritContext: false }), { inherit_context: true });
    expect(resolved.inheritContext).toBe(false);
  });

  it("agent config runInBackground wins over param run_in_background", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ runInBackground: false }), { run_in_background: true });
    expect(resolved.runInBackground).toBe(false);
  });

  it("agent config isolated wins over param isolated", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolated: false }), { isolated: true });
    expect(resolved.isolated).toBe(false);
  });

  it("agent config isolation wins over param isolation", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: "worktree" }), { isolation: undefined });
    expect(resolved.isolation).toBe("worktree");
  });

  // Test thinking level priority across all valid values
  for (const configLevel of THINKING_LEVELS) {
    for (const paramLevel of THINKING_LEVELS) {
      if (configLevel === paramLevel) continue;
      it(`config thinking "${configLevel}" wins over param thinking "${paramLevel}"`, () => {
        const resolved = resolveAgentInvocationConfig(makeConfig({ thinking: configLevel }), { thinking: paramLevel });
        expect(resolved.thinking).toBe(configLevel);
      });
    }
  }

  it("config maxTurns=1 wins over param max_turns=1000", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ maxTurns: 1 }), { max_turns: 1000 });
    expect(resolved.maxTurns).toBe(1);
  });

  it("config maxTurns=0 wins over param max_turns=10 (edge: zero is not nullish via ??)", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ maxTurns: 0 }), { max_turns: 10 });
    expect(resolved.maxTurns).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK — params fill gaps when config field is undefined
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — params fallback when config is undefined", () => {
  it("uses param thinking when config thinking is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ thinking: undefined }), { thinking: "minimal" });
    expect(resolved.thinking).toBe("minimal");
  });

  it("uses param max_turns when config maxTurns is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ maxTurns: undefined }), { max_turns: 10 });
    expect(resolved.maxTurns).toBe(10);
  });

  it("uses param inherit_context when config inheritContext is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ inheritContext: undefined }), { inherit_context: true });
    expect(resolved.inheritContext).toBe(true);
  });

  it("uses param run_in_background when config runInBackground is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ runInBackground: undefined }), {
      run_in_background: true,
    });
    expect(resolved.runInBackground).toBe(true);
  });

  it("uses param isolated when config isolated is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolated: undefined }), { isolated: true });
    expect(resolved.isolated).toBe(true);
  });

  it("uses param isolation when config isolation is undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: undefined }), { isolation: "worktree" });
    expect(resolved.isolation).toBe("worktree");
  });

  // Param fills ALL undefined config fields simultaneously
  it("params fill all fields when config has all undefined", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: undefined,
        thinking: undefined,
        maxTurns: undefined,
        inheritContext: undefined,
        runInBackground: undefined,
        isolated: undefined,
        isolation: undefined,
      }),
      {
        model: "openai/gpt-4o",
        thinking: "high",
        max_turns: 5,
        inherit_context: true,
        run_in_background: true,
        isolated: true,
        isolation: "worktree",
      },
    );

    expect(resolved.modelInput).toBe("openai/gpt-4o");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(5);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO CONFIG — agentConfig is undefined
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — no agent config (undefined)", () => {
  it("uses all param fields when agentConfig is undefined", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {
      model: "openai/gpt-4o",
      thinking: "high",
      max_turns: 5,
      inherit_context: true,
      run_in_background: true,
      isolated: true,
      isolation: "worktree",
    });

    expect(resolved.modelInput).toBe("openai/gpt-4o");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(5);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("defaults all booleans to false when no config and no params", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {});

    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBeUndefined();
    expect(resolved.maxTurns).toBeUndefined();
    expect(resolved.isolation).toBeUndefined();
  });

  it("only model param provided with no config", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { model: "google/gemini-2.0-flash" });

    expect(resolved.modelInput).toBe("google/gemini-2.0-flash");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
  });

  it("only thinking param provided with no config", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { thinking: "medium" });

    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBe("medium");
    expect(resolved.inheritContext).toBe(false);
  });

  it("only max_turns param provided with no config", () => {
    const resolved = resolveAgentInvocationConfig(undefined, { max_turns: 15 });

    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.maxTurns).toBe(15);
    expect(resolved.inheritContext).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY PARAMS — params is {}
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — empty params {}", () => {
  it("uses config for everything when params is empty", () => {
    const resolved = resolveAgentInvocationConfig(makeFullConfig(), {});

    expect(resolved.modelInput).toBe("anthropic/claude-haiku-4-5");
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("returns all defaults when both config and params are minimal", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig(), {});

    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBeUndefined();
    expect(resolved.maxTurns).toBeUndefined();
    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
    expect(resolved.isolation).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE — all fields from both sources simultaneously
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — comprehensive field matrix", () => {
  it("model from params wins, all other locked fields from config win", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "anthropic/claude-haiku-4-5",
        thinking: "high",
        maxTurns: 42,
        inheritContext: true,
        runInBackground: true,
        isolated: true,
        isolation: "worktree",
      }),
      {
        model: "opencode/mimo-v2.5-free",
        thinking: "minimal",
        max_turns: 1,
        inherit_context: false,
        run_in_background: false,
        isolated: false,
        isolation: undefined,
      },
    );

    // Model: params win (the bug fix)
    expect(resolved.modelInput).toBe("opencode/mimo-v2.5-free");
    expect(resolved.modelFromParams).toBe(true);

    // All other fields: config wins (intentional constraints)
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolated).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("partial params: only model provided, rest from config", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "anthropic/claude-haiku-4-5",
        thinking: "high",
        maxTurns: 42,
        inheritContext: true,
        runInBackground: false,
        isolated: false,
      }),
      { model: "openai/gpt-4o" },
    );

    expect(resolved.modelInput).toBe("openai/gpt-4o");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(false);
    expect(resolved.isolated).toBe(false);
  });

  it("partial params: only thinking provided, rest from config", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({ model: "anthropic/claude-haiku-4-5", thinking: "low" }),
      { thinking: "high" },
    );

    // Config model still used since no param model
    expect(resolved.modelInput).toBe("anthropic/claude-haiku-4-5");
    expect(resolved.modelFromParams).toBe(false);
    // Config thinking wins (locked field)
    expect(resolved.thinking).toBe("low");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION — the specific bug scenario
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — regression: hardcoded agent model override", () => {
  // Before the fix: modelInput was "anthropic/claude-haiku-4-5" (config won)
  // After the fix: modelInput is whatever the user passes (params win)

  it("allows overriding Explore agent's hardcoded model", () => {
    const exploreConfig: AgentConfig = makeConfig({
      name: "Explore",
      model: "anthropic/claude-haiku-4-5",
    });

    const resolved = resolveAgentInvocationConfig(exploreConfig, {
      model: "opencode/mimo-v2.5-free",
    });

    expect(resolved.modelInput).toBe("opencode/mimo-v2.5-free");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("allows overriding Plan agent's hardcoded model", () => {
    const planConfig: AgentConfig = makeConfig({
      name: "Plan",
      model: "anthropic/claude-sonnet-4-5-20250901",
    });

    const resolved = resolveAgentInvocationConfig(planConfig, {
      model: "openai/o3-mini",
    });

    expect(resolved.modelInput).toBe("openai/o3-mini");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("allows overriding Analysis agent's hardcoded model", () => {
    const analysisConfig: AgentConfig = makeConfig({
      name: "Analysis",
      model: "anthropic/claude-sonnet-4-5-20250901",
    });

    const resolved = resolveAgentInvocationConfig(analysisConfig, {
      model: "google/gemini-2.0-flash",
    });

    expect(resolved.modelInput).toBe("google/gemini-2.0-flash");
    expect(resolved.modelFromParams).toBe(true);
  });

  it("preserves Explore default model when no override is requested", () => {
    const exploreConfig: AgentConfig = makeConfig({
      name: "Explore",
      model: "anthropic/claude-haiku-4-5",
    });

    const resolved = resolveAgentInvocationConfig(exploreConfig, {});

    expect(resolved.modelInput).toBe("anthropic/claude-haiku-4-5");
    expect(resolved.modelFromParams).toBe(false);
  });

  it("preserves Plan default model when no override is requested", () => {
    const planConfig: AgentConfig = makeConfig({
      name: "Plan",
      model: "anthropic/claude-sonnet-4-5-20250901",
    });

    const resolved = resolveAgentInvocationConfig(planConfig, {});

    expect(resolved.modelInput).toBe("anthropic/claude-sonnet-4-5-20250901");
    expect(resolved.modelFromParams).toBe(false);
  });

  it("rapid model switching: multiple overrides in sequence", () => {
    const config = makeConfig({ model: "anthropic/claude-haiku-4-5" });

    const models = ["opencode/mimo-v2.5-free", "openai/gpt-4o", "google/gemini-2.0-flash", "meta/llama-3.3-70b"];

    for (const model of models) {
      const resolved = resolveAgentInvocationConfig(config, { model });
      expect(resolved.modelInput).toBe(model);
      expect(resolved.modelFromParams).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOOLEAN DEFAULTS — three-level fallback chain
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — boolean three-level fallback", () => {
  // inheritContext: config → params → false
  it("inheritContext: config true wins over params false", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ inheritContext: true }), { inherit_context: false });
    expect(r.inheritContext).toBe(true);
  });

  it("inheritContext: params true fills when config undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ inheritContext: undefined }), { inherit_context: true });
    expect(r.inheritContext).toBe(true);
  });

  it("inheritContext: defaults to false when both undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ inheritContext: undefined }), {});
    expect(r.inheritContext).toBe(false);
  });

  it("inheritContext: config false wins over params true (constraint enforced)", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ inheritContext: false }), { inherit_context: true });
    expect(r.inheritContext).toBe(false);
  });

  // runInBackground: config → params → false
  it("runInBackground: config true wins over params false", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ runInBackground: true }), { run_in_background: false });
    expect(r.runInBackground).toBe(true);
  });

  it("runInBackground: params true fills when config undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ runInBackground: undefined }), { run_in_background: true });
    expect(r.runInBackground).toBe(true);
  });

  it("runInBackground: defaults to false when both undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ runInBackground: undefined }), {});
    expect(r.runInBackground).toBe(false);
  });

  // isolated: config → params → false
  it("isolated: config true wins over params false", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ isolated: true }), { isolated: false });
    expect(r.isolated).toBe(true);
  });

  it("isolated: params true fills when config undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ isolated: undefined }), { isolated: true });
    expect(r.isolated).toBe(true);
  });

  it("isolated: defaults to false when both undefined", () => {
    const r = resolveAgentInvocationConfig(makeConfig({ isolated: undefined }), {});
    expect(r.isolated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ISOLATION MODE — specific handling
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — isolation mode", () => {
  it("config isolation wins over param isolation", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: "worktree" }), { isolation: undefined });
    expect(resolved.isolation).toBe("worktree");
  });

  it("param isolation fills when config has none", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: undefined }), { isolation: "worktree" });
    expect(resolved.isolation).toBe("worktree");
  });

  it("both undefined yields undefined isolation", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig({ isolation: undefined }), {});
    expect(resolved.isolation).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RETURN TYPE SHAPE — structural integrity
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — return type shape", () => {
  it("always returns all expected keys", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {});

    expect(resolved).toHaveProperty("modelInput");
    expect(resolved).toHaveProperty("modelFromParams");
    expect(resolved).toHaveProperty("thinking");
    expect(resolved).toHaveProperty("maxTurns");
    expect(resolved).toHaveProperty("inheritContext");
    expect(resolved).toHaveProperty("runInBackground");
    expect(resolved).toHaveProperty("isolated");
    expect(resolved).toHaveProperty("isolation");
  });

  it("modelFromParams is always a boolean", () => {
    const r1 = resolveAgentInvocationConfig(undefined, {});
    const r2 = resolveAgentInvocationConfig(undefined, { model: "x" });
    const r3 = resolveAgentInvocationConfig(makeConfig({ model: "x" }), {});

    expect(typeof r1.modelFromParams).toBe("boolean");
    expect(typeof r2.modelFromParams).toBe("boolean");
    expect(typeof r3.modelFromParams).toBe("boolean");
  });

  it("inheritContext, runInBackground, isolated are always booleans (never undefined)", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {});

    expect(typeof resolved.inheritContext).toBe("boolean");
    expect(typeof resolved.runInBackground).toBe("boolean");
    expect(typeof resolved.isolated).toBe("boolean");
  });

  it("modelInput, thinking, maxTurns, isolation can be undefined", () => {
    const resolved = resolveAgentInvocationConfig(makeConfig(), {});

    expect(resolved.modelInput).toBeUndefined();
    expect(resolved.thinking).toBeUndefined();
    expect(resolved.maxTurns).toBeUndefined();
    expect(resolved.isolation).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ASYMMETRY VERIFICATION — model is different from locked fields
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveAgentInvocationConfig — model vs locked field asymmetry", () => {
  it("model is the ONLY field where params override config", () => {
    // Every field has both config and params set differently.
    // Only model should reflect the param value; all others should reflect config.
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "config/model",
        thinking: "high",
        maxTurns: 99,
        inheritContext: true,
        runInBackground: true,
        isolated: true,
        isolation: "worktree",
      }),
      {
        model: "param/model",
        thinking: "low",
        max_turns: 1,
        inherit_context: false,
        run_in_background: false,
        isolated: false,
        isolation: undefined,
      },
    );

    // Model: params win
    expect(resolved.modelInput).toBe("param/model");
    expect(resolved.modelFromParams).toBe(true);

    // Everything else: config wins
    expect(resolved.thinking).not.toBe("low");
    expect(resolved.thinking).toBe("high");

    expect(resolved.maxTurns).not.toBe(1);
    expect(resolved.maxTurns).toBe(99);

    expect(resolved.inheritContext).not.toBe(false);
    expect(resolved.inheritContext).toBe(true);

    expect(resolved.runInBackground).not.toBe(false);
    expect(resolved.runInBackground).toBe(true);

    expect(resolved.isolated).not.toBe(false);
    expect(resolved.isolated).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveJoinMode
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveJoinMode", () => {
  it("returns the global default for background agents", () => {
    for (const mode of JOIN_MODES) {
      expect(resolveJoinMode(mode, true)).toBe(mode);
    }
  });

  it("ignores join mode for foreground agents", () => {
    for (const mode of JOIN_MODES) {
      expect(resolveJoinMode(mode, false)).toBeUndefined();
    }
  });

  it("returns undefined for background agents with undefined default", () => {
    expect(resolveJoinMode(undefined, true)).toBeUndefined();
  });

  it("returns undefined for foreground agents with undefined default", () => {
    expect(resolveJoinMode(undefined, false)).toBeUndefined();
  });

  it("smart join mode only applies to background", () => {
    expect(resolveJoinMode("smart", true)).toBe("smart");
    expect(resolveJoinMode("smart", false)).toBeUndefined();
  });

  it("async join mode only applies to background", () => {
    expect(resolveJoinMode("async", true)).toBe("async");
    expect(resolveJoinMode("async", false)).toBeUndefined();
  });
});
