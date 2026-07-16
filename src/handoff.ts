import { logger } from "./logger.js";
import type { PromptCompressionLevel } from "./types.js";
/**
 * handoff.ts — Structured handoff protocol for chain-of-agents.
 *
 * Enables machine-parseable handoffs between chained agents without context
 * leakage. Inspired by Claude Code and Droid Factory handoff patterns.
 *
 * ## Handoff v2 (typed artifacts)
 *
 * The `artifacts` field is a discriminated union on `type`:
 *
 *   - `"file"`   — path on disk (required `path`; optional `mimeType`, `title`)
 *   - `"branch"` — git branch (required `branch`; optional `base`, `commits`, `title`)
 *   - `"url"`    — web URL (required `url`; optional `title`, `description`)
 *   - `"note"`   — free-form text (required `title` + `value`; optional `mimeType`)
 *
 * Legacy loose artifacts (`{type: "<unknown>", path, title, value, mimeType}`)
 * are coerced best-effort into a `note` to keep older agents working.
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
  /** v2 typed artifacts — see {@link HandoffArtifactV2} for the discriminated union. */
  artifacts?: HandoffArtifactV2[];
}

/** A reference to a file on disk. */
export interface HandoffFileArtifact {
  type: "file";
  /** Absolute or repo-relative path to the file. */
  path: string;
  /** MIME type override (e.g., "text/typescript"). Inferred from extension when omitted. */
  mimeType?: string;
  /** Short label (e.g., "Fixed rate limiter"). */
  title?: string;
}

/** A reference to a git branch. */
export interface HandoffBranchArtifact {
  type: "branch";
  /** The branch name. */
  branch: string;
  /** The base branch this was forked from. */
  base?: string;
  /** Commit SHAs included in the branch. */
  commits?: string[];
  /** Short label. */
  title?: string;
}

/** A reference to a URL. */
export interface HandoffUrlArtifact {
  type: "url";
  /** The URL. */
  url: string;
  /** Short label. */
  title?: string;
  /** One-line description. */
  description?: string;
}

/** A free-form note or text artifact. */
export interface HandoffNoteArtifact {
  type: "note";
  /** Short label. */
  title: string;
  /** The note text. */
  value: string;
  /** MIME type override. */
  mimeType?: string;
}

/** v2 typed handoff artifact — discriminated union on `type`. */
export type HandoffArtifactV2 =
  | HandoffFileArtifact
  | HandoffBranchArtifact
  | HandoffUrlArtifact
  | HandoffNoteArtifact;

/** All known v2 artifact types. */
export const HANDOFF_ARTIFACT_TYPES = ["file", "branch", "url", "note"] as const;
export type HandoffArtifactType = typeof HANDOFF_ARTIFACT_TYPES[number];

/**
 * Loose handoff artifact — the pre-v2 shape that older agents may still emit.
 * Kept as a structural alias so existing call sites and external consumers
 * continue to typecheck; {@link parseHandoff} coerces these into v2 shapes.
 */
export interface HandoffArtifact {
  type: string;
  path?: string;
  title?: string;
  value?: string;
  mimeType?: string;
  branch?: string;
  base?: string;
  commits?: string[];
  url?: string;
  description?: string;
}

const VALID_STATUSES = new Set(["success", "partial", "failed"]);

// CVE-008 FIX: JSON parsing limits
const MAX_JSON_SIZE = 1024 * 1024;  // 1MB max JSON
const MAX_JSON_KEYS = 1000;  // Total key count limit (renamed from MAX_JSON_DEPTH for clarity)
const MAX_JSON_DEPTH = 20;   // Maximum nesting depth to prevent stack overflow
const MAX_FINDINGS_COUNT = 100;
const MAX_SUMMARY_LENGTH = 10000;
const MAX_STRING_LENGTH = 50000;
const MAX_FILES_COUNT = 200;
const MAX_ARTIFACTS_COUNT = 50;
// Handoff v2 artifact field limits
const MAX_ARTIFACT_PATH_LENGTH = 4096;
const MAX_ARTIFACT_URL_LENGTH = 2048;
const MAX_ARTIFACT_TITLE_LENGTH = 200;
const MAX_ARTIFACT_VALUE_LENGTH = 50000;
const MAX_ARTIFACT_BRANCH_NAME_LENGTH = 256;
const MAX_ARTIFACT_COMMITS_COUNT = 100;
const MAX_ARTIFACT_COMMITS_LENGTH = 64;
const MAX_ARTIFACT_DESCRIPTION_LENGTH = 500;

