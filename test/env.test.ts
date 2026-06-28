/**
 * env.test.ts — Unit tests for `detectEnv`.
 *
 * All scenarios mock `pi.exec()` with `vi.fn()` rather than shelling out
 * to the real git binary. The prior version used `execSync` against a
 * temp directory for the happy paths, which made the file flaky on
 * Windows (temp-dir race pattern, AGENTS.md #5) and added a system
 * dependency for testing pure logic.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { detectEnv } from "../src/env.js";

/** Minimal ExtensionAPI stub whose `exec` method is the given `vi.fn`. */
function mockPi(exec: ReturnType<typeof vi.fn>): ExtensionAPI {
  return { exec } as unknown as ExtensionAPI;
}

describe("detectEnv", () => {
  it("returns isGitRepo=false and branch='' when rev-parse reports 'false'", async () => {
    const exec = vi.fn().mockResolvedValue({ code: 0, stdout: "false" });
    const env = await detectEnv(mockPi(exec), "/tmp/non-git");

    expect(env.isGitRepo).toBe(false);
    expect(env.branch).toBe("");
    expect(typeof env.platform).toBe("string");

    // Branch command must NOT be issued when not in a git repo (early return).
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("returns branch='unknown' when the branch command throws", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: "true" })
      .mockRejectedValueOnce(new Error("git: broken pipe"));

    const env = await detectEnv(mockPi(exec), "/repo");

    expect(env.isGitRepo).toBe(true);
    expect(env.branch).toBe("unknown");
  });

  it("returns branch='unknown' when the branch command exits non-zero", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: "true" })
      .mockResolvedValueOnce({ code: 128, stdout: "" });

    const env = await detectEnv(mockPi(exec), "/repo");

    expect(env.isGitRepo).toBe(true);
    expect(env.branch).toBe("unknown");
  });

  it("returns branch='' on detached HEAD (empty stdout, code===0)", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: "true" })
      .mockResolvedValueOnce({ code: 0, stdout: "" });

    const env = await detectEnv(mockPi(exec), "/repo");

    expect(env.isGitRepo).toBe(true);
    // `?? "unknown"` only triggers on null/undefined; empty stdout stays empty.
    expect(env.branch).toBe("");
  });

  it("returns the trimmed branch name when on a named branch", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: "true" })
      .mockResolvedValueOnce({ code: 0, stdout: "feat/auth\n  " });

    const env = await detectEnv(mockPi(exec), "/repo");

    expect(env.isGitRepo).toBe(true);
    expect(env.branch).toBe("feat/auth");
  });
});
