/**
 * spawn-latency-e2e-bench.test.ts — End-to-end spawn latency benchmark.
 *
 * Measures the full time from `runAgent()` start to first token (message_start).
 * Uses the same mock patterns as agent-runner.test.ts to create a realistic
 * agent pipeline without requiring a real model API call.
 *
 * Metrics captured:
 * - latencyToFirstTokenMs: time from runAgent() start to first message_start event
 * - totalDurationMs: time from runAgent() start to completion
 * - contextBuiltAt delta: time from spawnedAt to deferred context built
 *
 * The spawn pipeline includes:
 *   config resolution → tool setup → system prompt → model resolution →
 *   session creation → deferred context build → session.prompt() → first token
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Hoisted mocks — must be before any vi.mock() calls
// ============================================================================

const {
  createAgentSession,
  defaultResourceLoaderCtor,
  getAgentDir,
  sessionManagerInMemory,
  settingsManagerCreate,
} = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  defaultResourceLoaderCtor: vi.fn(),
  getAgentDir: vi.fn(() => "/mock/agent-dir"),
  sessionManagerInMemory: vi.fn(() => ({ kind: "memory-session-manager" })),
  settingsManagerCreate: vi.fn(() => ({ kind: "settings-manager" })),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession,
  DefaultResourceLoader: class {
    constructor(options: any) {
      defaultResourceLoaderCtor(options);
    }
    async reload() {}
  },
  getAgentDir,
  SessionManager: { inMemory: sessionManagerInMemory },
  SettingsManager: { create: settingsManagerCreate },
}));

vi.mock("../src/agent-types.js", () => ({
  getConfig: vi.fn(() => ({
    displayName: "Explore",
    description: "Explore",
    builtinToolNames: ["read", "write", "edit", "bash", "grep", "glob", "find"],
    extensions: false,
    skills: false,
    promptMode: "replace",
  })),
  getAgentConfig: vi.fn(() => ({
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read", "write", "edit", "bash", "grep", "glob", "find"],
    extensions: false,
    skills: false,
    systemPrompt: "You are a helpful agent.",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
  })),
  getMemoryToolNames: vi.fn(() => []),
  getReadOnlyMemoryToolNames: vi.fn(() => []),
  getToolNamesForType: vi.fn(() => ["read", "write", "edit", "bash", "grep", "glob", "find"]),
}));

vi.mock("../src/env.js", () => ({
  detectEnv: vi.fn(async () => ({ isGitRepo: true, branch: "main", platform: "linux", hasChrome: true })),
}));

vi.mock("../src/prompts.js", () => ({
  buildAgentPrompt: vi.fn(() => "system prompt from mock"),
}));

vi.mock("../src/memory.js", () => ({
  buildMemoryBlock: vi.fn(() => ""),
  buildReadOnlyMemoryBlock: vi.fn(() => ""),
}));

vi.mock("../src/skill-loader.js", () => ({
  preloadSkills: vi.fn(() => []),
}));

// NOTE: context.js is intentionally NOT mocked so buildParentContext uses
// the real implementation. This correctly measures conversation serialization
// cost, which is the dominant part of deferred context build time.

// ============================================================================
// Helpers
// ============================================================================

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
  const measuredStr = `${measured.toFixed(3)}${unit}`;
  const thresholdStr = `${threshold.toFixed(3)}${unit}`;
  process.stdout.write(
    `[BENCHMARK] ${label} ${measuredStr}/${thresholdStr} ${pct.toFixed(0)}% ${status}\n`,
  );
}

function createSession() {
  const listeners: Array<(event: any) => void> = [];
  const session = {
    messages: [] as any[],
    subscribe: vi.fn((listener: (event: any) => void) => {
      listeners.push(listener);
      return () => {};
    }),
    prompt: vi.fn(async () => {
      // Fire events synchronously — same pattern as agent-runner.test.ts
      for (const l of listeners) l({ type: "message_start" });
      for (const l of listeners) l({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello!" } });
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "Hello!" }] });
      for (const l of listeners) l({ type: "turn_end" });
    }),
    abort: vi.fn(),
    steer: vi.fn(),
    getActiveToolNames: vi.fn(() => ["read", "write"]),
    setActiveToolsByName: vi.fn(),
    setSessionName: vi.fn(),
    bindExtensions: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  return { session, listeners };
}

/** Build a mock ExtensionContext with optional parent conversation size. */
function buildCtx(parentContextSize = 0): any {
  const entries: any[] = [];
  for (let i = 0; i < parentContextSize; i++) {
    entries.push({
      type: "message",
      message: {
        role: i % 2 === 0 ? "user" : "assistant",
        content: [{ type: "text", text: `Message ${i}: some conversation content for the parent session.` }],
      },
    });
  }
  return {
    cwd: "/tmp",
    model: { provider: "test", id: "test-model" },
    modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
    getSystemPrompt: vi.fn(() => "parent system prompt"),
    sessionManager: { getBranch: vi.fn(() => entries) },
  };
}