/**
 * CVE-008 FIX: Safe JSON parser with size, depth, and key count limits.
 *
 * Scans the JSON string for maximum nesting depth before passing to JSON.parse
 * to prevent V8 stack overflows. Also tracks total number of keys in the JSON
 * structure to prevent excessively large payloads.
 */
export function safeJsonParse(input: string, maxKeys: number = MAX_JSON_KEYS, maxDepth: number = MAX_JSON_DEPTH): unknown {
  if (input.length > MAX_JSON_SIZE) {
    throw new Error(`JSON size ${input.length} exceeds maximum ${MAX_JSON_SIZE} bytes`);
  }

  // Single-pass scan: depth, key count, and max raw string length.
  // Tracking maxStringLen lets us skip the recursive truncateStrings walk
  // when no string exceeds MAX_STRING_LENGTH — the common case for handoffs.
  let currentDepth = 0;
  let keyCount = 0;
  let maxStringLen = 0;
  let inString = false;
  let escapeNext = false;
  let stringStart = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === '\\') {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
        const rawLen = i - stringStart;
        if (rawLen > maxStringLen) maxStringLen = rawLen;
      }
    } else {
      if (char === '"') {
        inString = true;
        stringStart = i;
      } else if (char === '{' || char === '[') {
        currentDepth++;
        if (currentDepth > maxDepth) {
          throw new Error(`JSON depth exceeds maximum of ${maxDepth}`);
        }
      } else if (char === '}' || char === ']') {
        currentDepth--;
      } else if (char === ':') {
        keyCount++;
        if (keyCount > maxKeys) {
          throw new Error(`JSON key count exceeds maximum of ${maxKeys}`);
        }
      }
    }
  }

  const parsed = JSON.parse(input);

  // Only walk the parsed tree if a string might exceed the limit.
  // Raw string length includes escape sequences (e.g. \\n counts as 2 chars),
  // so it's a conservative upper bound — we never skip truncation when needed.
  if (maxStringLen > MAX_STRING_LENGTH) {
    truncateStrings(parsed);
  }

  return parsed;
}

function truncateStrings(obj: any): any {
  if (typeof obj === 'string') {
    if (obj.length > MAX_STRING_LENGTH) {
      return obj.slice(0, MAX_STRING_LENGTH);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      // Skip reassignment when truncateStrings returns the same value
      // (the common case for nested arrays/objects/primitives — the recursion
      // mutates in place and returns the same reference).
      const truncated = truncateStrings(obj[i]);
      if (truncated !== obj[i]) obj[i] = truncated;
    }
    return obj;
  }
  if (obj !== null && typeof obj === 'object') {
    // Object.keys() vs for...in + Object.hasOwn: the latter walks the
    // prototype chain and runs a hasOwn check per iteration; Object.keys()
    // returns own enumerable string-keyed properties in a single array.
    for (const key of Object.keys(obj)) {
      const truncated = truncateStrings(obj[key]);
      if (truncated !== obj[key]) obj[key] = truncated;
    }
  }
  return obj;
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
    if (!Array.isArray(obj.files)) {
      issues.push("files");
    } else if (obj.files.length > MAX_FILES_COUNT) {
      issues.push(`files (too many: ${obj.files.length})`);
    } else if (obj.files.some((file) => typeof file !== "string" || file.trim().length === 0)) {
      issues.push("files (invalid item)");
    }
  }
  if (obj.artifacts !== undefined) {
    if (!Array.isArray(obj.artifacts)) {
      issues.push("artifacts");
    } else if (obj.artifacts.length > MAX_ARTIFACTS_COUNT) {
      issues.push(`artifacts (too many: ${obj.artifacts.length})`);
    } else {
      for (const artifact of obj.artifacts) {
        // Accept either a v2 typed artifact or any loose shape that has at
        // least one of the fields {@link coerceLegacyArtifact} can convert
        // (path / title+value / branch / url). Strict v2 validation +
        // coercion runs after shape validation in `parseHandoff`.
        if (!isCoercibleArtifactShape(artifact)) {
          issues.push("artifacts (invalid item)");
          break;
        }
      }
    }
  }

  return issues;
}

