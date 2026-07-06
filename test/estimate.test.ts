import { describe, expect, it } from "vitest";
import { buildAgentEstimate } from "../src/estimate.js";
import type { AgentConfig } from "../src/types.js";

describe("buildAgentEstimate", () => {
  it("generates an estimate with all fields provided and inheritContext=false", () => {
    // text length 12 -> 12 / 4 = 3 tokens
    const prompt = "hello world!";
    // text length 20 -> 20 / 4 = 5 tokens
    const systemPrompt = "this is a system msg";

    const config: AgentConfig = {
      systemPrompt,
      // Just some required fields if any, we'll see if TypeScript complains
      // but systemPrompt is enough for this function since it uses config?.systemPrompt
    } as any;

    const result = buildAgentEstimate({
      prompt,
      description: "My test agent",
      type: "assistant",
      config,
      inheritContext: false,
      maxTurns: 5,
    });

    const lines = result.split("\n");
    expect(lines).toContain("Agent dry-run estimate");
    expect(lines).toContain("Type: assistant");
    expect(lines).toContain("Description: My test agent");
    expect(lines).toContain("Prompt tokens: ~3");
    expect(lines).toContain("System prompt tokens: ~5");
    expect(lines).toContain("Estimated launch tokens: ~8");
    expect(lines).toContain("Max turns: 5");
    expect(lines).toContain("Parent context is not inherited.");
    expect(lines).toContain("No agent was spawned.");
  });

  it("handles missing config and inheritContext=true", () => {
    const prompt = "hello"; // length 5 -> ceil(5/4) = 2 tokens

    const result = buildAgentEstimate({
      prompt,
      description: "No config agent",
      type: "worker",
      inheritContext: true,
      // maxTurns undefined
    });

    const lines = result.split("\n");
    expect(lines).toContain("Prompt tokens: ~2");
    expect(lines).toContain("System prompt tokens: ~0");
    expect(lines).toContain("Estimated launch tokens: ~2");
    expect(lines).toContain("Max turns: unlimited");
    expect(lines).toContain(
      "Parent context was requested; actual usage depends on conversation size and is not included in this estimate.",
    );
  });

  it("handles empty prompts", () => {
    const result = buildAgentEstimate({
      prompt: "",
      description: "Empty",
      type: "empty-type",
      inheritContext: false,
    });

    const lines = result.split("\n");
    expect(lines).toContain("Prompt tokens: ~0");
    expect(lines).toContain("System prompt tokens: ~0");
    expect(lines).toContain("Estimated launch tokens: ~0");
  });
});
