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
    const proprietaryTerms = ["All Rights Reserved", "Proprietary", "Confidential"];
    // Spot-check a few key source files
    const sourceFiles = ["src/index.ts", "src/types.ts", "src/settings.ts", "src/agent-runner.ts"];
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

// ── Task 14: Registry URL verification ──────────────────────────────────────

describe("registry URL verification", () => {
  it("publish.yml references GitHub Packages registry", () => {
    expect(fileExists(".github/workflows/publish.yml")).toBe(true);
    const content = readRoot(".github/workflows/publish.yml");
    expect(content).toContain("npm.pkg.github.com");
    expect(content).toContain("secrets.GITHUB_TOKEN");
  });

  it("publish-npm.yml exists for npmjs.org publishing", () => {
    expect(fileExists(".github/workflows/publish-npm.yml")).toBe(true);
    const content = readRoot(".github/workflows/publish-npm.yml");
    expect(content).toContain("registry.npmjs.org");
    expect(content).toContain("secrets.NPM_TOKEN");
  });

  it("package.json publishConfig.registry points to npmjs.org", () => {
    const pkg = JSON.parse(readRoot("package.json"));
    expect(pkg.publishConfig?.registry).toBe("https://registry.npmjs.org");
    expect(pkg.publishConfig?.access).toBe("public");
  });
});
