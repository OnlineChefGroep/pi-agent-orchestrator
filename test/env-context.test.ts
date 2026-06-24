/**
 * env-context.test.ts — Unit tests for `buildEnvFromContext`.
 *
 * Parallel-test PR for the CHEF-100 Phase 1 dual-read adapter
 * (implementation: PR #215, src/env-context.ts). Covers the
 * synchronous `pi.workspaceContext` read path. The legacy `detectEnv`
 * shell-out path is exercised in test/env.test.ts — these two files
 * together give full coverage of the dual-read's two branches.
 *
 * Mock pattern: minimal `ExtensionAPI`-shaped object cast through
 * `unknown`. Avoids `as any` per AGENTS.md Common Mistake #8 — the
 * cast target is a typed structural union (here, `ExtensionAPI`
 * itself, parameterised over `workspaceContext`), not an escape hatch.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildEnvFromContext } from "../src/env-context.js";
import type { WorkspaceContext } from "../src/types.js";

/** Minimal ExtensionAPI stub whose `workspaceContext` is the given value. */
function mockPiWithContext(
  workspaceContext: WorkspaceContext | null | undefined,
): ExtensionAPI {
  return { workspaceContext } as unknown as ExtensionAPI;
}

describe("buildEnvFromContext", () => {
  // 1. absent → undefined (legacy detectEnv path will be exercised
  //    by the caller via `?? await detectEnv(...)` in src/agent-runner.ts:410).
  it("returns undefined when workspaceContext is absent", () => {
    const pi = mockPiWithContext(undefined);
    expect(buildEnvFromContext(pi)).toBeUndefined();
  });

  // 2. isRepo:true + named branch → EnvInfo mapped exactly: cwd/git/branch/platform
  it("returns EnvInfo with branch populated when isRepo is true", () => {
    const pi = mockPiWithContext({
      cwd: "/repo",
      git: { isRepo: true, branch: "feature/foo" },
      platform: "darwin",
    });
    expect(buildEnvFromContext(pi)).toEqual({
      isGitRepo: true,
      branch: "feature/foo",
      platform: "darwin",
    });
  });

  // 3. isRepo:false → branch: "" (the discriminated-union narrowing path)
  it("returns EnvInfo with branch '' when isRepo is false", () => {
    const pi = mockPiWithContext({
      cwd: "/not-a-repo",
      git: { isRepo: false },
      platform: "linux",
    });
    expect(buildEnvFromContext(pi)).toEqual({
      isGitRepo: false,
      branch: "",
      platform: "linux",
    });
  });

  // 4. platform flows through for every NodeJS.Platform value.
  //    Parametrised via it.each; one assertion per platform.
  it.each(["darwin", "linux", "win32", "freebsd"] as const)(
    "preserves platform '%s' through to EnvInfo",
    (platform) => {
      const pi = mockPiWithContext({
        cwd: "/repo",
        git: { isRepo: true, branch: "main" },
        platform,
      });
      expect(buildEnvFromContext(pi)?.platform).toBe(platform);
    },
  );

  // 5. Explicit-null is a host-misconfiguration edge case: helper
  //    must treat `workspaceContext: null` identically to absent —
  //    i.e., return undefined rather than crashing on
  //    `wc.git.isRepo`. Defensive against malformed hosts.
  it("returns undefined when workspaceContext is explicitly null", () => {
    const pi = mockPiWithContext(null);
    expect(buildEnvFromContext(pi)).toBeUndefined();
  });
});
