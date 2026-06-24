/**
 * env-context.ts — Build EnvInfo from the host-provided `WorkspaceContext`.
 *
 * Phase 1 of the CHEF-100 dual-read migration: if the host
 * (`@earendil-works/pi-coding-agent`) has shipped the upstream
 * `workspaceContext` surface (RFC filed at
 * docs/chef-rfcs/upstream/CHEF-100-host-extension.md), the extension
 * consumes it synchronously and skips the 0-10s sequential
 * `pi.exec("git", …)` shell-out sequence in src/env.ts: detectEnv.
 *
 * On hosts that have not shipped the surface yet, this function returns
 * `undefined` so the caller (`runAgent` in src/agent-runner.ts) falls
 * back to the legacy detectEnv path. Pre-RFC host support is preserved
 * indefinitely per the upstream RFC versioning statement.
 *
 * Tests live in a parallel PR (per testing skill discipline) so the
 * integration surface here stays small and the test PR can iterate on
 * edge cases without merging noise into this one.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EnvInfo, WorkspaceContext } from "./types.js";

/**
 * Read env from the upstream `workspaceContext` if exposed on the
 * extension API. Returns `undefined` on pre-RFC hosts so the caller can
 * coalesce with `await detectEnv(...)`.
 *
 * The `as` cast below scopes the structural lookup to one line and
 * never escapes this function — the return shape is the project's
 * existing `EnvInfo` (decoupled from the upstream type), so downstream
 * consumers (src/prompts.ts, src/agent-runner.ts) see no change.
 *
 * The ternary on `wc.git.isRepo` correctly narrows the discriminated
 * union: when `isRepo` is `false`, `branch` is reported as `""` to
 * match the EnvInfo contract used by buildAgentPrompt.
 */
export function buildEnvFromContext(pi: ExtensionAPI): EnvInfo | undefined {
  const wc = (pi as { workspaceContext?: WorkspaceContext }).workspaceContext;
  if (!wc) return undefined;
  return {
    isGitRepo: wc.git.isRepo,
    branch: wc.git.isRepo ? wc.git.branch : "",
    platform: wc.platform,
  };
}
