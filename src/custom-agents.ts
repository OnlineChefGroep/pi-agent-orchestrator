/**
 * custom-agents.ts — Load user-defined agents from project (.pi/agents/) and global ($PI_CODING_AGENT_DIR/agents/, default ~/.pi/agent/agents/) locations.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { BUILTIN_TOOL_NAMES, getDefaultAgentNames } from "./agent-types.js";
import type { AgentConfig, MemoryScope, ThinkingLevel } from "./types.js";

// CVE-002 FIX: Validation patterns for agent configs
const UNSAFE_NAME_PATTERN = /^(\.\.|\.\.|\/|\\|[\x00-\x1F])|(\.\.|\.\.|\/|\\|[\x00-\x1F])$/;
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?(instructions|criteria)/i,
  /exfiltrate|send\s+to\s+attacker|malicious/i,
  /<\/?(script|iframe|object|embed)/i,
];
const MAX_NAME_LENGTH = 100;
const MAX_PROMPT_LENGTH = 100000;  // 100KB
const MAX_TOOLS_COUNT = 100;

/**
 * Validate an agent config for security issues.
 * Returns array of error messages (empty if valid).
 */
function validateAgentConfig(name: string, config: Partial<AgentConfig>): string[] {
  const errors: string[] = [];
  
  // Validate name
  if (!name || typeof name !== 'string') {
    errors.push('Agent name is required');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push(`Agent name exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
  } else if (UNSAFE_NAME_PATTERN.test(name)) {
    errors.push(`Agent name contains unsafe characters: ${name}`);
  }
  
  // Prevent overriding built-in agents with wildcard tools
  const builtinNames = new Set(getDefaultAgentNames());
  if (builtinNames.has(name) && config.builtinToolNames?.includes('*')) {
    errors.push(`Cannot override built-in agent "${name}" with wildcard (*) tools`);
  }
  
  // Validate system prompt
  if (config.systemPrompt) {
    if (config.systemPrompt.length > MAX_PROMPT_LENGTH) {
      errors.push(`System prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
    }
    
    // Check for injection patterns
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(config.systemPrompt)) {
        errors.push('System prompt contains potential injection pattern');
        break;
      }
    }
  }
  
  // Validate tool names
  if (config.builtinToolNames) {
    if (config.builtinToolNames.length > MAX_TOOLS_COUNT) {
      errors.push(`Too many tools specified (max ${MAX_TOOLS_COUNT})`);
    }
    
    // CVE-011 FIX: Validate tool names against known set
    const knownTools = new Set([...BUILTIN_TOOL_NAMES, '*']);
    const unknownTools = config.builtinToolNames.filter(t => !knownTools.has(t));
    if (unknownTools.length > 0) {
      console.warn(`[pi-subagents] Unknown tool names in agent "${name}": ${unknownTools.join(', ')}`);
    }
  }
  
  return errors;
}

/**
 * Scan for custom agent .md files from multiple locations.
 * Discovery hierarchy (higher priority wins):
 *   1. Project: <cwd>/.pi/agents/*.md
 *   2. Global:  $PI_CODING_AGENT_DIR/agents/*.md (default: ~/.pi/agent/agents/*.md)
 *
 * Project-level agents override global ones with the same name.
 * Any name is allowed — names matching defaults (e.g. "Explore") override them.
 */
export function loadCustomAgents(cwd: string): Map<string, AgentConfig> {
  const globalDir = join(getAgentDir(), "agents");
  const projectDir = join(cwd, ".pi", "agents");

  const agents = new Map<string, AgentConfig>();
  loadFromDir(globalDir, agents, "global");   // lower priority
  loadFromDir(projectDir, agents, "project");  // higher priority (overwrites)
  return agents;
}

/** Load agent configs from a directory into the map. */
function loadFromDir(dir: string, agents: Map<string, AgentConfig>, source: "project" | "global"): void {
  if (!existsSync(dir)) return;

  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith(".md"));
  } catch {
    return;
  }

  for (const file of files) {
    const name = basename(file, ".md");

    let content: string;
    try {
      content = readFileSync(join(dir, file), "utf-8");
    } catch {
      continue;
    }

    const { frontmatter: fm, body } = parseFrontmatter<Record<string, unknown>>(content);

    const config: AgentConfig = {
      name,
      displayName: str(fm.display_name),
      description: str(fm.description) ?? name,
      builtinToolNames: csvList(fm.tools, BUILTIN_TOOL_NAMES),
      disallowedTools: csvListOptional(fm.disallowed_tools),
      extensions: inheritField(fm.extensions ?? fm.inherit_extensions),
      skills: inheritField(fm.skills ?? fm.inherit_skills),
      model: str(fm.model),
      thinking: str(fm.thinking) as ThinkingLevel | undefined,
      maxTurns: nonNegativeInt(fm.max_turns),
      systemPrompt: body.trim(),
      promptMode: fm.prompt_mode === "append" ? "append" : "replace",
      inheritContext: fm.inherit_context != null ? fm.inherit_context === true : undefined,
      runInBackground: fm.run_in_background != null ? fm.run_in_background === true : undefined,
      isolated: fm.isolated != null ? fm.isolated === true : undefined,
      memory: parseMemory(fm.memory),
      isolation: fm.isolation === "worktree" ? "worktree" : undefined,
      enabled: fm.enabled !== false,  // default true; explicitly false disables
      source,
    };

    // CVE-002 FIX: Validate agent config before adding
    const validationErrors = validateAgentConfig(name, config);
    if (validationErrors.length > 0) {
      console.warn(`[pi-subagents] Invalid agent config "${name}": ${validationErrors.join(', ')}`);
      // Disable agent with validation errors (don't skip entirely - let user see it)
      config.enabled = false;
    }

    agents.set(name, config);
  }
}

// ---- Field parsers ----
// All follow the same convention: omitted → default, "none"/empty → nothing, value → exact.

/** Extract a string or undefined. */
function str(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

/** Extract a non-negative integer or undefined. 0 means unlimited for max_turns. */
function nonNegativeInt(val: unknown): number | undefined {
  return typeof val === "number" && val >= 0 ? val : undefined;
}

/**
 * Parse a raw CSV field value into items, or undefined if absent/empty/"none".
 */
function parseCsvField(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  if (!s || s === "none") return undefined;
  const items = s.split(",").map(t => t.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Parse a comma-separated list field with defaults.
 * omitted → defaults; "none"/empty → []; csv → listed items.
 */
function csvList(val: unknown, defaults: string[]): string[] {
  if (val === undefined || val === null) return defaults;
  return parseCsvField(val) ?? [];
}

/**
 * Parse an optional comma-separated list field.
 * omitted → undefined; "none"/empty → undefined; csv → listed items.
 */
function csvListOptional(val: unknown): string[] | undefined {
  return parseCsvField(val);
}

/**
 * Parse a memory scope field.
 * omitted → undefined; "user"/"project"/"local" → MemoryScope.
 */
function parseMemory(val: unknown): MemoryScope | undefined {
  if (val === "user" || val === "project" || val === "local") return val;
  return undefined;
}

/**
 * Parse an inherit field (extensions, skills).
 * omitted/true → true (inherit all); false/"none"/empty → false; csv → listed names.
 */
function inheritField(val: unknown): true | string[] | false {
  if (val === undefined || val === null || val === true) return true;
  if (val === false || val === "none") return false;
  const items = csvList(val, []);
  return items.length > 0 ? items : false;
}
