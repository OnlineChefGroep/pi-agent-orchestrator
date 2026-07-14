/**
 * Create or verify that an annotated release tag points at the exact source SHA.
 * Mirrors the finalize job tag step without embedding git logic in YAML.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function fail(message) {
  throw new Error(message);
}

export function ensureReleaseTag({
  tagName,
  commitSha,
  fetchTags = true,
  push = true,
  gitBin = "git",
  userName = "github-actions[bot]",
  userEmail = "41898282+github-actions[bot]@users.noreply.github.com",
}) {
  if (!tagName || !commitSha) {
    fail("tagName and commitSha are required");
  }
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
    fail(`expected a git commit SHA, received ${JSON.stringify(commitSha)}`);
  }

  if (fetchTags) {
    const fetched = run(gitBin, ["fetch", "origin", "--tags"]);
    if (fetched.status !== 0) {
      // Local sandboxes may not have origin; continue with local refs.
      console.log("git fetch origin --tags skipped or failed; using local tags");
    }
  }

  const existing = run(gitBin, ["rev-parse", tagName]);
  if (existing.status === 0) {
    const tagCommit = run(gitBin, ["rev-list", "-n1", tagName]);
    if (tagCommit.status !== 0) {
      fail(tagCommit.stderr.trim() || `failed to resolve ${tagName}`);
    }
    const resolved = String(tagCommit.stdout ?? "").trim();
    if (resolved !== commitSha) {
      fail(`${tagName} points to ${resolved} instead of release commit ${commitSha}`);
    }
    console.log(`${tagName} already points to the correct commit.`);
    return { created: false, verified: true, tagName, commitSha };
  }

  run(gitBin, ["config", "user.name", userName]);
  run(gitBin, ["config", "user.email", userEmail]);
  const tagged = run(gitBin, ["tag", "-a", tagName, commitSha, "-m", tagName]);
  if (tagged.status !== 0) {
    fail(tagged.stderr.trim() || tagged.stdout.trim() || `git tag ${tagName} failed`);
  }

  if (push) {
    const pushed = run(gitBin, ["push", "origin", `refs/tags/${tagName}`]);
    if (pushed.status !== 0) {
      fail(pushed.stderr.trim() || pushed.stdout.trim() || `git push ${tagName} failed`);
    }
  }

  console.log(`Created annotated tag ${tagName} at ${commitSha}`);
  return { created: true, verified: true, tagName, commitSha };
}

function main() {
  const [tagName, commitSha, ...flags] = process.argv.slice(2);
  if (!tagName || !commitSha) {
    throw new Error("Usage: node scripts/ensure-release-tag.mjs <tag> <sha> [--no-fetch] [--no-push]");
  }
  ensureReleaseTag({
    tagName,
    commitSha,
    fetchTags: !flags.includes("--no-fetch"),
    push: !flags.includes("--no-push"),
  });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