/**
 * Looser pre-validation check: accepts v2 typed artifacts AND any loose
 * legacy shape that {@link coerceLegacyArtifact} can convert. Runs during
 * {@link validateHandoffShape} so the handoff-level validation doesn't reject
 * legacy agents outright.
 *
 * Note: an artifact with a known v2 `type` but invalid required fields
 * (e.g. `{type: "file", path: ""}`) is intentionally rejected at the
 * handoff level — the v2 protocol is strict, and silently dropping the
 * artifact would hide agent-side bugs.
 */
function isCoercibleArtifactShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  // The loose check below is a superset of "is v2-strict + coercible":
  // every v2-typed artifact (file/branch/url/note) has at least one of the
  // path/url/branch/title+value fields populated, so it passes the loose
  // check. The strict v2 check then runs once in the coercion step.
  // This eliminates a duplicate isHandoffArtifactV2 call per artifact —
  // ~50 saved calls for a handoff with MAX_ARTIFACTS_COUNT=50 artifacts.
  const obj = value as Record<string, unknown>;
  return (
    (typeof obj.path === "string" && obj.path.length > 0)
    || (typeof obj.url === "string" && obj.url.length > 0)
    || (typeof obj.branch === "string" && obj.branch.length > 0)
    || (typeof obj.title === "string" && obj.title.length > 0
        && typeof obj.value === "string" && obj.value.length > 0)
  );
}

/**
 * Check whether a value is a string containing a finite-length title.
 * Reused by per-type validators to avoid repeated boilerplate.
 */
function isValidStringField(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/**
 * Validate a v2 typed handoff artifact (discriminated union on `type`).
 *
 * Also accepts loose legacy shapes (unknown `type` strings) for backwards
 * compatibility, but never produces loose artifacts on output — see
 * {@link coerceLegacyArtifact} for the coercion rules.
 */
function isHandoffArtifactV2(value: unknown): value is HandoffArtifactV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;

  switch (obj.type) {
    case "file":
      return isValidStringField(obj.path, MAX_ARTIFACT_PATH_LENGTH)
        && (obj.mimeType === undefined || isValidStringField(obj.mimeType, 200))
        && (obj.title === undefined || isValidStringField(obj.title, MAX_ARTIFACT_TITLE_LENGTH));

    case "branch":
      if (!isValidStringField(obj.branch, MAX_ARTIFACT_BRANCH_NAME_LENGTH)) return false;
      if (obj.base !== undefined && !isValidStringField(obj.base, MAX_ARTIFACT_BRANCH_NAME_LENGTH)) return false;
      if (obj.commits !== undefined) {
        if (!Array.isArray(obj.commits)
            || obj.commits.length > MAX_ARTIFACT_COMMITS_COUNT
            || obj.commits.some((c) => typeof c !== "string" || c.length === 0 || c.length > MAX_ARTIFACT_COMMITS_LENGTH)) {
          return false;
        }
      }
      if (obj.title !== undefined && !isValidStringField(obj.title, MAX_ARTIFACT_TITLE_LENGTH)) return false;
      return true;

    case "url":
      return isValidStringField(obj.url, MAX_ARTIFACT_URL_LENGTH)
        && (obj.title === undefined || isValidStringField(obj.title, MAX_ARTIFACT_TITLE_LENGTH))
        && (obj.description === undefined || isValidStringField(obj.description, MAX_ARTIFACT_DESCRIPTION_LENGTH));

    case "note":
      return isValidStringField(obj.title, MAX_ARTIFACT_TITLE_LENGTH)
        && isValidStringField(obj.value, MAX_ARTIFACT_VALUE_LENGTH)
        && (obj.mimeType === undefined || isValidStringField(obj.mimeType, 200));

    default:
      // Unknown / legacy type. Reject strict-mode artifacts so validateHandoffShape
      // surfaces the issue; coercion happens in parseHandoff as a soft-fallback.
      return false;
  }
}

