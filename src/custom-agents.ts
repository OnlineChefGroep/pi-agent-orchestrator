/**
 * custom-agents.ts — Load user-defined agents from project (.pi/agents/) and global ($PI_CODING_AGENT_DIR/agents/, default ~/.pi/agent/agents/) locations.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { BUILTIN_TOOL_NAMES, getDefaultAgentNames } from "./agent-types.js";
import type { PromptCompressionLevel } from "./settings.js";
import { emitTelemetry, hashContentSync } from "./telemetry.js";
import type { AgentConfig, MemoryScope, ThinkingLevel } from "./types.js";

// CVE-002 FIX: Validation patterns for agent configs
const UNSAFE_NAME_PATTERN = /[/\\]|\.\.|[\x00-\x1F]/;
const MAX_NAME_LENGTH = 100;
const MAX_PROMPT_LENGTH = 100000;  // 100KB
const MAX_TOOLS_COUNT = 100;

/**
 * Validate an agent config for security issues.
 * Returns array of error messages (empty if valid).
 * 
 * Security model: allowlist approach — only embedded defaults and .md files from
 * .pi/agents/ are trusted sources. No regex blacklist for prompt injection
 * (trivially bypassed with Unicode, base64, whitespace variations).
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
  
  // Validate system prompt length only (no injection pattern check)
  if (config.systemPrompt && config.systemPrompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`System prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
  }

  // Validate description length
  if (config.description && config.description.length > MAX_PROMPT_LENGTH) {
    errors.push(`Description exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
  }

  // Validate display name length
  if (config.displayName && config.displayName.length > MAX_NAME_LENGTH) {
    errors.push(`Display name exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
  }
  
  // Validate tool names
  if (config.builtinToolNames) {
    if (config.builtinToolNames.length > MAX_TOOLS_COUNT) {
      errors.push(`Too many tools specified (max ${MAX_TOOLS_COUNT})`);
    }

    const hasLongTool = config.builtinToolNames.some(t => t.length > MAX_NAME_LENGTH);
    if (hasLongTool) {
      errors.push(`Tool name exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
    }
    
    // CVE-011 FIX: Emit telemetry for unknown tool names (don't block, just log)
    const knownTools = new Set([...BUILTIN_TOOL_NAMES, '*']);
    const unknownTools = config.builtinToolNames.filter(t => !knownTools.has(t));
    if (unknownTools.length > 0) {
      emitTelemetry("agent:unknown-tools", { name, tools: unknownTools });
    }
  }
  
  if (config.disallowedTools) {
    if (config.disallowedTools.length > MAX_TOOLS_COUNT) {
      errors.push(`Too many disallowed tools specified (max ${MAX_TOOLS_COUNT})`);
    }

    const hasLongDisallowedTool = config.disallowedTools.some(t => t.length > MAX_NAME_LENGTH);
    if (hasLongDisallowedTool) {
      errors.push(`Disallowed tool name exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
    }
  }

  return errors;
}

/**
 * Scan for custom agent .md files from multiple locations.
 *
 * Discovery hierarchy (higher priority wins):
 *   1. Project: `<cwd>/.pi/agents/*.md`
 *   2. Global:  `$PI_CODING_AGENT_DIR/agents/*.md` (default: `~/.pi/agent/agents/*.md`)
 *
 * Project-level agents override global ones with the same name.
 * Any name is allowed — names matching defaults (e.g. "Explore") override them.
 *
 * Security: symlinks are skipped to prevent directory traversal.
 *
 * @param cwd - Current working directory (project root) for agent discovery
 * @returns Map of agent name → parsed {@link AgentConfig}
 */
export async function loadCustomAgents(cwd: string): Promise<Map<string, AgentConfig>> {
  const globalDir = join(getAgentDir(), "agents");
  const projectDir = join(cwd, ".pi", "agents");

  const agents = new Map<string, AgentConfig>();
  await loadFromDir(globalDir, agents, "global");   // lower priority
  await loadFromDir(projectDir, agents, "project");  // higher priority (overwrites)
  return agents;
}

