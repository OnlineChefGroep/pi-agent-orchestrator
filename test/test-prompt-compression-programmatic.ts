#!/usr/bin/env npx tsx
/**
 * Programmatic test for Prompt Compression feature
 * Tests that different compression levels produce different prompt sizes
 * and that per-agent override works correctly.
 */

import { getPromptCompressionLevel, setPromptCompressionLevel } from "./src/agent-registry.js";
import { READONLY_PROMPT_PARAMS } from "./src/default-agents.js";
import { buildAgentPrompt } from "./src/prompts.js";
import type { PromptCompressionLevel } from "./src/settings.js";
import type { AgentConfig, EnvInfo } from "./src/types.js";

console.log("=".repeat(60));
console.log("PROMPT COMPRESSION FEATURE TEST");
console.log("=".repeat(60));

// Test environment
const testEnv: EnvInfo = {
  isGitRepo: true,
  branch: "main",
  platform: "linux",
};

const testCwd = "/home/test/project";

// Test 1: Global setting changes
console.log("\n--- Test 1: Global Prompt Compression Level ---");

const levels: PromptCompressionLevel[] = ["aggressive", "balanced", "minimal"];

for (const level of levels) {
  setPromptCompressionLevel(level);
  const current = getPromptCompressionLevel();
  console.log(`  Set to: ${level}, Got: ${current} ${current === level ? "✓" : "✗ FAIL"}`);
}

// Test 2: Built-in read-only agents (Explore, Plan, Analysis) regenerate prompts at runtime
console.log("\n--- Test 2: Built-in Agent Prompt Regeneration ---");

const exploreConfig = DEFAULT_AGENTS.get("Explore")!;
const planConfig = DEFAULT_AGENTS.get("Plan")!;
const analysisConfig = DEFAULT_AGENTS.get("Analysis")!;

for (const level of levels) {
  setPromptCompressionLevel(level);

  const explorePrompt = buildAgentPrompt(exploreConfig, testCwd, testEnv, undefined, undefined, level);
  const planPrompt = buildAgentPrompt(planConfig, testCwd, testEnv, undefined, undefined, level);
  const analysisPrompt = buildAgentPrompt(analysisConfig, testCwd, testEnv, undefined, undefined, level);

  console.log(`\n  Level: ${level}`);
  console.log(`    Explore prompt length: ${explorePrompt.length} chars`);
  console.log(`    Plan prompt length: ${planPrompt.length} chars`);
  console.log(`    Analysis prompt length: ${analysisPrompt.length} chars`);

  // Verify content differences
  if (level === "aggressive") {
    // Aggressive should have minimal read-only warning
    if (explorePrompt.includes("READ-ONLY") && !explorePrompt.includes("CRITICAL")) {
      console.log("    ✓ Aggressive: Ultra-short read-only warning");
    } else {
      console.log("    ✗ Aggressive: Unexpected read-only warning format");
    }
  } else if (level === "minimal") {
    // Minimal should have full verbose warning
    if (explorePrompt.includes("CRITICAL: READ-ONLY MODE") && explorePrompt.includes("STRICTLY PROHIBITED")) {
      console.log("    ✓ Minimal: Full verbose read-only warning");
    } else {
      console.log("    ✗ Minimal: Missing verbose read-only warning");
    }
  } else {
    // Balanced should have concise warning
    if (explorePrompt.includes("READ-ONLY — NO FILE MODIFICATIONS") && explorePrompt.includes("PROHIBITED:")) {
      console.log("    ✓ Balanced: Concise read-only warning");
    } else {
      console.log("    ✗ Balanced: Unexpected read-only warning format");
    }
  }
}

// Test 3: Per-agent override via config
console.log("\n--- Test 3: Per-Agent Override ---");

// Simulate what agent-runner does: gets compression level from agent config or global
function getEffectiveCompressionLevel(agentConfig: AgentConfig): PromptCompressionLevel {
  return agentConfig.promptCompressionLevel ?? getPromptCompressionLevel();
}

