import type { AgentConfig } from "./types.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildAgentEstimate(input: {
  prompt: string;
  description: string;
  type: string;
  config?: AgentConfig;
  inheritContext: boolean;
  maxTurns?: number;
}): string {
  const promptTokens = estimateTokens(input.prompt);
  const systemTokens = estimateTokens(input.config?.systemPrompt ?? "");
  const total = promptTokens + systemTokens;
  const contextNote = input.inheritContext
    ? "Parent context was requested; actual usage depends on conversation size and is not included in this estimate."
    : "Parent context is not inherited.";
  return [
    "Agent dry-run estimate",
    `Type: ${input.type}`,
    `Description: ${input.description}`,
    `Prompt tokens: ~${promptTokens}`,
    `System prompt tokens: ~${systemTokens}`,
    `Estimated launch tokens: ~${total}`,
    `Max turns: ${input.maxTurns ?? "unlimited"}`,
    contextNote,
    "No agent was spawned.",
  ].join("\n");
}
