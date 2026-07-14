/**
 * worktree.ts — Git worktree isolation for agents.
 *
 * Creates a temporary git worktree so the agent works on an isolated copy of the repo.
 * On completion, if no changes were made, the worktree is cleaned up.
 * If changes exist, a branch is created and returned in the result.
 */

import { execFile as execFileCb, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

/**
 * Convert an untrusted runtime identifier into a conservative component that is
 * valid in both a temporary directory name and a Git branch name.
 */
function sanitizeAgentId(agentId: string): string {
  if (typeof agentId !== "string" || agentId === "") return "unknown";

  const cleaned = agentId
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return cleaned.slice(0, 64).replace(/[-_]+$/g, "") || "unknown";
}

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch name created for this worktree (if changes exist). */
  branch: string;
}

export interface WorktreeCleanupResult {
  /** Whether changes were found, or conservatively assumed after an inspection failure. */
  hasChanges: boolean;
  /** Branch name if changes were committed. */
  branch?: string;
  /** Worktree path when cleanup could not safely remove it. */
  path?: string;
  /** Bounded diagnostic when manual recovery is required. */
  error?: string;
}

/**
 * Create a temporary git worktree for an agent (async, non-blocking).
 * Returns the worktree path, or undefined if not in a git repo.
 */
export async function createWorktree(cwd: string, agentId: string): Promise<WorktreeInfo | undefined> {
  // Verify we're in a git repo with at least one commit (HEAD must exist)
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 5000 });
    await execFileAsync("git", ["rev-parse", "HEAD"], { cwd, timeout: 5000 });
  } catch {
    return undefined;
  }

  const safeId = sanitizeAgentId(agentId);
  const branch = `pi-agent-${safeId}`;
  const suffix = randomUUID().slice(0, 8);
  const worktreePath = join(tmpdir(), `pi-agent-${safeId}-${suffix}`);

  try {
    // Create detached worktree at HEAD
    await execFileAsync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
      cwd,
      timeout: 30000,
    });
    return { path: worktreePath, branch };
  } catch {
    // If worktree creation fails, return undefined (agent runs in normal cwd)
    return undefined;
  }
}

/**
 * Safely truncates a string to a maximum length without splitting surrogate pairs
 * or using O(N) array spread operations.
 */
function safeTruncate(str: string, maxLen: number): string {
  if (typeof str !== "string") return "";
  if (str.length <= maxLen) return str;
  let validLen = 0;
  for (let i = 0; i < maxLen; i++) {
    const code = str.charCodeAt(i);
    // High surrogate check
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (i + 1 >= maxLen) break;
      validLen += 2;
      i++; // Skip low surrogate
    } else {
      validLen += 1;
    }
  }
  return str.slice(0, validLen);
}

function formatCleanupError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return safeTruncate(value.replace(/[\r\n\x00-\x1F]+/g, " ").trim(), 500) || "Unknown worktree cleanup error";
}

/**
 * Clean up a worktree after agent completion.
 * - If no changes: remove worktree entirely.
 * - If changes exist: create a branch, commit changes, return branch info.
 * - If inspection, staging, commit, branch creation, or removal fails: preserve
 *   the worktree and return its path for manual recovery.
 */
export function cleanupWorktree(
  cwd: string,
  worktree: WorktreeInfo,
  agentDescription: string,
): WorktreeCleanupResult {
  if (!existsSync(worktree.path)) {
    return { hasChanges: false };
  }

  let status: string;
  try {
    status = execFileSync("git", ["status", "--porcelain"], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 10000,
    }).toString().trim();
  } catch (error) {
    // We could not prove the worktree is clean. Preserve it conservatively.
    return {
      hasChanges: true,
      path: worktree.path,
      error: `Unable to inspect worktree; preserved for recovery: ${formatCleanupError(error)}`,
    };
  }

  if (!status) {
    const removed = removeWorktree(cwd, worktree.path);
    return removed
      ? { hasChanges: false }
      : {
          hasChanges: false,
          path: worktree.path,
          error: "Clean worktree could not be removed; path preserved for manual cleanup",
        };
  }

  try {
    // Changes exist — stage, commit, and create a branch.
    execFileSync("git", ["add", "-A"], { cwd: worktree.path, stdio: "pipe", timeout: 10000 });

    // Sanitize commit messages before they reach git logs or downstream tooling.
    const rawDesc = typeof agentDescription === "string" ? agentDescription : String(agentDescription);
    const safeDescStr = rawDesc
      .replace(/[\r\n\x00-\x1F]/g, " ")
      .replace(/["`$\\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const safeDesc = safeTruncate(safeDescStr, 200);
    const commitMsg = `pi-agent: ${safeDesc}`;

    execFileSync("git", ["commit", "-m", commitMsg], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 10000,
    });

    // The branch component was normalized when the worktree was created. Keep a
    // defensive final pass for callers that construct WorktreeInfo themselves.
    const safeBranchName = `pi-agent-${sanitizeAgentId(worktree.branch.replace(/^pi-agent-/, ""))}`;

    let branchName = safeBranchName;
    try {
      execFileSync("git", ["branch", "--", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5000,
      });
    } catch {
      branchName = `${branchName}-${Date.now()}`;
      execFileSync("git", ["branch", "--", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5000,
      });
    }
    worktree.branch = branchName;

    const removed = removeWorktree(cwd, worktree.path);
    return removed
      ? { hasChanges: true, branch: branchName }
      : {
          hasChanges: true,
          branch: branchName,
          path: worktree.path,
          error: "Changes were committed, but the worktree could not be removed",
        };
  } catch (error) {
    // Never remove a dirty worktree after a staging/commit/branch failure. It is
    // the only remaining copy of the agent's changes and must stay recoverable.
    return {
      hasChanges: true,
      path: worktree.path,
      error: `Unable to commit worktree changes; preserved for recovery: ${formatCleanupError(error)}`,
    };
  }
}

/** Force-remove a worktree. Returns whether its directory is gone. */
function removeWorktree(cwd: string, worktreePath: string): boolean {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd,
      stdio: "pipe",
      timeout: 10000,
    });
  } catch {
    try {
      execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5000 });
    } catch {
      /* ignore */
    }
  }
  return !existsSync(worktreePath);
}

/**
 * Prune any orphaned worktrees (crash recovery).
 */
export function pruneWorktrees(cwd: string): void {
  try {
    execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5000 });
  } catch { /* ignore */ }
}