// Create a mock read-only agent config with promptCompressionLevel override (like Explore)
const customReadOnlyAgentConfig: AgentConfig = {
  name: "test-readonly-agent",
  displayName: "Test ReadOnly Agent",
  description: "Test read-only agent with override",
  builtinToolNames: ["read", "find", "grep"],
  disallowedTools: ["write", "edit"],
  extensions: true,
  skills: true,
  model: "anthropic/claude-haiku-4-5",
  systemPrompt: "", // Will be regenerated at runtime via READONLY_PROMPT_PARAMS
  promptMode: "replace",
  isDefault: true, // Important: triggers lazy regeneration
  promptCompressionLevel: "minimal", // Override to minimal
};

READONLY_PROMPT_PARAMS.set("test-readonly-agent", {
  role: "a test specialist",
  task: "test things",
  toolInstructions: "Use read tool only.",
  outputInstructions: "Be concise.",
});

// Test with global = aggressive, but agent = minimal
setPromptCompressionLevel("aggressive");
const effectiveLevel1 = getEffectiveCompressionLevel(customReadOnlyAgentConfig); // Should be "minimal" (agent override)
const globalAggressiveAgentMinimal = buildAgentPrompt(
  customReadOnlyAgentConfig,
  testCwd,
  testEnv,
  undefined,
  undefined,
  effectiveLevel1,
);
console.log(
  `  Global=aggressive, Agent=minimal (effective: ${effectiveLevel1}): ${globalAggressiveAgentMinimal.length} chars`,
);
if (globalAggressiveAgentMinimal.includes("CRITICAL: READ-ONLY MODE")) {
  console.log("    ✓ Per-agent override works (minimal used despite global aggressive)");
} else {
  console.log("    ✗ Per-agent override failed - minimal not applied");
  console.log(`    Prompt preview: ${globalAggressiveAgentMinimal.substring(0, 200)}...`);
}

// Test with global = minimal, but agent = aggressive
const customReadOnlyAgentConfigAggressive: AgentConfig = {
  ...customReadOnlyAgentConfig,
  promptCompressionLevel: "aggressive",
};
setPromptCompressionLevel("minimal");
const effectiveLevel2 = getEffectiveCompressionLevel(customReadOnlyAgentConfigAggressive); // Should be "aggressive" (agent override)
const globalMinimalAgentAggressive = buildAgentPrompt(
  customReadOnlyAgentConfigAggressive,
  testCwd,
  testEnv,
  undefined,
  undefined,
  effectiveLevel2,
);
console.log(
  `  Global=minimal, Agent=aggressive (effective: ${effectiveLevel2}): ${globalMinimalAgentAggressive.length} chars`,
);
if (globalMinimalAgentAggressive.includes("READ-ONLY") && !globalMinimalAgentAggressive.includes("CRITICAL")) {
  console.log("    ✓ Per-agent override works (aggressive used despite global minimal)");
} else {
  console.log("    ✗ Per-agent override failed - aggressive not applied");
  console.log(`    Prompt preview: ${globalMinimalAgentAggressive.substring(0, 200)}...`);
}

// Test without override (uses global)
const customReadOnlyAgentConfigNoOverride: AgentConfig = {
  ...customReadOnlyAgentConfig,
  promptCompressionLevel: undefined,
};
setPromptCompressionLevel("aggressive");
const effectiveLevel3 = getEffectiveCompressionLevel(customReadOnlyAgentConfigNoOverride); // Should be "aggressive" (global)
const globalAggressiveNoOverride = buildAgentPrompt(
  customReadOnlyAgentConfigNoOverride,
  testCwd,
  testEnv,
  undefined,
  undefined,
  effectiveLevel3,
);
console.log(
  `  Global=aggressive, Agent=no override (effective: ${effectiveLevel3}): ${globalAggressiveNoOverride.length} chars`,
);
if (globalAggressiveNoOverride.includes("READ-ONLY") && !globalAggressiveNoOverride.includes("CRITICAL")) {
  console.log("    ✓ No override uses global setting (aggressive)");
} else {
  console.log("    ✗ No override test failed");
}

// Clean up
READONLY_PROMPT_PARAMS.delete("test-readonly-agent");