/**
 * Coerce a legacy loose artifact (unknown `type` string) into a v2 typed
 * artifact. Used by {@link parseHandoff} to keep old agents working.
 *
 * Rules (first match wins):
 *  1. Has `path` (and no `value` matching a note shape) → `HandoffFileArtifact`
 *  2. Has `title` + `value` → `HandoffNoteArtifact`
 *  3. Has `branch` (loose semantics) → `HandoffBranchArtifact`
 *  4. Has `url` (loose semantics) → `HandoffUrlArtifact`
 *  5. Otherwise → dropped with a warning
 */
function coerceLegacyArtifact(value: unknown): HandoffArtifactV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const originalType = typeof obj.type === "string" ? obj.type : "<missing>";

  // File-shaped: any non-empty `path` becomes a file artifact
  if (typeof obj.path === "string" && obj.path.trim().length > 0) {
    return {
      type: "file",
      path: obj.path,
      mimeType: typeof obj.mimeType === "string" ? obj.mimeType : undefined,
      title: typeof obj.title === "string" ? obj.title : undefined,
    };
  }

  // Note-shaped: title + value
  if (typeof obj.title === "string" && obj.title.trim().length > 0
      && typeof obj.value === "string" && obj.value.length > 0) {
    return {
      type: "note",
      title: obj.title,
      value: obj.value.slice(0, MAX_ARTIFACT_VALUE_LENGTH),
      mimeType: typeof obj.mimeType === "string" ? obj.mimeType : undefined,
    };
  }

  // Branch-shaped: branch field
  if (typeof obj.branch === "string" && obj.branch.trim().length > 0) {
    return {
      type: "branch",
      branch: obj.branch,
      base: typeof obj.base === "string" ? obj.base : undefined,
      title: typeof obj.title === "string" ? obj.title : undefined,
    };
  }

  // URL-shaped: url field
  if (typeof obj.url === "string" && obj.url.trim().length > 0) {
    return {
      type: "url",
      url: obj.url,
      title: typeof obj.title === "string" ? obj.title : undefined,
      description: typeof obj.description === "string" ? obj.description : undefined,
    };
  }

  logger.warn(`Dropped legacy handoff artifact of unknown type "${originalType}" — no path/title+value/branch/url fields found`);
  return null;
}

