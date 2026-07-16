#!/usr/bin/env node
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = new URL("../../../", import.meta.url);
const outputUrl = new URL("../public/promo-data.json", import.meta.url);
const checkOnly = process.argv.includes("--check");

const readText = async (relativePath) =>
  readFile(new URL(relativePath, root), "utf8");

const section = (markdown, heading) => {
  const lines = markdown.split("\n");
  const marker = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) {
    throw new Error(`Missing markdown section: ${heading}`);
  }

  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  return lines.slice(start + 1, next === -1 ? undefined : next).join("\n").trim();
};

const parseTable = (markdown) => {
  const rows = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));

  if (rows.length < 3) {
    throw new Error("Expected a markdown table with a header and data rows");
  }

  const [headers, separator, ...values] = rows;
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    throw new Error("Malformed markdown table separator");
  }

  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
};

const parseCapabilities = (readme) => {
  const body = section(readme, "Core capabilities");
  const capabilities = [];
  for (const line of body.split("\n")) {
    const match = /^- \*\*(.+?)\*\*\s+[—-]\s+(.+)$/.exec(line.trim());
    if (match) {
      capabilities.push({title: match[1], description: match[2]});
    }
  }
  if (capabilities.length === 0) {
    throw new Error("No core capabilities found in README.md");
  }
  return capabilities;
};

const parseArchitecture = (markdown) => {
  const systemSection = section(markdown, "// SYSTEM DIAGRAM");
  const match = /```text\s*\n([\s\S]*?)\n```/.exec(systemSection);
  if (!match) {
    throw new Error("No text architecture diagram found in docs/architecture.md");
  }
  return match[1].replace(/[ \t]+$/gm, "").trimEnd();
};

const normalizeRepository = (value) => {
  const url = typeof value === "string" ? value : value?.url;
  if (!url) return "";
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
};

const normalizeForComparison = (value) => {
  const clone = structuredClone(value);
  delete clone.generatedAt;
  return clone;
};

const packageJson = JSON.parse(await readText("package.json"));
const [readme, compressionDoc, architectureDoc] = await Promise.all([
  readText("README.md"),
  readText("docs/prompt-compression.md"),
  readText("docs/architecture.md"),
]);

const agentTypes = parseTable(section(readme, "Built-in agent types"));
const compressionLevels = parseTable(section(compressionDoc, "Levels"));
const coreCapabilities = parseCapabilities(readme);
const architectureAscii = parseArchitecture(architectureDoc);

const unscopedName = packageJson.name.split("/").at(-1) ?? packageJson.name;
const promoData = {
  version: packageJson.version,
  name: packageJson.name,
  displayName: unscopedName.replace(/-/g, " ").toUpperCase(),
  tagline: packageJson.description,
  repository: normalizeRepository(packageJson.repository),
  generatedAt: new Date().toISOString(),
  coreCapabilities,
  agentTypes,
  compressionLevels,
  architectureAscii,
};

if (agentTypes.length < 1) {
  throw new Error("Expected at least one built-in agent type");
}
if (compressionLevels.length < 1) {
  throw new Error("Expected at least one compression level");
}
if (architectureAscii.split("\n").length < 20) {
  throw new Error("Architecture diagram is unexpectedly short");
}

if (checkOnly) {
  let existing;
  try {
    existing = JSON.parse(await readFile(outputUrl, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read generated promo data: ${error instanceof Error ? error.message : String(error)}`);
  }

  const expected = JSON.stringify(normalizeForComparison(promoData));
  const actual = JSON.stringify(normalizeForComparison(existing));
  if (expected !== actual) {
    throw new Error("showcase/remotion/public/promo-data.json is stale; run npm run promo:data");
  }
  console.log("Promo data is current");
} else {
  await mkdir(dirname(fileURLToPath(outputUrl)), {recursive: true});
  await writeFile(outputUrl, `${JSON.stringify(promoData, null, 2)}\n`, "utf8");
  console.log(`Wrote ${fileURLToPath(outputUrl)}`);
}

console.log(`  - ${coreCapabilities.length} core capabilities`);
console.log(`  - ${agentTypes.length} agent types`);
console.log(`  - ${compressionLevels.length} compression levels`);
console.log(`  - architecture diagram: ${architectureAscii.split("\n").length} lines`);
