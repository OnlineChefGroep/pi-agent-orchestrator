/**
 * trivyignore-scope.test.ts — Guards the scope of the repo-wide Trivy suppressions.
 *
 * `.trivyignore` suppresses two transitive CVEs by ID, which Trivy applies
 * repo-wide. That is acceptable only because the vulnerable package versions are
 * confined to the `@earendil-works/pi-*` host-platform peer-dependency subtree
 * (never a shipped/direct dependency of this extension, per AGENTS.md). If a
 * vulnerable copy ever escaped that subtree — e.g. a direct dependency pulled in
 * `protobufjs@7.6.4` — the repo-wide ignore would silently hide a real issue.
 *
 * This test is the "check that fails if the same IDs appear outside the
 * host-platform subtree" guard: it maps each suppressed CVE to the vulnerable
 * package version present in the lockfile and asserts every occurrence at that
 * version lives under the host peer subtree.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname ?? ".", "..");

const HOST_SUBTREE_PREFIX = "node_modules/@earendil-works/pi-";

/** Each suppressed CVE, mapped to the vulnerable package + version it covers. */
const SUPPRESSED_CVES = [
  { cve: "CVE-2026-13149", pkg: "brace-expansion", vulnerableVersion: "5.0.6" },
  { cve: "CVE-2026-59877", pkg: "protobufjs", vulnerableVersion: "7.6.4" },
] as const;

interface LockfilePackage {
  version?: string;
}

function readTrivyignoreIds(): string[] {
  return readFileSync(resolve(root, ".trivyignore"), "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^CVE-\d{4}-\d+$/.test(line));
}

function readLockfilePackages(): Record<string, LockfilePackage> {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf-8"));
  return lock.packages ?? {};
}

/** The package name is the segment after the final `node_modules/` in the key. */
function packageNameFromKey(key: string): string {
  const idx = key.lastIndexOf("node_modules/");
  return idx === -1 ? key : key.slice(idx + "node_modules/".length);
}

describe("trivyignore suppression scope", () => {
  it("only suppresses CVEs that this guard tracks", () => {
    // Keeps the suppression file and this guard in lockstep: every ignored ID
    // must have a documented, scope-checked entry here.
    const ignored = new Set(readTrivyignoreIds());
    const tracked = new Set(SUPPRESSED_CVES.map((entry) => entry.cve));
    expect(ignored).toEqual(tracked);
  });

  it.each(SUPPRESSED_CVES)(
    "confines $cve ($pkg@$vulnerableVersion) to the host peer-dependency subtree",
    ({ pkg, vulnerableVersion }) => {
      const packages = readLockfilePackages();
      const vulnerablePaths = Object.entries(packages)
        .filter(([key, meta]) => packageNameFromKey(key) === pkg && meta.version === vulnerableVersion)
        .map(([key]) => key);

      // Sanity: the suppression must target a version that actually exists,
      // otherwise the ignore (and this guard) is stale.
      expect(vulnerablePaths.length).toBeGreaterThan(0);

      const escaped = vulnerablePaths.filter((key) => !key.includes(HOST_SUBTREE_PREFIX));
      expect(
        escaped,
        `${pkg}@${vulnerableVersion} is suppressed repo-wide but appears outside the ` +
          `@earendil-works/pi-* host subtree at: ${escaped.join(", ")}. ` +
          "Fix the dependency instead of relying on the repo-wide .trivyignore.",
      ).toEqual([]);
    },
  );
});
