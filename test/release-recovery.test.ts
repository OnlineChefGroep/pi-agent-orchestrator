/**
 * release-recovery.test.ts — Unit coverage for exact npm version gates and
 * GitHub Release recovery metadata validation.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertExactVersionAbsent,
  decideNpmPublish,
  validateGitHubReleaseMetadata,
} from "../scripts/release-recovery.mjs";

describe("decideNpmPublish", () => {
  it("skips publish when the exact release version already exists, even if latest differs", () => {
    const decision = decideNpmPublish({
      releaseVersion: "0.18.0",
      exactVersion: "0.18.0",
      latestVersion: "0.18.1",
    });
    expect(decision.publish).toBe(false);
    expect(decision.reason).toBe("exact-version-exists");
  });

  it("publishes when the exact version is absent and release is ahead of latest", () => {
    const decision = decideNpmPublish({
      releaseVersion: "0.18.0",
      exactVersion: null,
      latestVersion: "0.17.1",
    });
    expect(decision.publish).toBe(true);
    expect(decision.reason).toBe("exact-version-absent");
  });

  it("refuses to publish when exact version is absent but latest is already higher", () => {
    expect(() =>
      decideNpmPublish({
        releaseVersion: "0.18.0",
        exactVersion: null,
        latestVersion: "0.18.1",
      }),
    ).toThrow(/behind npm latest 0\.18\.1/);
  });

  it("does not treat a mismatched latest tag as proof that 0.18.0 is unpublished", () => {
    // Regression: npm view pkg version returns latest only. If latest is 0.17.1
    // while 0.18.0 already exists, recovery must still skip republish.
    const decision = decideNpmPublish({
      releaseVersion: "0.18.0",
      exactVersion: "0.18.0",
      latestVersion: "0.17.1",
    });
    expect(decision.publish).toBe(false);
    expect(decision.reason).toBe("exact-version-exists");
  });
});

describe("assertExactVersionAbsent", () => {
  it("blocks prepare-release when the exact candidate already exists on npm", () => {
    expect(() =>
      assertExactVersionAbsent({
        releaseVersion: "0.18.0",
        exactVersion: "0.18.0",
      }),
    ).toThrow(/use release recovery instead of preparing again/);
  });

  it("allows prepare-release when the exact candidate is absent", () => {
    expect(() =>
      assertExactVersionAbsent({
        releaseVersion: "0.18.0",
        exactVersion: null,
      }),
    ).not.toThrow();
  });
});

describe("validateGitHubReleaseMetadata", () => {
  it("accepts a published release with the expected tag and title", () => {
    const result = validateGitHubReleaseMetadata(
      {
        tagName: "v0.18.0",
        isDraft: false,
        isPrerelease: false,
        name: "v0.18.0",
      },
      { tagName: "v0.18.0", name: "v0.18.0" },
    );
    expect(result.ok).toBe(true);
    expect(result.repairs).toEqual([]);
  });

  it("flags draft, prerelease, and wrong title for idempotent repair", () => {
    const result = validateGitHubReleaseMetadata(
      {
        tagName: "v0.18.0",
        isDraft: true,
        isPrerelease: true,
        name: "Release Candidate",
      },
      { tagName: "v0.18.0", name: "v0.18.0" },
    );
    expect(result.ok).toBe(false);
    expect(result.repairs).toEqual(["draft", "prerelease", "title"]);
  });

  it("rejects a release whose tagName does not match the expected tag", () => {
    expect(() =>
      validateGitHubReleaseMetadata(
        {
          tagName: "v0.17.1",
          isDraft: false,
          isPrerelease: false,
          name: "v0.18.0",
        },
        { tagName: "v0.18.0", name: "v0.18.0" },
      ),
    ).toThrow(/tagName/);
  });
});

describe("release-recovery CLI contract", () => {
  it("exposes assert-absent, decide-publish, and ensure-github-release commands", () => {
    const source = readFileSync(new URL("../scripts/release-recovery.mjs", import.meta.url), "utf8");
    expect(source).toContain('command === "assert-absent"');
    expect(source).toContain('command === "decide-publish"');
    expect(source).toContain('command === "ensure-github-release"');
    expect(source).toContain("writeGithubOutput(\"publish\"");
  });
});
