import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadCustomAgents } from "../src/custom-agents.js";
import { onTelemetry } from "../src/telemetry.js";

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


  test("redacts overlong agent names and content in telemetry", async () => {
    const longName = "a".repeat(150);
    writeAgent("agent..traversal", `---
description: valid
---
Prompt`);
    writeAgent(longName, `---
description: valid
---
Prompt`);

    let loggedName = "";
    let loggedError = "";

    const unsub = onTelemetry("agent:validation-failed", (payload) => {
      if (payload.errors.some(e => e.includes("[REDACTED]"))) {
         loggedError = payload.errors.find(e => e.includes("[REDACTED]"));
      }
      if (payload.name && payload.name.length === 100 && payload.name.includes('a')) {
         loggedName = payload.name;
      }
    });

    try {
      await loadCustomAgents(tmpDir);
      expect(loggedName).toBe("a".repeat(100));
      expect(loggedError).toBe("Agent name contains unsafe characters: [REDACTED]");
    } finally {
      unsub();
    }
  });

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

  test("validates individual tool lengths and redacts telemetry", async () => {
    const longTool = "a".repeat(101);
    writeAgent("bad-tool", `---\ntools: read, ${longTool}, write\n---\nPrompt`);

    let loggedTools = [];
    const unsub = onTelemetry("agent:unknown-tools", (payload) => {
        if (payload.name === "bad-tool") {
            loggedTools = payload.tools;
        }
    });

    try {
        const agents = await loadCustomAgents(tmpDir);
        expect(agents.get("bad-tool")?.enabled).toBe(false);
        expect(loggedTools.length).toBeGreaterThan(0);
        expect(loggedTools[0].length).toBeLessThanOrEqual(53); // 50 + "..."
    } finally {
        unsub();
    }
  });

  test("validates individual disallowed tool lengths", async () => {
    const longTool = "a".repeat(101);
    writeAgent("bad-disallowed", `---\ndisallowed_tools: read, ${longTool}, write\n---\nPrompt`);

    const agents = await loadCustomAgents(tmpDir);
    expect(agents.get("bad-disallowed")?.enabled).toBe(false);
  });
});