/**
 * Parse a structured handoff from agent output text.
 *
 * Gracefully handles malformed, missing, or incomplete JSON. Never throws —
 * always returns null with a logger warning on parse failures.
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
      logger.warn("Handoff block found but could not extract parseable JSON content");
    }
    return null;
  }

  let parsed: unknown;
  try {
    // CVE-008 FIX: Use safe JSON parser with limits
    parsed = safeJsonParse(jsonBlock);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    logger.warn(`Failed to parse handoff JSON — malformed JSON: ${msg}`);
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    logger.warn("Parsed JSON is not an object");
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const issues = validateHandoffShape(obj);
  if (issues.length > 0) {
    logger.warn(`Missing or invalid fields: ${issues.join(", ")}`);
    return null;
  }

  // Coerce any legacy loose artifacts into v2 typed shapes.
  // v2-strict artifacts pass through unchanged.
  const rawArtifacts = Array.isArray(obj.artifacts) ? obj.artifacts : undefined;
  const coercedArtifacts: HandoffArtifactV2[] | undefined = rawArtifacts
    ? (rawArtifacts
        .map((a) => (isHandoffArtifactV2(a) ? a : coerceLegacyArtifact(a)))
        .filter((a): a is HandoffArtifactV2 => a !== null))
    : undefined;

  return {
    type: "handoff",
    status: obj.status as AgentHandoff["status"],
    summary: (obj.summary as string).trim(),
    findings: obj.findings as string[],
    nextSteps: Array.isArray(obj.nextSteps) ? obj.nextSteps as string[] : undefined,
    confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
    evidence: Array.isArray(obj.evidence) ? obj.evidence as string[] : undefined,
    files: Array.isArray(obj.files) ? obj.files as string[] : undefined,
    artifacts: coercedArtifacts && coercedArtifacts.length > 0 ? coercedArtifacts : undefined,
  };
}

/**
 * Handoff template variants by compression level.
 * Selected at runtime by `buildHandoffPrompt(level)`.
 *
 * HANDOFF_FULL       = complete protocol with field descriptions + realistic example ("minimal" compression = max quality)
 * HANDOFF_BALANCED   = compact example with single-line field summary (default)
 * HANDOFF_AGGRESSIVE = bare-minimum one-liner format (max token savings)
 *
 * Note: "FULL" corresponds to the "minimal" compression level setting (minimal
 * compression → maximum verbosity). Naming reflects verbosity, not compression.
 */
const HANDOFF_FULL = `# Structured Handoff Protocol
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
  "files": ["/path/to/new-file.ts"],
  "artifacts": [
    { "type": "file", "path": "/path/to/file1.ts", "title": "Fixed rate limiter", "mimeType": "text/typescript" },
    { "type": "branch", "branch": "fix/rate-limiter", "base": "main", "commits": ["abc1234"], "title": "Fix branch" },
    { "type": "url", "url": "https://example.com/spec", "title": "Rate-limit spec", "description": "External reference" },
    { "type": "note", "title": "Follow-up", "value": "Investigate the token bucket backoff curve", "mimeType": "text/markdown" }
  ]
}
\`\`\`\`

Field descriptions:
- **type** (required): Always "handoff"
- **status** (required): "success" (task complete), "partial" (partially complete), or "failed" (could not complete)
- **summary** (required): Concise 2-3 sentence summary of what was accomplished
- **findings** (required): Key discoveries, decisions, or results — at least one item
- **nextSteps** (optional): What should happen next, if applicable
- **confidence** (optional): Number 0-1 indicating your confidence in the result quality
- **evidence** (optional): Absolute file paths that support your findings
- **files** (optional): Changed/created file paths
- **artifacts** (optional, v2 typed): A typed discriminated union on \`type\`:
  - \`{"type": "file", "path": "..."}\` — file reference. Optional: \`mimeType\`, \`title\`
  - \`{"type": "branch", "branch": "..."}\` — git branch reference. Optional: \`base\`, \`commits[]\`, \`title\`
  - \`{"type": "url", "url": "..."}\` — URL reference. Optional: \`title\`, \`description\`
  - \`{"type": "note", "title": "...", "value": "..."}\` — free-form text. Optional: \`mimeType\`

Example:

\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Investigated the rate-limiting logic and found that the token bucket is not refilling correctly due to a missing interval. Fixed the issue by correcting the refill timer in rate-limiter.ts.",
  "findings": ["The refill interval was set to 0ms instead of 1000ms", "The token bucket never refilled after the first burst", "Fixed by setting interval to 1000ms in the RateLimiter constructor"],
  "nextSteps": ["Write a unit test for the refill behavior", "Check if other instances of RateLimiter have the same bug"],
  "confidence": 0.95,
  "evidence": ["/home/user/project/src/rate-limiter.ts", "/home/user/project/src/api-handler.ts"],
  "files": ["/home/user/project/src/rate-limiter.ts"],
  "artifacts": [
    { "type": "file", "path": "/home/user/project/src/rate-limiter.ts", "title": "Fixed rate limiter" },
    { "type": "branch", "branch": "fix/rate-limiter", "base": "main" }
  ]
}
\`\`\``;

