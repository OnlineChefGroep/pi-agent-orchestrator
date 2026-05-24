/**
 * memory.ts — Persistent agent memory: per-agent memory directories that persist across sessions.
 *
 * Memory scopes:
 *   - "user"    → ~/.pi/agent-memory/{agent-name}/
 *   - "project" → .pi/agent-memory/{agent-name}/
 *   - "local"   → .pi/agent-memory-local/{agent-name}/
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { MemoryScope } from "./types.js";

/**
 * If the given directory is a Git worktree, returns the root of the main repository.
 * Otherwise returns the original directory.
 */
function getProjectRoot(cwd: string): string {
  try {
    const gitPath = join(cwd, ".git");
    const stat = statSync(gitPath);
    if (stat.isFile()) {
      // It's a worktree. The .git file contains "gitdir: /path/to/main/repo/.git/worktrees/X"
      const content = readFileSync(gitPath, "utf-8");
      const match = content.match(/^gitdir:\s+(.*)$/m);
      if (match) {
        let gitdir = match[1].trim();
        if (!isAbsolute(gitdir)) gitdir = join(cwd, gitdir);
        // gitdir is typically /path/to/main/repo/.git/worktrees/branch-name
        // so moving 3 levels up gets us the main repo root
        return dirname(dirname(dirname(gitdir)));
      }
    }
  } catch {
    // ignore
  }
  return cwd;
}

/** Maximum lines to read from MEMORY.md (global default). */
const MAX_MEMORY_LINES = 200;

/**
 * Returns true if a name contains characters not allowed in agent/skill names.
 * Uses a whitelist: only alphanumeric, hyphens, underscores, and dots (no leading dot).
 */
export function isUnsafeName(name: string): boolean {
  if (!name || name.length > 128) return true;
  return !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/**
 * Returns true if the given path is a symlink (defense against symlink attacks).
 */
export function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Safely read a file, rejecting symlinks.
 * Returns undefined if the file doesn't exist, is a symlink, or can't be read.
 */
export function safeReadFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  if (isSymlink(filePath)) return undefined;
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Resolve the memory directory path for a given agent + scope + cwd.
 * Throws if agentName contains path traversal characters.
 */
export function resolveMemoryDir(agentName: string, scope: MemoryScope, cwd: string): string {
  if (isUnsafeName(agentName)) {
    throw new Error(`Unsafe agent name for memory directory: "${agentName}"`);
  }
  switch (scope) {
    case "user":
      return join(homedir(), ".pi", "agent-memory", agentName);
    case "project":
      return join(getProjectRoot(cwd), ".pi", "agent-memory", agentName);
    case "local":
      return join(getProjectRoot(cwd), ".pi", "agent-memory-local", agentName);
  }
}

/**
 * Ensure the memory directory exists, creating it if needed.
 * Refuses to create directories if any component in the path is a symlink
 * to prevent symlink-based directory traversal attacks.
 */
export function ensureMemoryDir(memoryDir: string): void {
  // If the directory already exists, verify it's not a symlink
  if (existsSync(memoryDir)) {
    if (isSymlink(memoryDir)) {
      throw new Error(`Refusing to use symlinked memory directory: ${memoryDir}`);
    }
    return;
  }
  mkdirSync(memoryDir, { recursive: true });
}

/**
 * Read the first N lines of MEMORY.md from the memory directory, if it exists.
 * Returns undefined if no MEMORY.md exists or if the path is a symlink.
 *
 * @param maxLines - Per-agent override for max lines. Falls back to MAX_MEMORY_LINES (200).
 */
export function readMemoryIndex(memoryDir: string, maxLines?: number): string | undefined {
  // Reject symlinked memory directories
  if (isSymlink(memoryDir)) return undefined;

  const memoryFile = join(memoryDir, "MEMORY.md");
  const content = safeReadFile(memoryFile);
  if (content === undefined) return undefined;

  const limit = maxLines ?? MAX_MEMORY_LINES;
  const lines = content.split("\n");
  if (lines.length > limit) {
    return `${lines.slice(0, limit).join("\n")}\n... (truncated at ${limit} lines)`;
  }
  return content;
}

/**
 * Build the memory block to inject into the agent's system prompt.
 * Also ensures the memory directory exists (creates it if needed).
 *
 * @param maxMemoryLines - Per-agent override for max memory lines.
 */
export function buildMemoryBlock(
  agentName: string,
  scope: MemoryScope,
  cwd: string,
  maxMemoryLines?: number,
): string {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  // Create the memory directory so the agent can immediately write to it
  ensureMemoryDir(memoryDir);

  const existingMemory = readMemoryIndex(memoryDir, maxMemoryLines);

  const header = `# Agent Memory

You have a persistent memory directory at: ${memoryDir}/
Memory scope: ${scope}

This memory persists across sessions. Use it to build up knowledge over time.`;

  const limit = maxMemoryLines ?? MAX_MEMORY_LINES;
  const memoryContent = existingMemory
    ? `\n\n## Current MEMORY.md\n${existingMemory}`
    : `\n\nNo MEMORY.md exists yet. Create one at ${join(memoryDir, "MEMORY.md")} to start building persistent memory.`;

  const instructions = `

## Memory Instructions
- MEMORY.md is an index file — keep it concise (under ${limit} lines). Lines after ${limit} are truncated.
- Store detailed memories in separate files within ${memoryDir}/ and link to them from MEMORY.md.
- Each memory file should use this frontmatter format:
  \`\`\`markdown
  ---
  name: <memory name>
  description: <one-line description>
  type: <user|feedback|project|reference>
  ---
  <memory content>
  \`\`\`
- Update or remove memories that become outdated. Check for existing memories before creating duplicates.
- You have Read, Write, and Edit tools available for managing memory files.`;

  return header + memoryContent + instructions;
}

/**
 * Build a read-only memory block for agents that lack write/edit tools.
 * Does NOT create the memory directory — agents can only consume existing memory.
 */
export function buildReadOnlyMemoryBlock(
  agentName: string,
  scope: MemoryScope,
  cwd: string,
  maxMemoryLines?: number,
): string {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  const existingMemory = readMemoryIndex(memoryDir, maxMemoryLines);

  const header = `# Agent Memory (read-only)

Memory scope: ${scope}
You have read-only access to memory. You can reference existing memories but cannot create or modify them.`;

  const memoryContent = existingMemory
    ? `\n\n## Current MEMORY.md\n${existingMemory}`
    : `\n\nNo memory is available yet. Other agents or sessions with write access can create memories for you to consume.`;

  return header + memoryContent;
}
