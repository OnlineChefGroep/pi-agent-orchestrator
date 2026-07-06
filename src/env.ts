/**
 * env.ts — Detect environment info (git, platform) for subagent system prompts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EnvInfo } from "./types.js";

/**
 * Run a git command and return its trimmed stdout, or null on any failure:
 * git not installed, command throws, timeout, or non-zero exit code.
 */
async function readGitStdout(pi: ExtensionAPI, cwd: string, args: string[]): Promise<string | null> {
  try {
    const result = await pi.exec("git", args, { cwd, timeout: 5000 });
    return result.code === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

export async function detectEnv(pi: ExtensionAPI, cwd: string): Promise<EnvInfo> {
  const revParse = await readGitStdout(pi, cwd, ["rev-parse", "--is-inside-work-tree"]);
  const isGitRepo = revParse === "true";
  const branch = isGitRepo ? ((await readGitStdout(pi, cwd, ["branch", "--show-current"])) ?? "unknown") : "";

  return {
    isGitRepo,
    branch,
    platform: process.platform,
  };
}
