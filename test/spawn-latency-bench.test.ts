/**
 * spawn-latency-bench.test.ts — Performance benchmarks for agent spawn latency.
 *
 * Measures the two main contributors to spawn latency:
 * 1. buildParentContext() — parent conversation serialization for inherit_context
 * 2. buildAgentPrompt() — system prompt construction (env, memory, skills, handoff)
 *
 * Combined, these represent the deferred-context build time reported as
 * "Context built after spawn" in agent-runner.ts debug logs.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildEffectivePrompt } from "../src/agent-runner.js";
import type { AgentConfig, EnvInfo } from "../src/types.js";
import { benchmarkLog } from "./helpers/benchmark-log.js";

// ── Benchmark logging ──────────────────────────────────────────────────────

// ── Conversation helpers ───────────────────────────────────────────────────

interface BranchEntry {
  type: string;
  message?: { role: string; content: string | unknown[] };
  summary?: string;
}

/**
 * Build N conversation entries with alternating user/assistant messages.
 * Each entry has ~100 chars of text to simulate realistic context size.
 */
function buildConversation(
  count: number,
  messageLen = 100,
): BranchEntry[] {
  const entries: BranchEntry[] = [];
  for (let i = 0; i < count; i++) {
    const text = "x".repeat(messageLen);
    if (i % 2 === 0) {
      entries.push({
        type: "message",
        message: { role: "user", content: text },
      });
    } else {
      entries.push({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
        },
      });
    }
  }
  return entries;
}

/**
 * Build a conversation with compaction summaries every 10 entries,
 * simulating real agent sessions that have been compacted.
 */
function buildCompactedConversation(
  messageCount: number,
  compactInterval = 10,
): BranchEntry[] {
  const entries: BranchEntry[] = [];
  for (let i = 0; i < messageCount; i++) {
    const text = "Detailed analysis and implementation of feature X with multiple steps completed successfully.";
    if (i % 2 === 0) {
      entries.push({
        type: "message",
        message: { role: "user", content: text },
      });
    } else {
      entries.push({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
        },
      });
    }
    // Insert compaction summary every `compactInterval` entries
    if (i > 0 && i % compactInterval === 0) {
      entries.push({
        type: "compaction",
        summary: `Compacted turns 1-${i}: explored codebase, implemented solution, ran tests. Key decisions recorded.`,
      });
    }
  }
  return entries;
}

/** Create a mock ExtensionContext with given branch entries. */
function mockContext(entries: BranchEntry[] | undefined): any {
  return {
    sessionManager: {
      getBranch: () => entries,
    },
  };
}

// ── Agent config helpers ───────────────────────────────────────────────────

function buildEnvInfo(overrides: Partial<EnvInfo> = {}): EnvInfo {
  return {
    platform: "linux",
    isGitRepo: true,
    branch: "main",
    hasChrome: true,
    ...overrides,
  };
}

function buildAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    description: "A test agent for benchmarking",
    systemPrompt: "You are a helpful assistant. Be concise and thorough.",
    promptMode: "replace",
    extensions: false,
    skills: false,
    ...overrides,
  } as AgentConfig;
}

// ── 1. buildParentContext — Pure Conversation Serialization ─────────────────

describe("Benchmark: buildParentContext — parent conversation serialization", () => {
  it("empty conversation under 50\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const ctx = mockContext([]);

    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 5000;

    benchmarkLog("buildParentContext empty", perCall, 0.05, "\u00b5s");
    expect(perCall).toBeLessThan(0.05); // 50\u00b5s
  });

  it("10 messages under 100\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildConversation(10);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("buildParentContext 10 messages", perCall, 0.1, "\u00b5s");
    expect(perCall).toBeLessThan(0.1); // 100\u00b5s
  });

  it("50 messages under 200\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildConversation(50);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("buildParentContext 50 messages", perCall, 0.2, "\u00b5s");
    expect(perCall).toBeLessThan(0.2); // 200\u00b5s
  });

  it("200 messages under 1ms", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildConversation(200);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 200;

    benchmarkLog("buildParentContext 200 messages", perCall, 1);
    expect(perCall).toBeLessThan(1); // 1ms
  });

  it("50 compacted entries (with compaction summaries) under 300\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildCompactedConversation(50, 10);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("buildParentContext 50 compacted", perCall, 0.3, "\u00b5s");
    expect(perCall).toBeLessThan(0.3); // 300\u00b5s
  });

  it("200 compacted entries (typical real session) under 2ms", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildCompactedConversation(200, 15);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildParentContext(ctx);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("buildParentContext 200 compacted", perCall, 2);
    expect(perCall).toBeLessThan(2); // 2ms
  });
});

