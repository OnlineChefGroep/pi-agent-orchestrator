/**
 * env-context.ts — Build EnvInfo from the host-provided `WorkspaceContext`.
 *
 * Phase 2 shape (post-upstream): every host ships `workspaceContext` as a
 * required, non-nullable field on the `ExtensionAPI`. This helper is a
 * pure synchronous read with no fallback. The legacy 0–10s sequential
 * `pi.exec("git", …)` shell-out in `src/env.ts: detectEnv` was retired
 * from `agent-runner.ts:414` in this phase; it is kept in `src/env.ts`
 * marked `@deprecated` for downstream who still import it directly, and
 * is scheduled for full deletion in CHEF-100 Phase 3 (two minor versions
 * after the dual-read release). See
 * `docs/chef-rfcs/CHEF-100-workspace-context.md` Phase 3 plan.
 *
 * Tests live in a parallel PR (per testing skill discipline) so the
 * integration surface here stays small and the test PR can iterate on
 * edge cases without merging noise into this one.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EnvInfo } from "./types.js";

/**
 * Read env from the upstream `workspaceContext`. Host struct is guaranteed
 * post-RFC (`workspaceContext: WorkspaceContext` required, non-nullable),
 * so no runtime defensive checks. The ternary on `wc.git.isRepo` correctly
 * narrows the discriminated union: when `isRepo` is `false`, `branch` is
 * reported as `""` to match the EnvInfo contract used by `buildAgentPrompt`.
 */
export function buildEnvFromContext(pi: ExtensionAPI): EnvInfo {
  const wc = (pi as any).workspaceContext;
  return {
    isGitRepo: wc.git.isRepo,
    branch: wc.git.isRepo ? wc.git.branch : "",
    platform: wc.platform,
  };
}
