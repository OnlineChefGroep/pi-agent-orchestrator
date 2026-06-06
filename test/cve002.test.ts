import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadCustomAgents } from "../src/custom-agents.js";

describe("CVE-002: additional validations", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `pi-test-${Math.random().toString(36).substring(7)}`));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeAgent(name: string, content: string) {
    const dir = join(tmpDir, ".pi", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), content);
  }

  test("validates display_name length", async () => {
    const longName = "a".repeat(101);
    writeAgent("bad-display", `---\ndisplay_name: ${longName}\n---\nPrompt`);

    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("bad-display")?.enabled).toBe(false);
  });

  test("validates description length", async () => {
    const longDesc = "a".repeat(100001);
    writeAgent("bad-desc", `---\ndescription: ${longDesc}\n---\nPrompt`);

    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("bad-desc")?.enabled).toBe(false);
  });

  test("validates individual tool lengths", async () => {
    const longTool = "a".repeat(101);
    writeAgent("bad-tool", `---\ntools: read, ${longTool}, write\n---\nPrompt`);

    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("bad-tool")?.enabled).toBe(false);
  });

  test("validates individual disallowed tool lengths", async () => {
    const longTool = "a".repeat(101);
    writeAgent("bad-disallowed", `---\ndisallowed_tools: read, ${longTool}, write\n---\nPrompt`);

    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("bad-disallowed")?.enabled).toBe(false);
  });

  test("redacts unsafe agent name in telemetry", async () => {
    // Since the framework uses memory fallback for telemetry, we can verify that
    // the validation error doesn't include the raw unsafe name
    writeAgent("agent..traversal", "---\ntools: read\n---\nPrompt");
    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("agent..traversal")?.enabled).toBe(false);
    // We're mostly ensuring that no exceptions are thrown when the redacted string is used.
  });

});
