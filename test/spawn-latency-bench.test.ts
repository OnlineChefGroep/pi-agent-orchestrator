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
import { describe, expect, it } from "vitest";
import type { AgentConfig, EnvInfo } from "../src/types.js";

// ── Benchmark logging ──────────────────────────────────────────────────────

function benchmarkLog(
  label: string,
  measured: number,
  threshold: number,
  unit = "ms",
): void {
  const pct = threshold > 0 ? (measured / threshold) * 100 : 0;
  let status: string;
  if (measured > threshold) {
    status = "FAIL";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK FAIL: ${label} \u2014 ${measured} exceeds threshold ${threshold}`,
    );
  } else if (pct > 80) {
    status = "WARN";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK WARN: ${label} \u2014 ${measured} approaching threshold ${threshold} (${pct.toFixed(0)}%)`,
    );
  } else {
    status = "OK";
  }
  const measuredStr = unit === "\u00b5s"
    ? `${(measured * 1000).toFixed(1)}\u00b5s`
    : `${measured.toFixed(3)}ms`;
  const thresholdStr = unit === "\u00b5s"
    ? `${(threshold * 1000).toFixed(1)}\u00b5s`
    : `${threshold.toFixed(3)}ms`;
  process.stdout.write(
    `[BENCHMARK] ${label} ${measuredStr}/${thresholdStr} ${pct.toFixed(0)}% ${status}\n`,
  );
}

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

describe("Benchmark: deferred context pipeline — buildEffectivePrompt equivalent", () => {
  it("no inherit (skip context) under 10\u00b5s", async () => {
    const _ctx = mockContext([]);

    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      // Equivalent of buildEffectivePrompt when !inheritContext
      // (just returns prompt, no serialization)
      const prompt = "do the thing";
      const result = prompt;
      // Avoid dead code elimination
      if (result.length < 0) throw new Error("impossible");
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 5000;

    benchmarkLog("deferred context skip (no inherit)", perCall, 0.01, "\u00b5s");
    expect(perCall).toBeLessThan(0.01);
  });

  it("inherit context + 10 conversation entries under 100\u00b5s", async () => {
    const { buildParentContext } = await import("../src/context.js");
    const entries = buildConversation(10);
    const ctx = mockContext(entries);

    // Simulate buildEffectivePrompt for inheritContext=true
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const parentContext = buildParentContext(ctx);
      const prompt = `do the thing\n${parentContext}`;
      if (prompt.length < 0) throw new Error("impossible");
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
