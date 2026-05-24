import { emitTelemetry } from "./telemetry.js";
import type { AgentConfig, ValidationCriterion, ValidationResult } from "./types.js";

// CVE-004 FIX: Maximum sizes for validation inputs
const MAX_OUTPUT_SIZE = 100000;  // 100KB
const MAX_CRITERIA_COUNT = 20;
const MAX_CRITERION_LENGTH = 1000;
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * CVE-004 FIX: Sanitize input for inclusion in validator prompt.
 *
 * Security model: no regex blacklist — trivially bypassed with Unicode,
 * whitespace, or encoding variations ("security theater").
 * Instead, we rely on:
 *   1. Control character removal (prevents terminal/encoding attacks)
 *   2. Hard length limits (prevents prompt stuffing)
 *   3. Sandbox isolation: validators run with isolated=true, levelLimit=0,
 *      skipValidators=true, so even a compromised validator cannot recurse.
 */
function sanitizeValidatorInput(input: string, maxLength: number = MAX_OUTPUT_SIZE): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // Remove control chars
    .slice(0, maxLength);
}

/**
 * Log validation criteria limit warning via telemetry.
 */
function logCriteriaLimit(criteriaCount: number, maxCount: number): void {
  const message = `Too many validation criteria (${criteriaCount}), limiting to ${maxCount}`;
  emitTelemetry("agent:validation-failed" as any, { 
    name: "validator", 
    errors: [message] 
  });
}

/**
 * Build a system prompt for a validator agent.
 * The validator receives the main agent's output and must judge it against criteria.
 * CVE-004 FIX: Input sanitization to prevent validator manipulation.
 */
export function buildValidatorPrompt(
  originalOutput: string,
  criteria: string[],
  mainAgentDescription: string,
): string {
  // CVE-004 FIX: Validate and sanitize inputs
  if (criteria.length > MAX_CRITERIA_COUNT) {
    logCriteriaLimit(criteria.length, MAX_CRITERIA_COUNT);
    criteria = criteria.slice(0, MAX_CRITERIA_COUNT);
  }
  
  const sanitizedOutput = sanitizeValidatorInput(originalOutput, MAX_OUTPUT_SIZE);
  const sanitizedDescription = sanitizeValidatorInput(mainAgentDescription, MAX_DESCRIPTION_LENGTH);
  const sanitizedCriteria = criteria.map(c => 
    sanitizeValidatorInput(c, MAX_CRITERION_LENGTH)
  );
  
  const criteriaList = sanitizedCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `You are a quality validator. Your job is to critically review another agent's output.

## Agent Description
${sanitizedDescription}

## Validation Criteria
${criteriaList}

## Agent Output to Validate
${sanitizedOutput}

## Instructions
For each criterion, determine if the output PASSES or FAILS. Be strict but fair.
Respond with a JSON block:
\`\`\`text
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
        ?? criteria.every((c: ValidationCriterion) => c.passed);
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
