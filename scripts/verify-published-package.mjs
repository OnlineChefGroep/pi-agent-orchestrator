import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REQUIRED_PACKAGE_FILES } from "./package-resource-contract.mjs";

const PACKAGE_NAME = "@onlinechefgroep/pi-agent-orchestrator";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

function fail(message) {
  throw new Error(`Published package verification failed: ${message}`);
}

function canonicalJson(value) {
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

function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function npmJson(args, options = {}) {
  const output = execFileSync(npmExecutable, [...args, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return JSON.parse(output);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPublishedMetadata(spec) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return npmJson(["view", spec]);
    } catch (error) {
      lastError = error;
      if (attempt < 6) await sleep(5000);
    }
  }
  throw lastError;
}

async function verify(version) {
  if (!/^0\.18\.\d+$/.test(version)) fail(`expected a stable 0.18.x version, received ${version}`);
  const spec = `${PACKAGE_NAME}@${version}`;
  const localPackage = JSON.parse(
    execFileSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./package.json')))"] , {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const published = await readPublishedMetadata(spec);

  if (published.name !== PACKAGE_NAME || published.version !== version) {
    fail(`registry returned ${published.name}@${published.version} for ${spec}`);
  }
  for (const field of ["license", "engines", "peerDependencies", "pi"]) {
    if (!sameJson(published[field], localPackage[field])) {
      fail(`published ${field} does not match the reviewed source package`);
    }
  }
  if (typeof published.dist?.integrity !== "string" || published.dist.integrity.length < 20) {
    fail("registry metadata is missing dist.integrity");
  }

  const directory = mkdtempSync(join(tmpdir(), "pi-published-package-"));
  try {
    const report = npmJson(["pack", spec, "--ignore-scripts"], { cwd: directory });
    const packed = Array.isArray(report) ? report[0] : undefined;
    if (!packed || !Array.isArray(packed.files)) fail("npm pack did not return a file manifest");
    const files = new Set(packed.files.map((entry) => entry.path));
    const missing = REQUIRED_PACKAGE_FILES.filter((path) => !files.has(path));
    if (missing.length > 0) fail(`published tarball is missing: ${missing.join(", ")}`);
    if (typeof packed.integrity !== "string" || packed.integrity !== published.dist.integrity) {
      fail("downloaded tarball integrity does not match npm registry metadata");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }

  console.log(`Published package verified: ${spec}`);
}

const version = process.argv[2];
verify(version).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
