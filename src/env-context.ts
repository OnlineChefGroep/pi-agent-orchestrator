/**
 * env-context.ts — Build EnvInfo from the host-provided `WorkspaceContext`.
 *
 * Post-RFC shape: every host ships `workspaceContext` on the ExtensionAPI,
 * so this helper is a pure synchronous read. The 0-10s sequential
 * `pi.exec("git", …)` shell-out in `src/env.ts: detectEnv` is only used as
 * a legacy fallback for pre-RFC hosts (still supported indefinitely per
 * the upstream RFC versioning statement — see
 * `docs/chef-rfcs/upstream/CHEF-100-host-extension.md`).
 *
 * Tests live in a parallel PR (per testing skill discipline) so the
 * integration surface here stays small and the test PR can iterate on
 * edge cases without merging noise into this one.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EnvInfo, WorkspaceContext } from "./types.js";

/**
 * Read env from the upstream `workspaceContext`. Host struct is guaranteed
 * by the upstream `ExtensionAPI`. The defensive falsy check handles
 * misconfigured hosts or transitioning runtimes that violate the typed
 * contract (e.g., a host setting `workspaceContext: null` at runtime).
 *
 * The ternary on `wc.git.isRepo` correctly narrows the discriminated
 * union: when `isRepo` is `false`, `branch` is reported as `""` to match
 * the EnvInfo contract used by `buildAgentPrompt`.
 */
export function buildEnvFromContext(pi: ExtensionAPI): EnvInfo | undefined {
  // Access workspaceContext via structural typing — the field is not yet
  // in the upstream type definitions but is present on RFC-compliant hosts.
  const wc = (pi as { workspaceContext?: WorkspaceContext }).workspaceContext;
  if (!wc) return undefined;
  return {
    isGitRepo: wc.git.isRepo,
    branch: wc.git.isRepo ? wc.git.branch : "",
    platform: wc.platform,
  };
}
