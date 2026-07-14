import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname ?? ".", "..");
const sandboxes: string[] = [];

function copyFixture(root: string, path: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(sourceRoot, path), destination);
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function node(root: string, ...args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
}

function createReleaseSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-release-transaction-"));
  sandboxes.push(root);
  for (const path of [
    ".release-policy.json",
    "CHANGELOG.md",
    "package.json",
    "package-lock.json",
    "docs/releases/v0.18.0.md",
    "scripts/prepare-release.mjs",
    "scripts/release-policy.mjs",
    "scripts/verify-release-transaction.mjs",
    "scripts/verify-version-transition.mjs",
  ]) {
    copyFixture(root, path);
  }
  git(root, "init");
  git(root, "config", "user.email", "release-test@example.invalid");
  git(root, "config", "user.name", "Release Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "baseline");
  return root;
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

describe("v0.18 release transaction", () => {
  it("prepares, validates, and rejects manipulated release paths", () => {
    const root = createReleaseSandbox();
    const prepare = node(root, "scripts/prepare-release.mjs", "0.18.0", "2026-07-14");
    expect(prepare.status, prepare.stderr).toBe(0);

    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    expect(pkg.version).toBe("0.18.0");
    expect(lock.version).toBe("0.18.0");
    expect(lock.packages[""].version).toBe("0.18.0");
    expect(lock.packages[""].peerDependencies).toEqual(pkg.peerDependencies);
    expect(lock.packages[""].engines).toEqual(pkg.engines);
    expect(changelog).toContain("## v0.18.0 (2026-07-14)");
    expect(changelog).toContain("No unreleased changes");

    const publishPolicy = node(root, "scripts/release-policy.mjs", "publish");
    expect(publishPolicy.status, publishPolicy.stderr).toBe(0);

    git(root, "add", "CHANGELOG.md", "package.json", "package-lock.json");
    git(root, "commit", "-m", "chore(release): v0.18.0");
    const verify = node(
      root,
      "scripts/verify-release-transaction.mjs",
      "HEAD^",
      "HEAD",
      "0.18.0",
    );
    expect(verify.status, verify.stderr).toBe(0);

    const transition = node(
      root,
      "scripts/verify-version-transition.mjs",
      "HEAD^",
      "HEAD",
      "release/v0.18.0",
    );
    expect(transition.status, transition.stderr).toBe(0);
    const wrongBranch = node(
      root,
      "scripts/verify-version-transition.mjs",
      "HEAD^",
      "HEAD",
      "feature/version-bump",
    );
    expect(wrongBranch.status).not.toBe(0);
    expect(wrongBranch.stderr).toContain("version changes are allowed only on release/v0.18.0");

    pkg.description = "tampered after release preparation";
    writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    git(root, "add", "package.json");
    git(root, "commit", "-m", "chore(release): v0.18.0");
    const rejected = node(
      root,
      "scripts/verify-release-transaction.mjs",
      "HEAD^",
      "HEAD",
      "0.18.0",
    );
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("package.json changed fields other than version");
  });
});
