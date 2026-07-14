/**
 * release-verification.test.ts — Verify release artifacts for MIT open-source dual-publish.
 *
 * Tests cover: npm pack output, license consistency, registry URL correctness.
 * These tests run offline — no network access required.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname ?? ".", "..");

function readRoot(file: string): string {
  return readFileSync(resolve(root, file), "utf-8");
}

function fileExists(file: string): boolean {
  return existsSync(resolve(root, file));
}

// ── Task 12: npm pack verification ──────────────────────────────────────────

describe("npm pack verification", () => {
  it("package.json files field includes expected entries", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    const files: string[] = pkg.files ?? [];
    expect(files).toContain("src/");
    expect(files).toContain("README.md");
    expect(files).toContain("CHANGELOG.md");
    expect(files).toContain("LICENSE");
  });

  it(".npmignore excludes package-lock.json", () => {
    expect(fileExists(".npmignore")).toBe(true);
    const npmignore = readRoot(".npmignore");
    expect(npmignore).toContain("package-lock.json");
  });

  it("package.json files field does not include dev-only paths", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    const files: string[] = pkg.files ?? [];
    expect(files).not.toContain("test/");
    expect(files).not.toContain(".github/");
    expect(files).not.toContain("scripts/");
  });
});

// ── Task 13: License header verification ────────────────────────────────────

describe("license verification", () => {
  it("LICENSE file exists and is MIT", () => {
    expect(fileExists("LICENSE")).toBe(true);
    const license = readRoot("LICENSE");
    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 OnlineChef");
  });

  it("package.json declares MIT license", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    expect(pkg.license).toBe("MIT");
  });

  it("no proprietary markings in source files", () => {
    const proprietaryTerms = [
      "All Rights Reserved",
      "Proprietary",
      "Confidential",
    ];
    // Spot-check a few key source files
    const sourceFiles = [
      "src/index.ts",
      "src/types.ts",
      "src/settings.ts",
      "src/agent-runner.ts",
    ];
    for (const file of sourceFiles) {
      if (!fileExists(file)) continue;
      const content = readRoot(file);
      for (const term of proprietaryTerms) {
        expect(content).not.toContain(term);
      }
    }
  });

  it("SECURITY.md and CODE_OF_CONDUCT.md exist", () => {
    expect(fileExists("SECURITY.md")).toBe(true);
    expect(fileExists("CODE_OF_CONDUCT.md")).toBe(true);
  });

  it("ROADMAP.md exists and ENTERPRISE_READINESS.md is deleted", () => {
    expect(fileExists("ROADMAP.md")).toBe(true);
    expect(fileExists("ENTERPRISE_READINESS.md")).toBe(false);
  });
});

// ── Node.js engine version consistency (CVE-001 follow-up: pin to 22.19) ────

describe("Node.js version consistency", () => {
  it(".nvmrc pins the exact Node version used by CI", () => {
    expect(fileExists(".nvmrc")).toBe(true);
    const nvmrc = readRoot(".nvmrc").trim();
    expect(nvmrc).toBe("22.19.0");
  });

  it("package.json engines.node requires at least the .nvmrc version", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    expect(pkg.engines?.node).toBe(">=22.19.0");
  });

  it("package-lock.json root package engines.node matches package.json", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    const lock = JSON.parse(readRoot("package-lock.json"));
    const rootPackage = lock.packages?.[""];
    expect(rootPackage?.engines?.node).toBe(pkg.engines.node);
    // Top-level name/version metadata should also stay in sync with package.json.
    expect(lock.name).toBe(pkg.name);
    expect(lock.version).toBe(pkg.version);
  });

  it("ci.yml pins setup-node to the same minor version as .nvmrc for jobs that install/build/test", () => {
    const nvmrc = readRoot(".nvmrc").trim();
    const [major, minor] = nvmrc.split(".");
    const expectedNodeVersion = `${major}.${minor}`;

    const ci = readRoot(".github/workflows/ci.yml");
    // The "quality" and "lowest-peer-dependencies" jobs run typecheck/build/test
    // and must use the pinned patch-aligned minor version, not a bare major version.
    const pinnedNodeVersionMatches = [...ci.matchAll(/node-version:\s*([0-9.]+)/g)].map((m) => m[1]);
    expect(pinnedNodeVersionMatches).toContain(expectedNodeVersion);
    expect(pinnedNodeVersionMatches.filter((v) => v === expectedNodeVersion).length).toBeGreaterThanOrEqual(2);
  });

  it("ci.yml does not regress to an unpinned bare major Node version for the quality gate job", () => {
    const ci = readRoot(".github/workflows/ci.yml");
    const qualityJobMatch = ci.match(/quality:[\s\S]*?compatibility:/);
    expect(qualityJobMatch).not.toBeNull();
    expect(qualityJobMatch![0]).toMatch(/node-version:\s*22\.19/);
    expect(qualityJobMatch![0]).not.toMatch(/node-version:\s*22\s*$/m);
  });
});

// ── Task 14: Registry URL verification ──────────────────────────────────────

describe("registry URL verification", () => {
  it("release.yml publishes to npmjs.org", () => {
    expect(fileExists(".github/workflows/release.yml")).toBe(true);
    const content = readRoot(".github/workflows/release.yml");
    expect(content).toMatch(/registry-url:\s*"https:\/\/registry\.npmjs\.org"/);
    expect(content).toMatch(/name:\s*Publish to npmjs\.org/);
    expect(content).toMatch(/NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
    expect(content).toMatch(/gh release create/);
    expect(content).toMatch(/v\$\{RELEASE_VERSION\}|v\$\{\{ steps\.version\.outputs\.version \}\}/);
  });

  it("legacy publish workflows are removed in favor of release.yml", () => {
    expect(fileExists(".github/workflows/publish.yml")).toBe(false);
    expect(fileExists(".github/workflows/publish-npm.yml")).toBe(false);
  });

  it("package.json publishConfig.registry points to npmjs.org", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    expect(pkg.publishConfig?.registry).toBe("https://registry.npmjs.org");
    expect(pkg.publishConfig?.access).toBe("public");
  });
});
