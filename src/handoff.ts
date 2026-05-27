/**
 * handoff.ts — Structured handoff protocol for chain-of-agents.
 *
 * Enables machine-parseable handoffs between chained agents without context
 * leakage. Inspired by Claude Code and Droid Factory handoff patterns.
 */

/** Structured handoff produced by a sub-agent at the end of its response. */
export interface AgentHandoff {
  type: "handoff";
  status: "success" | "partial" | "failed";
  summary: string;
  findings: string[];
  nextSteps?: string[];
  confidence?: number;
  evidence?: string[];
  files?: string[];
  artifacts?: { type: string; path: string }[];
}

const VALID_STATUSES = new Set(["success", "partial", "failed"]);

// CVE-008 FIX: JSON parsing limits
const MAX_JSON_SIZE = 1024 * 1024;  // 1MB max JSON
const MAX_JSON_KEYS = 1000;  // Total key count limit (renamed from MAX_JSON_DEPTH for clarity)
const MAX_FINDINGS_COUNT = 100;
const MAX_SUMMARY_LENGTH = 10000;
const MAX_STRING_LENGTH = 50000;

/**
 * CVE-008 FIX: Safe JSON parser with size and key count limits.
 *
 * Tracks total number of keys in the JSON structure to prevent
 * excessively large payloads. The reviver counts each key encountered
 * during parsing.
 */
function safeJsonParse(input: string, maxKeys: number = MAX_JSON_KEYS): unknown {
  if (input.length > MAX_JSON_SIZE) {
    throw new Error(`JSON size ${input.length} exceeds maximum ${MAX_JSON_SIZE} bytes`);
  }
  
  // Track total key count during parsing
  let keyCount = 0;
  
  const reviver = (key: string, value: unknown) => {
    // Count each key (excluding the empty string for the root object)
    if (typeof key === 'string' && key !== '') {
      keyCount++;
      if (keyCount > maxKeys) {
        throw new Error(`JSON key count exceeds maximum of ${maxKeys}`);
      }
    }
    
    // Limit string lengths
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH);
    }
    
    return value;
  };
  
  return JSON.parse(input, reviver);
}

/**
 * Extract a JSON code block from agent output text.
 *
 * Attempts ```json fences first, then ````json````, then raw JSON.
 * Returns the trimmed inner content, or null if nothing found.
 */
function extractJsonBlock(text: string): string | null {
  if (!text) return null;

  // Try ```json ... ``` (most common)
  const fenced = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();

  // Try raw JSON object at the very end of the response
  const lastBrace = text.lastIndexOf("{");
  if (lastBrace === -1) return null;

  const fromBrace = text.slice(lastBrace);
  const closingBrace = fromBrace.lastIndexOf("}");
  if (closingBrace === -1) return null;

  return fromBrace.slice(0, closingBrace + 1).trim();
}

/**
 * Validate that a parsed object conforms to the AgentHandoff interface.
 * CVE-008 FIX: Also validates field sizes and counts.
 * Returns an array of missing/invalid field names, or empty if valid.
 */
function validateHandoffShape(obj: Record<string, unknown>): string[] {
  const issues: string[] = [];

  if (obj.type !== "handoff") issues.push("type");
  if (!VALID_STATUSES.has(obj.status as string)) issues.push("status");
  if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) {
    issues.push("summary");
  } else if (obj.summary.length > MAX_SUMMARY_LENGTH) {
    issues.push("summary (too long)");
  }
  if (!Array.isArray(obj.findings)) {
    issues.push("findings");
  } else if (obj.findings.length === 0) {
    issues.push("findings (empty)");
  } else if (obj.findings.length > MAX_FINDINGS_COUNT) {
    issues.push(`findings (too many: ${obj.findings.length})`);
  }

  if (obj.files !== undefined) {
    if (!Array.isArray(obj.files)) issues.push("files");
    else if (obj.files.length > 100) issues.push(`files (too many: ${obj.files.length})`);
    else if (!obj.files.every(f => typeof f === "string")) issues.push("files (invalid content)");
  }

  if (obj.artifacts !== undefined) {
    if (!Array.isArray(obj.artifacts)) issues.push("artifacts");
    else if (obj.artifacts.length > 100) issues.push(`artifacts (too many: ${obj.artifacts.length})`);
    else if (!obj.artifacts.every(a => typeof a === "object" && a !== null && typeof (a as any).type === "string" && typeof (a as any).path === "string")) issues.push("artifacts (invalid content)");
  }

  return issues;
}

/**
 * Parse a structured handoff from agent output text.
 *
 * Gracefully handles malformed, missing, or incomplete JSON. Never throws —
 * always returns null with a console warning on parse failures.
 *
 * CVE-008 FIX: Added size and depth limits for JSON parsing.
 *
 * @returns A valid AgentHandoff, or null if no handoff could be parsed.
 */