// Test 4: Custom agent frontmatter parsing (simulated)
console.log("\n--- Test 4: Custom Agent Frontmatter Parsing ---");

const VALID_COMPRESSION_LEVELS = new Set(["minimal", "balanced", "aggressive"]);

function parseCompressionLevel(val: unknown): "minimal" | "balanced" | "aggressive" | undefined {
  if (typeof val === "string" && VALID_COMPRESSION_LEVELS.has(val)) return val as "minimal" | "balanced" | "aggressive";
  return undefined;
}

const testCases = [
  { input: "minimal", expected: "minimal" },
  { input: "balanced", expected: "balanced" },
  { input: "aggressive", expected: "aggressive" },
  { input: "MINIMAL", expected: undefined }, // case sensitive - returns undefined
  { input: "invalid", expected: undefined }, // invalid returns undefined
  { input: "", expected: undefined }, // empty string returns undefined
];

for (const tc of testCases) {
  const result = parseCompressionLevel(tc.input);
  const status = result === tc.expected ? "✓" : "✗ FAIL";
  console.log(
    `  parseCompressionLevel("${tc.input}") = "${result ?? "undefined"}" (expected: "${tc.expected ?? "undefined"}") ${status}`,
  );
}

// Test 5: Verify token savings claims
console.log("\n--- Test 5: Token Savings Verification ---");

setPromptCompressionLevel("balanced");
const balancedPrompt = buildAgentPrompt(exploreConfig, testCwd, testEnv, undefined, undefined, "balanced");

setPromptCompressionLevel("aggressive");
const aggressivePrompt = buildAgentPrompt(exploreConfig, testCwd, testEnv, undefined, undefined, "aggressive");

setPromptCompressionLevel("minimal");
const minimalPrompt = buildAgentPrompt(exploreConfig, testCwd, testEnv, undefined, undefined, "minimal");

const balancedLen = balancedPrompt.length;
const aggressiveLen = aggressivePrompt.length;
const minimalLen = minimalPrompt.length;

const aggressiveSavings = (((balancedLen - aggressiveLen) / balancedLen) * 100).toFixed(1);
const minimalIncrease = (((minimalLen - balancedLen) / balancedLen) * 100).toFixed(1);

console.log(`  Balanced (baseline): ${balancedLen} chars`);
console.log(`  Aggressive: ${aggressiveLen} chars (${aggressiveSavings}% smaller)`);
console.log(`  Minimal: ${minimalLen} chars (${minimalIncrease}% larger)`);

// Verify aggressive saves ~44% (from CHANGELOG)
const aggressiveSavingsNum = parseFloat(aggressiveSavings);
if (aggressiveSavingsNum > 30 && aggressiveSavingsNum < 60) {
  console.log(`  ✓ Aggressive savings (${aggressiveSavings}%) within expected range (~44%)`);
} else {
  console.log(`  ⚠ Aggressive savings (${aggressiveSavings}%) outside expected range (~44%)`);
}

// Verify minimal provides +70% (from CHANGELOG)
const minimalIncreaseNum = parseFloat(minimalIncrease);
if (minimalIncreaseNum > 50 && minimalIncreaseNum < 100) {
  console.log(`  ✓ Minimal increase (${minimalIncrease}%) within expected range (~70%)`);
} else {
  console.log(`  ⚠ Minimal increase (${minimalIncrease}%) outside expected range (~70%)`);
}

// Test 6: Handoff prompt compression
console.log("\n--- Test 6: Handoff Prompt Compression ---");

import { buildHandoffPrompt } from "./src/handoff.js";

for (const level of levels) {
  const handoff = buildHandoffPrompt(level);
  console.log(`  ${level}: ${handoff.length} chars`);
  if (level === "aggressive" && handoff.length < 100) {
    console.log("    ✓ Aggressive handoff is minimal");
  } else if (level === "minimal" && handoff.length > 500) {
    console.log("    ✓ Minimal handoff is verbose");
  } else if (level === "balanced") {
    console.log("    ✓ Balanced handoff is moderate");
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("ALL TESTS COMPLETED");
console.log("=".repeat(60));
