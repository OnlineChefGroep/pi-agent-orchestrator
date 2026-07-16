/**
 * Verify npm registry metadata and the downloaded tarball against the reviewed
 * release-manifest.json. Used by the OIDC publish job after publish/recovery.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

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

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export function assertPublishedMatchesManifest({ expected, published, packed }) {
  for (const field of ["name", "version", "license", "engines", "peerDependencies", "pi"]) {
    if (!sameJson(published[field], expected.package[field])) {
      fail(`Published ${field} does not match the reviewed artifact`);
    }
  }
  if (published.dist?.integrity !== expected.tarballIntegrity) {
    fail("Registry dist.integrity does not match the reviewed tarball");
  }
  if (packed?.integrity !== expected.tarballIntegrity) {
    fail("Downloaded tarball integrity does not match the reviewed tarball");
  }
  const files = new Set((packed.files ?? []).map((entry) => entry.path));
  const missing = (expected.requiredFiles ?? []).filter((path) => !files.has(path));
  if (missing.length > 0) {
    fail(`Published tarball is missing: ${missing.join(", ")}`);
  }
  return { ok: true };
}

function sleepSync(ms) {
  spawnSync(process.execPath, ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms})`], {
    stdio: "ignore",
  });
}

export function fetchPublishedMetadata(spec, { attempts = 6, delayMs = 5000, npmBin = "npm" } = {}) {
  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = run(npmBin, ["view", spec, "--json"]);
    if (result.status === 0) {
      const stdout = String(result.stdout ?? "").trim();
      if (!stdout) {
        throw new Error(`npm view ${spec} --json returned empty output`);
      }
      return JSON.parse(stdout);
    }
    lastError = String(result.stderr ?? result.stdout ?? `exit ${result.status}`).trim();
    if (attempt < attempts) sleepSync(delayMs);
  }
  throw new Error(`npm view ${spec} failed after ${attempts} attempts: ${lastError}`);
}

export function packPublishedTarball(spec, workdir, { npmBin = "npm" } = {}) {
  mkdirSync(workdir, { recursive: true });
  const result = run(npmBin, ["pack", spec, "--ignore-scripts", "--json"], { cwd: workdir });
  if (result.status !== 0) {
    throw new Error(
      String(result.stderr ?? result.stdout ?? "").trim() || `npm pack ${spec} failed`,
    );
  }
  const stdout = String(result.stdout ?? "").trim();
  if (!stdout) {
    throw new Error(`npm pack ${spec} returned empty JSON`);
  }
  const report = JSON.parse(stdout);
  if (!Array.isArray(report) || !report[0]) {
    throw new Error(`npm pack ${spec} returned invalid JSON report`);
  }
  return report[0];
}

export function verifyPublishedPackage({
  spec,
  expectedManifestPath,
  workdir = "published",
  metadataPath = "published-metadata.json",
  packReportPath = "published-pack.json",
  attempts = 6,
  delayMs = 5000,
  npmBin = "npm",
}) {
  const expected = JSON.parse(readFileSync(expectedManifestPath, "utf8"));
  const published = fetchPublishedMetadata(spec, { attempts, delayMs, npmBin });
  writeFileSync(metadataPath, `${JSON.stringify(published, null, 2)}\n`);
  const packed = packPublishedTarball(spec, workdir, { npmBin });
  writeFileSync(packReportPath, `${JSON.stringify([packed], null, 2)}\n`);
  assertPublishedMatchesManifest({ expected, published, packed });
  console.log(`Verified published ${spec} against ${expectedManifestPath}`);
  return { expected, published, packed };
}

function parseArgs(argv) {
  const args = {
    spec: null,
    expected: "release-artifact/release-manifest.json",
    workdir: "published",
    attempts: 6,
    delayMs: 5000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--spec":
        args.spec = argv[++i];
        break;
      case "--expected":
        args.expected = argv[++i];
        break;
      case "--workdir":
        args.workdir = argv[++i];
        break;
      case "--attempts":
        args.attempts = Number(argv[++i]);
        break;
      case "--delay-ms":
        args.delayMs = Number(argv[++i]);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.spec) {
    throw new Error(
      "Usage: node scripts/verify-published-package.mjs --spec <pkg@ver> [--expected release-manifest.json]",
    );
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  verifyPublishedPackage({
    spec: args.spec,
    expectedManifestPath: args.expected,
    workdir: args.workdir,
    attempts: args.attempts,
    delayMs: args.delayMs,
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