const HANDOFF_BALANCED = `# Structured Handoff Protocol
End your response with a \`\`\`json handoff block so parent agents can parse results programmatically.

\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Fixed token bucket refill in rate-limiter.ts — interval was 0ms instead of 1000ms",
  "findings": ["Refill interval was 0ms", "Token bucket never refilled after first burst"],
  "nextSteps": ["Add unit test for refill behavior", "Check other RateLimiter instances"],
  "confidence": 0.95,
  "evidence": ["/home/user/project/src/rate-limiter.ts"],
  "files": ["/home/user/project/src/rate-limiter.ts"],
  "artifacts": [
    { "type": "file", "path": "/home/user/project/src/rate-limiter.ts", "title": "Fixed rate limiter" },
    { "type": "branch", "branch": "fix/rate-limiter", "base": "main", "title": "Fix branch" }
  ]
}
\`\`\`\`

Fields: **type**="handoff", **status**="success"|"partial"|"failed", **findings** required (≥1), **summary** required, **nextSteps** optional, **confidence** 0-1 optional, **evidence** optional, **files** optional, **artifacts** optional (v2 typed union: \`file\`/\`branch\`/\`url\`/\`note\`).`;

/** @see HANDOFF_FULL — shared JSDoc for all three variants. */
const HANDOFF_AGGRESSIVE = `# Handoff
End with \`\`\`json: {"type":"handoff","status":"success|partial|failed","summary":"...","findings":["..."]}`;

/**
 * Build a handoff template for injection into an agent's system prompt.
 *
 * This tells the agent to produce a structured JSON handoff at the very end
 * of its response, enabling the parent to machine-parse the result for
 * chain-of-agents workflows.
 */
export function buildHandoffPrompt(level: PromptCompressionLevel = "balanced"): string {
  if (level === "minimal") return HANDOFF_FULL;
  if (level === "aggressive") return HANDOFF_AGGRESSIVE;
  return HANDOFF_BALANCED;
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
    for (const path of handoff.files) {
      parts.push(`  - ${path}`);
    }
  }
  if (handoff.artifacts?.length) {
    parts.push("Artifacts:");
    for (const artifact of handoff.artifacts) {
      // handoff.artifacts is HandoffArtifactV2[]; renderArtifactForParent is
      // exhaustive over the discriminated union.
      parts.push(`  - ${renderArtifactForParent(artifact)}`);
    }
  }

  return parts.join("\n");
}

function renderArtifactForParent(artifact: HandoffArtifactV2): string {
  switch (artifact.type) {
    case "file": {
      const title = artifact.title ? `${artifact.title}: ` : "";
      const mime = artifact.mimeType ? ` (${artifact.mimeType})` : "";
      return `[file] ${title}${artifact.path}${mime}`;
    }
    case "branch": {
      const title = artifact.title ? `${artifact.title} ` : "";
      const base = artifact.base ? ` (from ${artifact.base})` : "";
      const commits = artifact.commits && artifact.commits.length > 0
        ? ` +${artifact.commits.length} commit${artifact.commits.length === 1 ? "" : "s"}`
        : "";
      return `[branch] ${title}${artifact.branch}${base}${commits}`;
    }
    case "url": {
      const title = artifact.title ? `${artifact.title}: ` : "";
      const desc = artifact.description ? ` — ${artifact.description}` : "";
      return `[url] ${title}${artifact.url}${desc}`;
    }
    case "note": {
      const mime = artifact.mimeType ? ` (${artifact.mimeType})` : "";
      // Indent multi-line notes so they line up with the bullet
      const value = artifact.value.includes("\n")
        ? `\n      ${artifact.value.replace(/\n/g, "\n      ")}`
        : artifact.value;
      return `[note] ${artifact.title}: ${value}${mime}`;
    }
  }
}
