/**
 * Build the immutable release-manifest.json consumed by the OIDC publish job.
 * Invoked after `npm pack --ignore-scripts --json`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { REQUIRED_PACKAGE_FILES } from "./package-resource-contract.mjs";

export async function writeReleaseManifest({
  packageJsonPath = "package.json",
  packReportPath,
  manifestPath = "release-manifest.json",
}) {
  if (!packReportPath) {
    throw new Error("packReportPath is required");
  }

  const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const [packed] = JSON.parse(await readFile(packReportPath, "utf8"));
  if (!packed?.filename || !packed?.integrity) {
    throw new Error("npm pack did not return a filename and integrity");
  }

  const manifest = {
    package: {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      engines: pkg.engines,
      peerDependencies: pkg.peerDependencies,
      pi: pkg.pi,
    },
    requiredFiles: REQUIRED_PACKAGE_FILES,
    tarballFile: packed.filename,
    tarballIntegrity: packed.integrity,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const [packReportPath, manifestPath = "release-manifest.json"] = process.argv.slice(2);
  if (!packReportPath) {
    throw new Error(
      "Usage: node scripts/write-release-manifest.mjs <release-pack.json> [release-manifest.json]",
    );
  }
  const manifest = await writeReleaseManifest({ packReportPath, manifestPath });
  console.log(`Wrote ${manifestPath} for ${manifest.package.name}@${manifest.package.version}`);
  console.log(`tarballFile=${manifest.tarballFile}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
