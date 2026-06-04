/**
 * readonly-helpers.ts — Consolidated read-only tool constants and helpers.
 *
 * Centralizes all read-only tool lists and memory helpers that were previously
 * scattered across agent-types.ts, default-agents.ts, and memory.ts.
 *
 * Constants:
 * - READ_ONLY_TOOLS — standard read-only tool allowlist (read, bash, grep)
 * - READONLY_MEMORY_TOOL_NAMES — tools needed for read-only memory access (read)
 *
 * Helpers:
 * - getReadOnlyMemoryToolNames — returns memory tool names not already in a set
 */

/** Standard read-only tool allowlist used by Explore, Plan, Analysis, and safe fallback agents. */
export const READ_ONLY_TOOLS: readonly string[] = ["read", "bash", "grep"];

/** Tool names needed for read-only memory access. */
const READONLY_MEMORY_TOOL_NAMES: readonly string[] = ["read"];

/**
 * Get read-only memory tool names not already in the provided set.
 * Used by the agent runner to inject memory tools without duplication.
 */
export function getReadOnlyMemoryToolNames(existingToolNames: Set<string>): string[] {
  return READONLY_MEMORY_TOOL_NAMES.filter((n) => !existingToolNames.has(n));
}
