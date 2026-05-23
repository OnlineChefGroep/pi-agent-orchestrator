/**
 * validators.ts — Adversarial validation: spawn validator agents to critique
 * main agent output against defined criteria. Uses the Droid Factory pattern.
 */

import type { AgentConfig, ValidationCriterion, ValidationResult } from "./types.js";

/**
 * Build a system prompt for a validator agent.
 * The validator receives the main agent's output and must judge it against criteria.
 */
export function buildValidatorPrompt(
  originalOutput: string,
  criteria: string[],
  mainAgentDescription: string,
): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `You are a quality validator. Your job is to critically review another agent's output.

## Agent Description
${mainAgentDescription}

## Validation Criteria
${criteriaList}

## Agent Output to Validate
${originalOutput}

## Instructions
For each criterion, determine if the output PASSES or FAILS. Be strict but fair.
Respond with a JSON block:
\`\`\`json
{
  "criteria": [
    { "criterion": "criterion text", "passed": true/false, "feedback": "explanation" }
  ],
  "summary": "Overall assessment (1-2 sentences)",
  "overallPassed": true/false
}
\`\`\`
`;
}

/**
 * Parse a validation result from validator output text.
 * Looks for JSON block, falls back to markdown parsing.
 */
export function parseValidationResult(text: string, agentId: string): ValidationResult {
  // Guard: empty input
  if (!text.trim()) {
    return {
      agentId,
      passed: false,
      criteria: [],
      summary: "Validator returned empty output",
    };
  }

  try {
    // Try to find JSON block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      const criteria: ValidationCriterion[] = Array.isArray(parsed.criteria)
        ? parsed.criteria
        : [];
      const passed = parsed.overallPassed
        ?? criteria.every((c: ValidationCriterion) => c.passed)
        ?? false;
      return {
        agentId,
        passed,
        criteria,
        summary: parsed.summary ?? "",
      };
    }
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Fallback: return failure if can't parse
  return {
    agentId,
    passed: false,
    criteria: [],
    summary: "Could not parse validator output",
  };
}

/**
 * Check if an agent config has validators configured.
 */
export function hasValidators(config?: AgentConfig): boolean {
  return (config?.validators?.length ?? 0) > 0;
}

/**
 * Extract validator description from config for prompt generation.
 */
export function getAgentDescription(config?: AgentConfig): string {
  if (!config) return "an autonomous sub-agent";
  const name = config.displayName ?? config.name;
  return `${name}: ${config.description}`;
}
