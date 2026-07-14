import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupWorktree, createWorktree, pruneWorktrees } from "../src/worktree.js";

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-wt-agent-id-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "# Test repo");
  execFileSync("git", ["add", "README.md"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: dir, stdio: "pipe" });
  return dir;
}

describe("worktree agent ID safety", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = initGitRepo();
  });

  afterEach(() => {
    try {
      pruneWorktrees(repoDir);
    } catch {
      // Best-effort test cleanup.
    }
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("keeps traversal input inside tmpdir and produces a valid branch after cleanup", async () => {
    const worktree = await createWorktree(repoDir, "../../etc/passwd");
    expect(worktree).toBeDefined();
    expect(resolve(worktree!.path).startsWith(resolve(tmpdir()))).toBe(true);
    expect(worktree!.branch).toBe("pi-agent-etc-passwd");

    writeFileSync(join(worktree!.path, "agent-output.txt"), "safe");
    const result = cleanupWorktree(repoDir, worktree!, "validate sanitized agent ID");

    expect(result).toMatchObject({
      hasChanges: true,
      branch: "pi-agent-etc-passwd",
    });
    expect(result.path).toBeUndefined();

    execFileSync("git", ["check-ref-format", "--branch", result.branch!], {
      cwd: repoDir,
      stdio: "pipe",
    });
    execFileSync("git", ["branch", "-D", result.branch!], { cwd: repoDir, stdio: "pipe" });
  });

  it.each([
    ["whitespace and shell punctuation", "  my agent; $(touch pwned)  ", "pi-agent-my-agent-touch-pwned"],
    ["git ref dot sequence", "feature..escape", "pi-agent-feature-escape"],
    ["path separators", "..\\..\\windows/system32", "pi-agent-windows-system32"],
    ["unicode-only identifier", "😀", "pi-agent-unknown"],
  ])("normalizes %s", async (_name, input, expectedBranch) => {
    const worktree = await createWorktree(repoDir, input);
    expect(worktree).toBeDefined();
    expect(worktree!.branch).toBe(expectedBranch);
    execFileSync("git", ["check-ref-format", "--branch", worktree!.branch], {
      cwd: repoDir,
      stdio: "pipe",
    });
    execFileSync("git", ["worktree", "remove", "--force", worktree!.path], {
      cwd: repoDir,
      stdio: "pipe",
    });
  });
});