/** Load agent configs from a directory into the map. */
async function loadFromDir(dir: string, agents: Map<string, AgentConfig>, source: "project" | "global"): Promise<void> {
  if (!existsSync(dir)) return;

  let files: string[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    files = dirents
      .filter(f => !f.isDirectory() && !f.isSymbolicLink() && f.name.endsWith(".md"))
      .map(f => f.name);
  } catch {
    return;
  }

  await Promise.all(files.map(async (file) => {
    const name = basename(file, ".md");

    let content: string;
    try {
      content = await readFile(join(dir, file), "utf-8");
    } catch {
      return;
    }

    const { frontmatter: fm, body } = parseFrontmatter<Record<string, unknown>>(content);

    const config: AgentConfig = {
      name,
      displayName: parseString(fm.display_name),
      description: parseString(fm.description) ?? name,
      builtinToolNames: parseCsvList(fm.tools, BUILTIN_TOOL_NAMES),
      disallowedTools: parseCsvListOptional(fm.disallowed_tools),
      extensions: parseInheritField(fm.extensions ?? fm.inherit_extensions),
      skills: parseInheritField(fm.skills ?? fm.inherit_skills),
      model: parseString(fm.model),
      thinking: parseString(fm.thinking) as ThinkingLevel | undefined,
      maxTurns: parseNonNegativeInt(fm.max_turns),
      systemPrompt: body.trim(),
      promptMode: fm.prompt_mode === "append" ? "append" : "replace",
      inheritContext: parseBooleanOptional(fm.inherit_context),
      runInBackground: parseBooleanOptional(fm.run_in_background),
      isolated: parseBooleanOptional(fm.isolated),
      memory: parseMemory(fm.memory),
      isolation: fm.isolation === "worktree" ? "worktree" : undefined,
      handoff: parseBooleanWithDefault(fm.handoff, false),
      promptCompressionLevel: parseCompressionLevel(fm.prompt_compression),
      enabled: parseBooleanWithDefault(fm.enabled, true),
      source,
    };

    // CVE-002 FIX: Validate agent config before adding
    const validationErrors = validateAgentConfig(name, config);
    if (validationErrors.length > 0) {
      emitTelemetry("agent:validation-failed", { name, errors: validationErrors });
      // Disable agent with validation errors (don't skip entirely - let user see it)
      config.enabled = false;
    }

    // Emit telemetry for every loaded agent with content hash
    const contentHash = hashContentSync(content);
    emitTelemetry("agent:loaded", { 
      name, 
      source, 
      hash: contentHash, 
      enabled: config.enabled ?? true 
    });

    agents.set(name, config);
  }));
}

// ---- Field Parsers ----

/**
 * Parse a boolean from frontmatter that may be a boolean or string.
 * Returns undefined if the value is null/undefined (caller decides default).
 * Handles: true, false, "true", "false" — anything else returns undefined.
 */
function parseBooleanOptional(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  if (val === true || val === "true") return true;
  if (val === false || val === "false") return false;
  return undefined;
}

/**
 * Parse a boolean from frontmatter with an explicit default.
 * Handles: true, false, "true", "false" — null/undefined returns the default.
 */
function parseBooleanWithDefault(val: unknown, defaultValue: boolean): boolean {
  const parsed = parseBooleanOptional(val);
  return parsed ?? defaultValue;
}

/**
 * Parse a CSV field value from frontmatter.
 */
function parseCsvField(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  if (!s || s === "none") return undefined;
  const items = s.split(",").map(t => t.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

function parseNonNegativeInt(val: unknown): number | undefined {
  return typeof val === "number" && val >= 0 ? val : undefined;
}

function parseCsvList(val: unknown, defaults: string[]): string[] {
  if (val === undefined || val === null) return defaults;
  return parseCsvField(val) ?? [];
}

function parseCsvListOptional(val: unknown): string[] | undefined {
  return parseCsvField(val);
}

function parseMemory(val: unknown): MemoryScope | undefined {
  return (val === "user" || val === "project" || val === "local") ? val : undefined;
}

function parseInheritField(val: unknown): true | string[] | false {
  if (val === undefined || val === null || val === true) return true;
  if (val === false || val === "none") return false;
  const items = parseCsvList(val, []);
  return items.length > 0 ? items : false;
}

const VALID_COMPRESSION_LEVELS = new Set(["minimal", "balanced", "aggressive"]);

function parseCompressionLevel(val: unknown): PromptCompressionLevel | undefined {
  if (typeof val === "string" && VALID_COMPRESSION_LEVELS.has(val)) return val as PromptCompressionLevel;
  return undefined;
}