// ============================================================================
// Benchmark tests
// ============================================================================

describe("Benchmark: spawn latency — minimal (no inherit, no context)", () => {
  let runAgent: typeof import("../src/agent-runner.js").runAgent;

  beforeEach(async () => {
    vi.clearAllMocks();
    createAgentSession.mockReset();
    const mod = await import("../src/agent-runner.js");
    runAgent = mod.runAgent;
  });

  it("no-inherit spawn latency under 50ms (setup overhead only)", async () => {
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    const ctx = buildCtx(0);
    const pi = {} as any;

    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const result = await runAgent(ctx, "Explore", "Hello!", { pi });
      const elapsed = performance.now() - start;
      runs.push(result.metrics.latencyToFirstTokenMs ?? elapsed);
    }
    const median = [...runs].sort((a, b) => a - b)[2];

    benchmarkLog("spawn-latency no-inherit", median, 50);
    expect(median).toBeLessThan(50);
  });

  it("records latencyToFirstTokenMs in RunMetrics and fires agent:spawned telemetry", async () => {
    const { onTelemetry } = await import("../src/telemetry.js");
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    const ctx = buildCtx(0);
    const pi = {} as any;

    // Register telemetry handler to capture agent:spawned events
    let telemetryPayload: any = null;
    let telemetryTimestamp = 0;
    const unsubscribe = onTelemetry("agent:spawned", (payload) => {
      telemetryPayload = payload;
      telemetryTimestamp = performance.now();
    });

    try {
      const result = await runAgent(ctx, "Explore", "Hello!", { pi });

      expect(result.metrics).toBeDefined();
      // Mocked pipeline can finish in <1ms; Date.now() precision yields 0 for durations
      expect(result.metrics.latencyToFirstTokenMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.turns).toBeGreaterThan(0);

      // Verify telemetry was emitted
      expect(telemetryPayload).not.toBeNull();
      expect(telemetryPayload.type).toBe("Explore");
      expect(telemetryPayload.depth).toBe(0);

      // Telemetry → first token latency should be near-instant with mocks
      const telemetryToFirstToken = result.metrics.latencyToFirstTokenMs!;
      benchmarkLog("telemetry-to-first-token", telemetryToFirstToken, 50);
    } finally {
      unsubscribe();
    }
  });
});

describe("Benchmark: spawn latency — with inheritContext", () => {
  let runAgent: typeof import("../src/agent-runner.js").runAgent;

  beforeEach(async () => {
    vi.clearAllMocks();
    createAgentSession.mockReset();
    const mod = await import("../src/agent-runner.js");
    runAgent = mod.runAgent;
  });

  it("inherit-context with 10 parent messages under 50ms", async () => {
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    const ctx = buildCtx(10);
    const pi = {} as any;

    const result = await runAgent(ctx, "Explore", "Hello!", {
      pi,
      inheritContext: true,
    });

    const latency = result.metrics.latencyToFirstTokenMs!;
    benchmarkLog("spawn-latency inherit 10", latency, 50);
    expect(latency).toBeLessThan(50);
  });

  it("inherit-context with 50 parent messages under 60ms", async () => {
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    const ctx = buildCtx(50);
    const pi = {} as any;

    const result = await runAgent(ctx, "Explore", "Hello!", {
      pi,
      inheritContext: true,
    });

    const latency = result.metrics.latencyToFirstTokenMs!;
    benchmarkLog("spawn-latency inherit 50", latency, 60);
    expect(latency).toBeLessThan(60);
  });
});

describe("Benchmark: spawn latency — agent-manager pipeline", () => {
  let AgentManager: typeof import("../src/agent-manager.js").AgentManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    createAgentSession.mockReset();
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    const mod = await import("../src/agent-manager.js");
    AgentManager = mod.AgentManager;
  });

  /**
   * Simulate a foreground spawn via AgentManager, which includes the
   * overhead of: record creation → worktree check → permission inheritance
   * → runAgent() pipeline → first token.
   */
  it("full AgentManager foreground spawn under 100ms", async () => {
    const manager = new AgentManager();
    const ctx = buildCtx(0);
    const pi = {} as any;

    const start = performance.now();
    const _record = await manager.spawnAndWait(pi, ctx, "Explore", "Hello!", {
      description: "benchmark spawn",
      inheritContext: false,
    });
    const elapsed = performance.now() - start;

    benchmarkLog("spawn-manager foreground", elapsed, 100);
    expect(elapsed).toBeLessThan(100);
  });
});
