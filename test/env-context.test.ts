/**
 * env-context.test.ts — Unit tests for `buildEnvFromContext`.
 *
 * Phase 2 shape (post-upstream): the helper always returns `EnvInfo`
 * because upstream's `ExtensionAPI.workspaceContext` is required +
 * non-nullable. There is no `undefined` path; the explicit-null
 * defensive test was retired in this phase. See
 * `docs/chef-rfcs/CHEF-100-workspace-context.md` Phase 3 plan for the
 * full dual-read → single-read migration timeline.
 *
 * Mock pattern: minimal `ExtensionAPI`-shaped object cast through
 * `unknown`. Avoids `as any` per AGENTS.md Common Mistake #8 — the
 * cast target is a typed structural union (here, `ExtensionAPI`
 * itself, parameterised over `workspaceContext`), not an escape hatch.
 */

import type { ExtensionAPI, WorkspaceContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildEnvFromContext } from "../src/env-context.js";

/** Minimal ExtensionAPI stub whose `workspaceContext` is the given value. */
function mockPiWithContext(
  workspaceContext: WorkspaceContext,
): ExtensionAPI {
  return { workspaceContext } as unknown as ExtensionAPI;
}

describe("buildEnvFromContext", () => {
  // 1. isRepo:true + named branch → EnvInfo mapped exactly: cwd/git/branch/platform
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

  // 2. isRepo:false → branch: "" (the discriminated-union narrowing path)
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

  // 3. platform flows through for every NodeJS.Platform value.
  //    Parametrised via it.each; one assertion per platform.
  it.each(["darwin", "linux", "win32", "freebsd"] as const)(
    "preserves platform '%s' through to EnvInfo",
    (platform) => {
      const pi = mockPiWithContext({
        cwd: "/repo",
        git: { isRepo: true, branch: "main" },
        platform,
      });
      expect(buildEnvFromContext(pi).platform).toBe(platform);
    },
  );
});
