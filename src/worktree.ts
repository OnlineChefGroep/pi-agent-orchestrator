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

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch name created for this worktree (if changes exist). */
  branch: string;
}

export interface WorktreeCleanupResult {
  /** Whether changes were found in the worktree. */
  hasChanges: boolean;
  /** Branch name if changes were committed. */
  branch?: string;
  /** Worktree path if it was kept. */
  path?: string;
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

  const branch = `pi-agent-${agentId}`;
  const suffix = randomUUID().slice(0, 8);
  const worktreePath = join(tmpdir(), `pi-agent-${agentId}-${suffix}`);

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

/**
 * Clean up a worktree after agent completion.
 * - If no changes: remove worktree entirely.
 * - If changes exist: create a branch, commit changes, return branch info.
 */
export function cleanupWorktree(
  cwd: string,
  worktree: WorktreeInfo,
  agentDescription: string,
): WorktreeCleanupResult {
  if (!existsSync(worktree.path)) {
    return { hasChanges: false };
  }

  try {
    // Check for uncommitted changes in the worktree
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 10000,
    }).toString().trim();

    if (!status) {
      // No changes — remove worktree
      removeWorktree(cwd, worktree.path);
      return { hasChanges: false };
    }

    // Changes exist — stage, commit, and create a branch
    execFileSync("git", ["add", "-A"], { cwd: worktree.path, stdio: "pipe", timeout: 10000 });
    
    // CVE-001 FIX: Sanitize commit message to prevent git hook injection
    // Remove newlines, carriage returns, control characters, and shell metacharacters
    const rawDesc = typeof agentDescription === "string" ? agentDescription : String(agentDescription);
    const safeDescStr = rawDesc
      .replace(/[\r\n\x00-\x1F]/g, ' ')  // Remove newlines and control chars
      .replace(/["`$\\]/g, '')            // Remove shell metacharacters
      .replace(/\s+/g, ' ')               // Normalize whitespace
      .trim();

    const safeDesc = safeTruncate(safeDescStr, 200);
    
    const commitMsg = `pi-agent: ${safeDesc}`;
    
    execFileSync("git", ["commit", "-m", commitMsg], {
      cwd: worktree.path,
      stdio: "pipe",
      timeout: 10000,
    });

    // Create a branch pointing to the worktree's HEAD.
    // If the branch already exists, append a suffix to avoid overwriting previous work.

    // Sanitize branch name to prevent command injection and ensure valid git branch format
    const safeBranchName = worktree.branch
      .replace(/[\r\n\x00-\x1F]/g, "")
      .replace(/[~^:?*[\\\];"'`$\s]/g, "-")
      .replace(/^-+|-+$/g, "");

    let branchName = safeBranchName || "pi-agent-update";

    try {
      execFileSync("git", ["branch", "--", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5000,
      });
    } catch {
      // Branch already exists — use a unique suffix
      branchName = `${branchName}-${Date.now()}`;
      execFileSync("git", ["branch", "--", branchName], {
        cwd: worktree.path,
        stdio: "pipe",
        timeout: 5000,
      });
    }
    // Update branch name in worktree info for the caller
    worktree.branch = branchName;

    // Remove the worktree (branch persists in main repo)
    removeWorktree(cwd, worktree.path);

    return {
      hasChanges: true,
      branch: worktree.branch,
      path: worktree.path,
    };
  } catch {
    // Best effort cleanup on error
    try { removeWorktree(cwd, worktree.path); } catch { /* ignore */ }
    return { hasChanges: false };
  }
}

/**
 * Force-remove a worktree.
 */
function removeWorktree(cwd: string, worktreePath: string): void {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd,
      stdio: "pipe",
      timeout: 10000,
    });
  } catch {
    // If git worktree remove fails, try pruning
    try {
      execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5000 });
    } catch { /* ignore */ }
  }
}

/**
 * Prune any orphaned worktrees (crash recovery).
 */
export function pruneWorktrees(cwd: string): void {
  try {
    execFileSync("git", ["worktree", "prune"], { cwd, stdio: "pipe", timeout: 5000 });
  } catch { /* ignore */ }
}