// ── 2. buildAgentPrompt — System Prompt Construction ────────────────────────

describe("Benchmark: buildAgentPrompt — system prompt construction", () => {
  it("replace-mode (minimal) under 100\u00b5s", async () => {
    const { buildAgentPrompt } = await import("../src/prompts.js");
    const config = buildAgentConfig({ promptMode: "replace" });
    const env = buildEnvInfo();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      buildAgentPrompt(config, "/home/project", env);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("buildAgentPrompt replace-mode", perCall, 0.1, "\u00b5s");
    expect(perCall).toBeLessThan(0.1);
  });

  it("append-mode with parent prompt under 150\u00b5s", async () => {
    const { buildAgentPrompt } = await import("../src/prompts.js");
    const config = buildAgentConfig({ promptMode: "append" });
    const env = buildEnvInfo();
    const parentPrompt = "You are a senior developer. You have extensive experience with TypeScript, React, and Node.js. Always write clean, well-documented code.";

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      buildAgentPrompt(config, "/home/project", env, parentPrompt);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("buildAgentPrompt append-mode", perCall, 0.15, "\u00b5s");
    expect(perCall).toBeLessThan(0.15);
  });

  it("append-mode with memory block (costly extras path) under 200\u00b5s", async () => {
    const { buildAgentPrompt } = await import("../src/prompts.js");
    const config = buildAgentConfig({ promptMode: "append" });
    const env = buildEnvInfo();
    const memoryBlock = Array.from({ length: 50 }, (_, i) => `Memory line ${i + 1}: some relevant context from previous sessions.`).join("\n");

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      buildAgentPrompt(config, "/home/project", env, undefined, {
        memoryBlock,
      });
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("buildAgentPrompt append+memory", perCall, 0.2, "\u00b5s");
    expect(perCall).toBeLessThan(0.2);
  });

  it("replace-mode with handoff + skills under 300\u00b5s", async () => {
    const { buildAgentPrompt } = await import("../src/prompts.js");
    const config = buildAgentConfig({ handoff: true });
    const env = buildEnvInfo();
    const skills = [
      { name: "typescript-patterns", content: "TypeScript idioms: use strict mode, prefer interfaces over types, use generics sparingly." },
      { name: "testing", content: "Write unit tests for all business logic. Use vitest for testing. Mock external dependencies." },
    ];

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      buildAgentPrompt(config, "/home/project", env, undefined, {
        skillBlocks: skills,
      });
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("buildAgentPrompt replace+handoff+skills", perCall, 0.3, "\u00b5s");
    expect(perCall).toBeLessThan(0.3);
  });
});

// ── 3. Combined: Deferred context pipeline ────────────────────────────

