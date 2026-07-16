import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCustomAgents } from "../src/custom-agents.js";

describe("Performance: loadCustomAgents", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-bench-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;

    const agentsDir = join(tmpDir, ".pi", "agents");
    mkdirSync(agentsDir, { recursive: true });

    // Create 1000 agent files to make the benchmark measurable
    for (let i = 0; i < 1000; i++) {
      writeFileSync(join(agentsDir, `agent-${i}.md`), `---
display_name: Agent ${i}
description: A benchmark agent
tools: none
model: default
thinking: disabled
---
System prompt for agent ${i}`);
    }
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads 1000 agents", async () => {
    const start = performance.now();
    await loadCustomAgents(tmpDir);
    const end = performance.now();
    const elapsed = end - start;
    console.log(`[BENCHMARK] loadCustomAgents 1000 files: ${elapsed.toFixed(4)}ms`);
    expect(elapsed).toBeLessThan(1500);
  });
});
