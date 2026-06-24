/**
 * env.ts — Detect environment info (git, platform) for subagent system prompts.
 *
 * ⚠ PHASE 3 DEFERRED — do NOT delete this file or `detectEnv` until the
 * dual-read surface (`buildEnvFromContext` in `src/env-context.ts`) has
 * been exposed for at least 2 MINOR VERSIONS downstream.
 *
 * See `docs/chef-rfcs/CHEF-100-workspace-context.md` Phase 3 plan.
 * The agent-runner consumer no longer imports `detectEnv` (Phase 2 stripped
 * the `??` fallback at `src/agent-runner.ts:414`), so as of this branch
 * detectEnv is reachable only from its own test file (`test/env.test.ts`)
 * and from any downstream extension that still imports it directly. Phase 3
 * is the atomic removal of this entire file (plus `test/env.test.ts`).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EnvInfo } from "./types.js";

/**
 * Run a git command and return its trimmed stdout, or null on any failure:
 * git not installed, command throws, timeout, or non-zero exit code.
 */
async function readGitStdout(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const result = await pi.exec("git", args, { cwd, timeout: 5000 });
    return result.code === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @deprecated scheduled for deletion in CHEF-100 Phase 3 after 2
 * MINOR VERSIONS of dual-read exposure (dual-read release version pending
 * the upstream RFC merge — see CHANGELOG). Migrate to
 * `buildEnvFromContext` from "./env-context.js" which reads
 * `pi.workspaceContext` synchronously from the host with 0 shell-out cost.
 * See `docs/chef-rfcs/CHEF-100-workspace-context.md` for the rollout timeline.
 */
export async function detectEnv(pi: ExtensionAPI, cwd: string): Promise<EnvInfo> {
  const revParse = await readGitStdout(pi, cwd, [
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  const isGitRepo = revParse === "true";
  const branch = isGitRepo
    ? (await readGitStdout(pi, cwd, ["branch", "--show-current"])) ?? "unknown"
    : "";

  return {
    isGitRepo,
    branch,
    platform: process.platform,
  };
}