describe("Benchmark: deferred context pipeline — buildEffectivePrompt", () => {
  it("no inherit (skip context) under 10\u00b5s", async () => {
    const ctx = mockContext([]);

    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      const result = buildEffectivePrompt(ctx, "do the thing", { inheritContext: false });
      if (result.length < 0) throw new Error("impossible");
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 5000;

    benchmarkLog("deferred context skip (no inherit)", perCall, 0.01, "\u00b5s");
    expect(perCall).toBeGreaterThan(0);
    expect(perCall).toBeLessThan(0.01);
  });

  it("inherit context + 10 conversation entries under 100\u00b5s", async () => {
    const entries = buildConversation(10);
    const ctx = mockContext(entries);

    // Simulate buildEffectivePrompt for inheritContext=true
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const result = buildEffectivePrompt(ctx, "do the thing", { inheritContext: true });
      if (result.length < 0) throw new Error("impossible");
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("deferred context 10 entries", perCall, 0.1, "\u00b5s");
    expect(perCall).toBeLessThan(0.1);
  });

  it("inherit context + 50 compacted entries under 300\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildCompactedConversation(50, 10);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const parentContext = buildParentContext(ctx);
      const prompt = `do the thing\n${parentContext}`;
      if (prompt.length < 0) throw new Error("impossible");
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("deferred context 50 compacted", perCall, 0.3, "\u00b5s");
    expect(perCall).toBeLessThan(0.3);
  });

  it("inherit context + 200 compacted entries under 2ms", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildCompactedConversation(200, 15);
    const ctx = mockContext(entries);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const parentContext = buildParentContext(ctx);
      const prompt = `do the thing\n${parentContext}`;
      if (prompt.length < 0) throw new Error("impossible");
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("deferred context 200 compacted", perCall, 2);
    expect(perCall).toBeLessThan(2);
  });
});

// ── 4. preloadSkills — Skill Loading Overhead ──────────────────────────