export function parseHandoff(text: string): AgentHandoff | null {
  // Early exit: null/empty input
  if (!text) return null;

  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) {
    // If the text contains a ```json opener, a handoff was attempted but we
    // couldn't extract parseable content — log a warning.
    if (text.includes("```json")) {
      console.warn("[handoff] Handoff block found but could not extract parseable JSON content");
    }
    return null;
  }

  let parsed: unknown;
  try {
    // CVE-008 FIX: Use safe JSON parser with limits
    parsed = safeJsonParse(jsonBlock);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.warn(`[handoff] Failed to parse handoff JSON — malformed JSON: ${msg}`);
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[handoff] Parsed JSON is not an object");
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const issues = validateHandoffShape(obj);
  if (issues.length > 0) {
    console.warn(`[handoff] Missing or invalid fields: ${issues.join(", ")}`);
    return null;
  }

  return {
    type: "handoff",
    status: obj.status as AgentHandoff["status"],
    summary: (obj.summary as string).trim(),
    findings: obj.findings as string[],
    nextSteps: Array.isArray(obj.nextSteps) ? obj.nextSteps as string[] : undefined,
    confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
    evidence: Array.isArray(obj.evidence) ? obj.evidence as string[] : undefined,
    files: Array.isArray(obj.files) ? obj.files as string[] : undefined,
    artifacts: Array.isArray(obj.artifacts) ? obj.artifacts as { type: string; path: string }[] : undefined,
  };
}

/**
 * Build a handoff template for injection into an agent's system prompt.
 *
 * This tells the agent to produce a structured JSON handoff at the very end
 * of its response, enabling the parent to machine-parse the result for
 * chain-of-agents workflows.
 */
export function buildHandoffPrompt(): string {
  return `# Structured Handoff Protocol
At the end of your response, you MUST produce a structured JSON handoff. This allows parent agents to parse your results programmatically.

The handoff must be enclosed in a \`\`\`json code block and must be the LAST thing in your response. Format:

\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "A concise 2-3 sentence summary of what you did",
  "findings": ["Finding 1", "Finding 2"],
  "nextSteps": ["Step 1", "Step 2"],
  "confidence": 0.9,
  "evidence": ["/path/to/file1.ts", "/path/to/file2.ts"],
  "files": ["/path/to/new_file.ts"],
  "artifacts": [{"type": "design", "path": "/path/to/design.md"}]
}
\`\`\`

Field descriptions:
- **type** (required): Always "handoff"
- **status** (required): "success" (task complete), "partial" (partially complete), or "failed" (could not complete)
- **summary** (required): Concise 2-3 sentence summary of what was accomplished
- **findings** (required): Key discoveries, decisions, or results — at least one item
- **nextSteps** (optional): What should happen next, if applicable
- **confidence** (optional): Number 0-1 indicating your confidence in the result quality
- **evidence** (optional): Absolute file paths that support your findings
- **files** (optional): Absolute file paths to files you created or modified
- **artifacts** (optional): Objects with 'type' and 'path' for generated artifacts

Example:

\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Investigated the rate-limiting logic and found that the token bucket is not refilling correctly due to a missing interval. Fixed the issue by correcting the refill timer in rate-limiter.ts.",
  "findings": ["The refill interval was set to 0ms instead of 1000ms", "The token bucket never refilled after the first burst", "Fixed by setting interval to 1000ms in the RateLimiter constructor"],
  "nextSteps": ["Write a unit test for the refill behavior", "Check if other instances of RateLimiter have the same bug"],
  "confidence": 0.95,
  "evidence": ["/home/user/project/src/rate-limiter.ts", "/home/user/project/src/api-handler.ts"]
}
\`\`\``;
}

/**
 * Render a structured handoff back into readable text for the parent agent.
 *
 * Converts the machine-parseable handoff into a human-readable format that
 * preserves all fields, suitable for display or forwarding to the parent.
 */
export function renderHandoffForParent(handoff: AgentHandoff): string {
  const statusLabel =
    handoff.status === "success" ? "completed successfully"
    : handoff.status === "partial" ? "partially completed"
    : "failed";

  const parts: string[] = [
    `[Handoff: ${statusLabel}]`,
    `Summary: ${handoff.summary}`,
  ];

  if (handoff.findings.length > 0) {
    parts.push("Findings:");
    for (const finding of handoff.findings) {
      parts.push(`  - ${finding}`);
    }
  }

  if (handoff.nextSteps?.length) {
    parts.push("Next Steps:");
    for (const step of handoff.nextSteps) {
      parts.push(`  - ${step}`);
    }
  }

  if (handoff.confidence !== undefined) {
    parts.push(`Confidence: ${Math.round(handoff.confidence * 100)}%`);
  }

  if (handoff.evidence?.length) {
    parts.push("Evidence:");
    for (const path of handoff.evidence) {
      parts.push(`  - ${path}`);
    }
  }

  if (handoff.files?.length) {
    parts.push("Files:");
    for (const file of handoff.files) {
      parts.push(`  - ${file}`);
    }
  }

  if (handoff.artifacts?.length) {
    parts.push("Artifacts:");
    for (const art of handoff.artifacts) {
      parts.push(`  - [${art.type}] ${art.path}`);
    }
  }

  return parts.join("\n");
}
