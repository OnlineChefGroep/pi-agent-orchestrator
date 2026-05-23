import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../src/types.js";
import { buildValidatorPrompt, getAgentDescription, hasValidators, parseValidationResult } from "../src/validators.js";

describe("buildValidatorPrompt", () => {
  it("includes all criteria and the agent output", () => {
    const output = "The code is clean and well-tested.";
    const criteria = ["Has test coverage", "Follows style guide"];
    const description = "general-purpose: does things";

    const prompt = buildValidatorPrompt(output, criteria, description);

    expect(prompt).toContain("Has test coverage");
    expect(prompt).toContain("Follows style guide");
    expect(prompt).toContain("The code is clean and well-tested.");
    expect(prompt).toContain(description);
    expect(prompt).toContain("overallPassed");
  });

  it("handles empty criteria array gracefully", () => {
    const prompt = buildValidatorPrompt("output", [], "desc");
    expect(prompt).toContain("output");
    expect(prompt).toContain("desc");
    // Should still produce a valid prompt structure
    expect(prompt).toContain("Validation Criteria");
  });
});

describe("parseValidationResult", () => {
  it("extracts criteria and overallPassed from a JSON block", () => {
    const text = [
      "Here is my review:",
      "```json",
      JSON.stringify({
        criteria: [
          { criterion: "Has tests", passed: true, feedback: "All good" },
          { criterion: "Style guide", passed: false, feedback: "Missing semicolons" },
        ],
        summary: "Mostly good but style issues",
        overallPassed: false,
      }),
      "```",
    ].join("\n");

    const result = parseValidationResult(text, "validator-1");

    expect(result.agentId).toBe("validator-1");
    expect(result.passed).toBe(false);
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0].passed).toBe(true);
    expect(result.criteria[1].passed).toBe(false);
    expect(result.criteria[1].feedback).toBe("Missing semicolons");
    expect(result.summary).toBe("Mostly good but style issues");
  });

  it("infers overallPassed from criteria when not explicitly set", () => {
    const text = [
      "```json",
      JSON.stringify({
        criteria: [
          { criterion: "A", passed: true, feedback: "ok" },
          { criterion: "B", passed: true, feedback: "ok" },
        ],
        summary: "All good",
      }),
      "```",
    ].join("\n");

    const result = parseValidationResult(text, "v");
    expect(result.passed).toBe(true);
  });

  it("handles missing JSON block with fallback", () => {
    const result = parseValidationResult("Just some plain text, no JSON here.", "v-fallback");

    expect(result.agentId).toBe("v-fallback");
    expect(result.passed).toBe(false);
    expect(result.criteria).toHaveLength(0);
    expect(result.summary).toBe("Could not parse validator output");
  });

  it("handles empty input", () => {
    const result = parseValidationResult("", "v-empty");
    expect(result.passed).toBe(false);
    expect(result.summary).toBe("Validator returned empty output");
  });

  it("handles whitespace-only input", () => {
    const result = parseValidationResult("   \n  ", "v-blank");
    expect(result.passed).toBe(false);
    expect(result.summary).toBe("Validator returned empty output");
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseValidationResult(
      "```json\n{ this is not valid json }\n```",
      "v-broken",
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toBe("Could not parse validator output");
  });
});

describe("hasValidators", () => {
  it("returns true when validators are configured", () => {
    const config: AgentConfig = {
      name: "test",
      description: "test agent",
      extensions: true,
      skills: true,
      systemPrompt: "test",
      promptMode: "replace",
      validators: [{ agentId: "reviewer", criteria: ["check stuff"] }],
    };
    expect(hasValidators(config)).toBe(true);
  });

  it("returns false when validators array is empty", () => {
    const config: AgentConfig = {
      name: "test",
      description: "test agent",
      extensions: true,
      skills: true,
      systemPrompt: "test",
      promptMode: "replace",
      validators: [],
    };
    expect(hasValidators(config)).toBe(false);
  });

  it("returns false when no validators are configured", () => {
    const config: AgentConfig = {
      name: "test",
      description: "test agent",
      extensions: true,
      skills: true,
      systemPrompt: "test",
      promptMode: "replace",
    };
    expect(hasValidators(config)).toBe(false);
  });

  it("returns false for undefined config", () => {
    expect(hasValidators(undefined)).toBe(false);
  });
});

describe("getAgentDescription", () => {
  it("returns displayName when available", () => {
    const config: AgentConfig = {
      name: "plan",
      displayName: "Plan",
      description: "Plans things",
      extensions: true,
      skills: true,
      systemPrompt: "plan",
      promptMode: "replace",
    };
    expect(getAgentDescription(config)).toBe("Plan: Plans things");
  });

  it("falls back to name when displayName is missing", () => {
    const config: AgentConfig = {
      name: "custom-agent",
      description: "Does custom stuff",
      extensions: true,
      skills: true,
      systemPrompt: "do it",
      promptMode: "replace",
    };
    expect(getAgentDescription(config)).toBe("custom-agent: Does custom stuff");
  });

  it("returns fallback for undefined config", () => {
    expect(getAgentDescription(undefined)).toBe("an autonomous sub-agent");
  });
});
