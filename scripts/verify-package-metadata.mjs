import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Package metadata check failed: ${message}`);
  }
}

assert(packageJson.name === "@onlinechefgroep/pi-agent-orchestrator", "unexpected package name");
assert(packageJson.license === "MIT", "license must remain explicit");
assert(packageJson.publishConfig?.access === "public", "scoped package must publish publicly");
assert(packageJson.keywords?.includes("pi-package"), "missing pi-package discovery keyword");
assert(packageJson.keywords?.includes("pi-coding-agent"), "missing exact Pi search keyword");
assert(packageJson.description?.length >= 80, "description is too weak for catalog discovery");
assert(packageJson.description?.length <= 180, "description is too long for catalog cards");

const repositoryUrl = packageJson.repository?.url ?? "";
assert(
  repositoryUrl === "git+https://github.com/OnlineChefGroep/pi-agent-orchestrator.git",
  "repository must point at the public canonical repository",
);

const extensions = packageJson.pi?.extensions;
assert(Array.isArray(extensions) && extensions.length > 0, "pi.extensions must not be empty");
assert(extensions.includes("./dist/index.js"), "compiled extension entrypoint is not declared");
assert(packageJson.files?.includes("dist/"), "dist/ is excluded from the npm tarball");

const preview = packageJson.pi?.video;
assert(typeof preview === "string", "Pi gallery video is missing");
const previewUrl = new URL(preview);
assert(previewUrl.protocol === "https:", "Pi gallery video must use HTTPS");
assert(previewUrl.pathname.endsWith(".mp4"), "Pi gallery video must be an MP4");

for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
  assert(
    !dependencyName.startsWith("@earendil-works/pi-"),
    `${dependencyName} must be a peer dependency, not a runtime dependency`,
  );
}

console.log(
  `Package metadata ready: ${packageJson.name}@${packageJson.version} with Pi gallery video`,
);