describe("Benchmark: preloadSkills — skill loading from disk", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("0 skills (empty array) under 100\u00b5s", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-0-"));
    tempDirs.push(dir);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      preloadSkills([], dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("preloadSkills 0 skills", perCall, 0.1, "\u00b5s");
    expect(perCall).toBeLessThan(0.1);
  });

  it("5 skills (not found) under 100ms (includes BFS scan of system skill dirs)", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-5m-"));
    tempDirs.push(dir);

    const names = Array.from({ length: 5 }, (_, i) => `bench-skill-missing-${i}`);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 50;

    benchmarkLog("preloadSkills 5 missing", perCall, 100);
    expect(perCall).toBeLessThan(100);
  });

  it("10 skills (not found) under 200ms (includes BFS scan)", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-10m-"));
    tempDirs.push(dir);

    const names = Array.from({ length: 10 }, (_, i) => `bench-skill-missing-${i}`);

    const start = performance.now();
    for (let i = 0; i < 30; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 30;

    benchmarkLog("preloadSkills 10 missing", perCall, 200);
    expect(perCall).toBeLessThan(200);
  });

  it("5 skills (found on disk) under 5ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-5f-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      const name = `bench-skill-found-${i}`;
      names.push(name);
      writeFileSync(join(skillsDir, `${name}.md`), `# Skill ${i}\n\nThis is content for benchmark skill ${i}.\nIt has realistic content that an agent skill would have.`);
    }

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 200;

    benchmarkLog("preloadSkills 5 found", perCall, 5);
    expect(perCall).toBeLessThan(5);
  });

  it("10 skills (found on disk) under 10ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-10f-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });
    const names: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `bench-skill-found-${i}`;
      names.push(name);
      writeFileSync(join(skillsDir, `${name}.md`), `# Skill ${i}\n\nThis is content for benchmark skill ${i}.\nIt has realistic content that an agent skill would have.\nWith multiple lines and some code examples.`);
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("preloadSkills 10 found", perCall, 10);
    expect(perCall).toBeLessThan(10);
  });

  // ── Directory-style (SKILL.md in subdir) vs flat file ─────────────────

  it("5 skills (found via directory/SKILL.md, 10 distractors) under 10ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-5d-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create 10 distractor subdirectories (no SKILL.md — BFS must descend into them)
    for (let d = 0; d < 10; d++) {
      mkdirSync(join(skillsDir, `distractor-${d}`), { recursive: true });
      // Add a nested file inside each distractor to force deeper BFS traversal
      mkdirSync(join(skillsDir, `distractor-${d}`, "nested", "deep"), { recursive: true });
      writeFileSync(
        join(skillsDir, `distractor-${d}`, "nested", "deep", "some-file.txt"),
        "irrelevant content",
      );
    }

    // Create 5 skill subdirectories, each with SKILL.md
    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      const name = `bench-dir-skill-${i}`;
      names.push(name);
      const skillDir = join(skillsDir, name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `# Directory Skill ${i}\n\nContent for benchmark directory skill ${i}.`,
      );
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("preloadSkills 5 dir-skill found", perCall, 10);
    expect(perCall).toBeLessThan(10);
  });

  it("10 skills (found via directory/SKILL.md, 20 distractors) under 20ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-10d-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    for (let d = 0; d < 20; d++) {
      mkdirSync(join(skillsDir, `distractor-${d}`), { recursive: true });
    }

    const names: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `bench-dir-skill-${i}`;
      names.push(name);
      const skillDir = join(skillsDir, name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), `# Skill ${i}\n\nContent.`);
    }

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 50;

    benchmarkLog("preloadSkills 10 dir-skill found", perCall, 20);
    expect(perCall).toBeLessThan(20);
  });

  it("5 skills missing with 50 distractor dirs (BFS worst case) under 200ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-wc-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create 50 subdirectories — none match the skill names
    for (let d = 0; d < 50; d++) {
      mkdirSync(join(skillsDir, `some-lib-v${d}`), { recursive: true });
    }

    const names = Array.from({ length: 5 }, (_, i) => `nonexistent-skill-${i}`);

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 20;

    benchmarkLog("preloadSkills 5 missing w/ 50 dirs", perCall, 200);
    expect(perCall).toBeLessThan(200);
  });

  it("deeply nested directory skill (depth 5) under 10ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-deep-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create a deeply nested path: .pi/skills/a/b/c/d/e/deep-skill/SKILL.md
    // Also add some distractor branches at each level
    for (const branch of ["a", "b", "c", "d", "e"]) {
      mkdirSync(join(skillsDir, "dev", "tools", branch), { recursive: true });
    }

    const deepPath = join(skillsDir, "dev", "tools", "a", "b", "c", "d", "e", "deep-skill");
    mkdirSync(deepPath, { recursive: true });
    writeFileSync(join(deepPath, "SKILL.md"), "# Deeply nested skill\n\nFound at depth 5.");

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      preloadSkills(["deep-skill"], dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("preloadSkills nested depth-5 found", perCall, 10);
    expect(perCall).toBeLessThan(10);
  });

  // ── Worst-case BFS ordering (distractors alphabetically FIRST) ────────

  it("5 dir-skill found REVERSED order (distractors first, 10 distractor dirs) under 25ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-5r-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    // Distractors named with 'a' prefix — alphabetically FIRST
    // Skills named with 'z' prefix — alphabetically LAST
    // BFS must scan ALL distractors before finding the matching skill
    for (let d = 0; d < 10; d++) {
      mkdirSync(join(skillsDir, `alpha-lib-${d}`), { recursive: true });
      mkdirSync(join(skillsDir, `alpha-lib-${d}`, "nested", "sub"), { recursive: true });
      writeFileSync(join(skillsDir, `alpha-lib-${d}`, "nested", "sub", "module.js"), "// distractor");
    }

    const names: string[] = [];
    for (let i = 0; i < 5; i++) {
      const name = `zeta-skill-${i}`;
      names.push(name);
      const skillDir = join(skillsDir, name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), `# Zeta Skill ${i}\n\nContent.`);
    }

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 50;

    benchmarkLog("preloadSkills 5 dir-skill reversed-order", perCall, 25);
    expect(perCall).toBeLessThan(25);
  });

  it("10 dir-skill found REVERSED order (20 distractor dirs) under 50ms", async () => {
    const { preloadSkills } = await import("../src/skill-loader.js");
    const dir = mkdtempSync(join(tmpdir(), "skill-bench-10r-"));
    tempDirs.push(dir);

    const skillsDir = join(dir, ".pi", "skills");
    mkdirSync(skillsDir, { recursive: true });

    for (let d = 0; d < 20; d++) {
      mkdirSync(join(skillsDir, `alpha-lib-${d}`), { recursive: true });
    }

    const names: string[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `zeta-skill-${i}`;
      names.push(name);
      const skillDir = join(skillsDir, name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), `# Zeta Skill ${i}\n\nContent.`);
    }

    const start = performance.now();
    for (let i = 0; i < 25; i++) {
      preloadSkills(names, dir);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 25;

    benchmarkLog("preloadSkills 10 dir-skill reversed-order", perCall, 50);
    expect(perCall).toBeLessThan(50);
  });
});
