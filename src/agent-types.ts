/**
 * agent-types.ts — Unified agent type registry.
 *
 * Merges embedded default agents with user-defined agents from .pi/agents/*.md.
 * User agents override defaults with the same name. Disabled agents are kept but excluded from spawning.
 */

import { DEFAULT_AGENTS } from "./default-agents.js";
import type { AgentConfig } from "./types.js";

/** All known built-in tool names. */
export const BUILTIN_TOOL_NAMES: string[] = ["read", "bash", "edit", "write", "grep", "find", "ls"];

/** Unified runtime registry of all agents (defaults + user-defined). */
const agents = new Map<string, AgentConfig>();

/**
 * Register agents into the unified registry.
 * Starts with DEFAULT_AGENTS, then overlays user agents (overrides defaults with same name).
 * Disabled agents (enabled === false) are kept in the registry but excluded from spawning.
 */
export function registerAgents(userAgents: Map<string, AgentConfig>): void {
  agents.clear();

  // Start with defaults
  for (const [name, config] of DEFAULT_AGENTS) {
    agents.set(name, config);
  }

  // Overlay user agents (overrides defaults with same name)
  for (const [name, config] of userAgents) {
    agents.set(name, config);
  }
}

/** Case-insensitive key resolution. */
function resolveKey(name: string): string | undefined {
  if (agents.has(name)) return name;
  const lower = name.toLowerCase();
  for (const key of agents.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return undefined;
}

/** Resolve a type name case-insensitively. Returns the canonical key or undefined. */
export function resolveType(name: string): string | undefined {
  return resolveKey(name);
}

/** Get the agent config for a type (case-insensitive). */
export function getAgentConfig(name: string): AgentConfig | undefined {
  const key = resolveKey(name);
  return key ? agents.get(key) : undefined;
}

/** Get all enabled type names (for spawning and tool descriptions). */
export function getAvailableTypes(): string[] {
  return [...agents.entries()]
    .filter(([_, config]) => config.enabled !== false)
    .map(([name]) => name);
}

/** Get all type names including disabled (for UI listing). */
export function getAllTypes(): string[] {
  return [...agents.keys()];
}

/** Get names of default agents currently in the registry. */
export function getDefaultAgentNames(): string[] {
  return [...agents.entries()]
    .filter(([_, config]) => config.isDefault === true)
    .map(([name]) => name);
}

/** Get names of user-defined agents (non-defaults) currently in the registry. */
export function getUserAgentNames(): string[] {
  return [...agents.entries()]
    .filter(([_, config]) => config.isDefault !== true)
    .map(([name]) => name);
}

/** Check if a type is valid and enabled (case-insensitive). */
export function isValidType(type: string): boolean {
  const key = resolveKey(type);
  if (!key) return false;
  return agents.get(key)?.enabled !== false;
}

/** Tool names required for memory management. */
const MEMORY_TOOL_NAMES = ["read", "write", "edit"];

/**
 * Get memory tool names (read/write/edit) not already in the provided set.
 */
export function getMemoryToolNames(existingToolNames: Set<string>): string[] {
  return MEMORY_TOOL_NAMES.filter(n => !existingToolNames.has(n));
}

/** Tool names needed for read-only memory access. */
const READONLY_MEMORY_TOOL_NAMES = ["read"];

/**
 * Get read-only memory tool names not already in the provided set.
 */
export function getReadOnlyMemoryToolNames(existingToolNames: Set<string>): string[] {
  return READONLY_MEMORY_TOOL_NAMES.filter(n => !existingToolNames.has(n));
}

/** Get built-in tool names for a type (case-insensitive). */
export function getToolNamesForType(type: string): string[] {
  const key = resolveKey(type);
  const raw = key ? agents.get(key) : undefined;
  const config = raw?.enabled !== false ? raw : undefined;
  const names = config?.builtinToolNames?.length ? config.builtinToolNames : [...BUILTIN_TOOL_NAMES];
  return names;
}

/**
 * Intersect two permission values using directional inheritance.
 * Parent overrides child: if parent has a restriction, the child cannot exceed it.
 *
 * - parent false → child gets false (parent denies all)
 * - parent true  → child keeps own value (parent allows all)
 * - parent string[] + child true  → restricted to parent's allowlist
 * - parent string[] + child string[] → intersection of both
 * - parent string[] + child false → child stays false
 */
function intersectPermission(
  child: true | string[] | false,
  parent: true | string[] | false,
): true | string[] | false {
  if (parent === false) return false;
  if (parent === true) return child;
  if (child === false) return false;
  if (child === true) return parent;
  const parentSet = new Set(parent);
  return child.filter((item) => parentSet.has(item));
}

/**
 * Intersect tool names: child can only use tools the parent also has access to.
 * Pure function — no side effects.
 */
function intersectToolNames(childNames: string[], parentNames: string[]): string[] {
  const parentSet = new Set(parentNames);
  return childNames.filter((t) => parentSet.has(t));
}

/** Effective config shape used for permission inheritance. Distinct from the full return type. */
export interface EffectiveConfig {
  builtinToolNames: string[];
  extensions: true | string[] | false;
  skills: true | string[] | false;
}

/** Get config for a type (case-insensitive, returns a SubagentTypeConfig-compatible object). Falls back to general-purpose. */
export function getConfig(
  type: string,
  parentConfig?: EffectiveConfig,
): {
  displayName: string;
  description: string;
  builtinToolNames: string[];
  extensions: true | string[] | false;
  skills: true | string[] | false;
  promptMode: "replace" | "append";
} {
  const key = resolveKey(type);
  const config = key ? agents.get(key) : undefined;

  /**
   * Apply parent permission inheritance to a raw effective config.
   * Runs after the child's own config is resolved, before returning.
   * This is the boundary where illegal states are made unrepresentable.
   */
  function applyParentRestrictions(raw: {
    builtinToolNames: string[];
    extensions: true | string[] | false;
    skills: true | string[] | false;
  }) {
    if (!parentConfig) return raw;
    return {
      builtinToolNames: intersectToolNames(raw.builtinToolNames, parentConfig.builtinToolNames),
      extensions: intersectPermission(raw.extensions, parentConfig.extensions),
      skills: intersectPermission(raw.skills, parentConfig.skills),
    };
  }

  if (config && config.enabled !== false) {
    const restricted = applyParentRestrictions({
      builtinToolNames: config.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: config.extensions,
      skills: config.skills,
    });
    return {
      displayName: config.displayName ?? config.name,
      description: config.description,
      builtinToolNames: restricted.builtinToolNames,
      extensions: restricted.extensions,
      skills: restricted.skills,
      promptMode: config.promptMode,
    };
  }

  // Fallback for unknown/disabled types — general-purpose config
  const gp = agents.get("general-purpose");
  if (gp && gp.enabled !== false) {
    const restricted = applyParentRestrictions({
      builtinToolNames: gp.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: gp.extensions,
      skills: gp.skills,
    });
    return {
      displayName: gp.displayName ?? gp.name,
      description: gp.description,
      builtinToolNames: restricted.builtinToolNames,
      extensions: restricted.extensions,
      skills: restricted.skills,
      promptMode: gp.promptMode,
    };
  }

  // Absolute fallback (should never happen)
  const restricted = applyParentRestrictions({
    builtinToolNames: BUILTIN_TOOL_NAMES,
    extensions: true,
    skills: true,
  });
  return {
    displayName: "Agent",
    description: "General-purpose agent for complex, multi-step tasks",
    builtinToolNames: restricted.builtinToolNames,
    extensions: restricted.extensions,
    skills: restricted.skills,
    promptMode: "append",
  };
}

