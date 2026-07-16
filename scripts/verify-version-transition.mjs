import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, loadReleasePolicy, parseStableVersion } from "./release-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(`Version transition violation: ${message}`);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function packageVersion(ref) {
  const pkg = JSON.parse(git(["show", `${ref}:package.json`]));
  return pkg.version;
}

/**
 * Allow 0.17.x maintenance bumps (e.g. 0.17.1 → 0.17.5) on any branch.
 * Keeps the locked 0.18 release transaction as the only path onto 0.18.x.
 */
function isMaintenanceBaselineBump(baseVersion, headVersion, policy) {
  const base = parseStableVersion(baseVersion);
  const head = parseStableVersion(headVersion);
  const initial = parseStableVersion(policy.initialRelease);
  const [trainMajor, trainMinor] = String(policy.releaseTrain)
    .split(".")
    .map(Number);
  // Maintenance stays on the pre-train line (0.17 while train is 0.18).
  if (base.major !== head.major || base.minor !== head.minor) return false;
  if (head.major !== trainMajor || head.minor !== trainMinor - 1) return false;
  if (compareVersions(head, base) <= 0) return false;
  if (compareVersions(head, initial) >= 0) return false;
  if (!policy.sourceBaselines.includes(baseVersion)) return false;
  // Head must itself become an approved baseline (or already be listed).
  if (!policy.sourceBaselines.includes(headVersion)) {
    fail(
      `maintenance bump ${baseVersion} -> ${headVersion} requires ${headVersion} in sourceBaselines`,
    );
  }
  return true;
}

async function verify(baseRef, headRef, branchName) {
  const policy = await loadReleasePolicy(ROOT);
  const baseVersion = packageVersion(baseRef);
  const headVersion = packageVersion(headRef);
  if (baseVersion === headVersion) {
    console.log(`No package version transition: ${headVersion}`);
    return;
  }

  if (isMaintenanceBaselineBump(baseVersion, headVersion, policy)) {
    console.log(
      `Maintenance baseline transition verified: ${baseVersion} -> ${headVersion} on ${branchName}`,
    );
    return;
  }

  if (branchName !== policy.releaseBranch) {
    fail(`version changes are allowed only on ${policy.releaseBranch}, received ${branchName}`);
  }
  if (!policy.sourceBaselines.includes(baseVersion)) {
    fail(`base version ${baseVersion} is not an approved source baseline`);
  }
  if (headVersion !== policy.initialRelease) {
    fail(`initial transition must end at ${policy.initialRelease}, received ${headVersion}`);
  }
  const commitCount = Number(git(["rev-list", "--count", `${baseRef}..${headRef}`]));
  if (commitCount !== 1) {
    fail(`release transition must contain exactly one commit, received ${commitCount}`);
  }
  const subject = git(["log", "-1", "--pretty=%s", headRef]);
  if (subject !== policy.releaseCommitTitle) {
    fail(`release commit title must be ${policy.releaseCommitTitle}, received ${subject}`);
  }

  const transaction = spawnSync(
    process.execPath,
    ["scripts/verify-release-transaction.mjs", baseRef, headRef, headVersion],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (transaction.status !== 0) {
    fail(transaction.stderr.trim() || transaction.stdout.trim() || "semantic transaction verifier failed");
  }
  console.log(`Version transition verified: ${baseVersion} -> ${headVersion} on ${branchName}`);
}

const [baseRef, headRef, branchName] = process.argv.slice(2);
if (!baseRef || !headRef || !branchName) {
  console.error("Usage: node scripts/verify-version-transition.mjs <base-ref> <head-ref> <branch-name>");
  process.exitCode = 2;
} else {
  verify(baseRef, headRef, branchName).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
