import { readFile } from "node:fs/promises";
import { REQUIRED_PACKAGE_FILES } from "./package-resource-contract.mjs";

const reportPath = process.argv[2];
if (!reportPath) {
  throw new Error("Usage: node scripts/verify-npm-pack.mjs <npm-pack-report.json>");
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
if (!Array.isArray(report) || !report[0] || !Array.isArray(report[0].files)) {
  throw new Error("Invalid npm pack JSON report");
}

const packedFiles = new Set(report[0].files.map((entry) => entry.path));
const missing = REQUIRED_PACKAGE_FILES.filter((path) => !packedFiles.has(path));
if (missing.length > 0) {
  throw new Error(`npm package is missing: ${missing.join(", ")}`);
}

console.log(`npm package contains all ${REQUIRED_PACKAGE_FILES.length} required files`);
