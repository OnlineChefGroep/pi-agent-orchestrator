import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => join(process.env.HOME ?? tmpdir(), ".pi", "agent"),
  parseFrontmatter: (content: string) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    const frontmatter: Record<string, unknown> = {};
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return { frontmatter, body: match[2] };
  },
}));

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

    for (let i = 0; i < 200; i++) {
      writeFileSync(
        join(agentsDir, `agent-${i}.md`),
        `---
display_name: Agent ${i}
description: A benchmark agent
tools: none
---
System prompt for agent ${i}`,
      );
    }
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads many agents under the async I/O budget", async () => {
    const start = performance.now();
    const agents = await loadCustomAgents(tmpDir);
    const elapsed = performance.now() - start;
    expect(agents.size).toBe(200);
    expect(elapsed).toBeLessThan(1500);
  });
});
