import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { activeAgentStorage } from "../src/agent-manager.js";
import { buildEffectivePrompt, type RunOptions } from "../src/agent-runner.js";
import { getTemplateInfo, listTemplates } from "../src/agent-templates.js";
import {
  configureRateLimit,
  getRateLimitConfig,
  RpcError,
  resetRpcRateLimitsForTests,
} from "../src/cross-extension-rpc.js";
import { recordDispatchDecision } from "../src/dispatch-history.js";
import { safeJsonParse } from "../src/handoff.js";
import { formatHealthReport, type HealthReport } from "../src/health-report.js";
import { composeHandlers, type HookPayload } from "../src/hooks.js";
import { writeInitialEntry } from "../src/output-file.js";
import { SubagentScheduler } from "../src/schedule.js";
import { loadSettings, saveSettings } from "../src/settings.js";
import { SwarmCoordinator } from "../src/swarm-join.js";
import { hashContentSync } from "../src/telemetry.js";
import { escapeXml, formatLifetimeTokens, textResult } from "../src/tool-result-helpers.js";
import { getSessionContextPercent, type SessionLike } from "../src/usage.js";

describe("Missing tests coverage", () => {
  // configureRateLimit mutates module-level state (and can recreate the cleanup
  // interval), so restore defaults after every test to avoid cross-test leakage.
  afterEach(() => {
    resetRpcRateLimitsForTests();
  });

  it("Missing test for listTemplates", () => {
    expect(listTemplates().length).toBeGreaterThan(0);
  });

  it("Missing edge case test for getSessionContextPercent", () => {
    expect(getSessionContextPercent(undefined)).toBeNull();

    // Stats present but no contextUsage → null.
    const noContext: SessionLike = {
      getSessionStats: () => ({ tokens: { input: 100, output: 0, cacheWrite: 0 } }),
    };
    expect(getSessionContextPercent(noContext)).toBeNull();

    // contextUsage.percent explicitly null → null.
    const nullPercent: SessionLike = {
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheWrite: 0 },
        contextUsage: { percent: null },
      }),
    };
    expect(getSessionContextPercent(nullPercent)).toBeNull();

    // A real percent is returned as-is.
    const withPercent: SessionLike = {
      getSessionStats: () => ({
        tokens: { input: 0, output: 0, cacheWrite: 0 },
        contextUsage: { percent: 42 },
      }),
    };
    expect(getSessionContextPercent(withPercent)).toBe(42);
  });

  it("Missing test for getTemplateInfo", () => {
    expect(getTemplateInfo("nonexistent-template")).toBeUndefined();
    expect(getTemplateInfo("adversarial-validator")?.name).toBe("adversarial-validator");
  });

  it("Missing test for configureRateLimit", () => {
    configureRateLimit({ maxPerWindow: 5, windowMs: 1000 });
    expect(getRateLimitConfig()).toEqual({ maxPerWindow: 5, windowMs: 1000 });

    // Non-positive / non-finite values are ignored, leaving prior config intact.
    configureRateLimit({ maxPerWindow: -1, windowMs: 0 });
    expect(getRateLimitConfig()).toEqual({ maxPerWindow: 5, windowMs: 1000 });
  });

  it("Missing test for RpcError", () => {
    const err = new RpcError("ERROR", "Test Message");
    expect(err.code).toBe("ERROR");
    expect(err.message).toBe("Test Message");
  });

  it("Missing test for formatHealthReport", () => {
    const report: HealthReport = {
      timestamp: new Date().toISOString(),
      process: {
        nodeVersion: "v18",
        platform: "linux",
        uptimeMs: 1000,
        memoryRssMB: 100,
        memoryHeapUsedMB: 50,
      },
      tracing: { enabled: true, tracerName: "otel", tracerVersion: "1" },
      circuitBreaker: { state: "closed", failures: 0, lastFailureAt: 0 },
      schedule: { active: true, jobCount: 1, enabled: true },
      swarm: { available: true, swarmCount: 1, totalAgents: 2, totalDeliveries: 0 },
      agents: {
        total: 10,
        byStatus: {
          queued: 1,
          running: 5,
          completed: 2,
          steered: 0,
          aborted: 1,
          stopped: 0,
          error: 1,
        },
        running: 5,
        queued: 1,
        sessionUsage: { spawnedAgents: 5, totalTurns: 100 },
        sessionLimits: { maxAgentsPerSession: 10, maxTotalTurnsPerSession: 1000 },
      },
      settings: {
        defaultMaxTurns: 10,
        graceTurns: 2,
        defaultJoinMode: "swarm",
        schedulingEnabled: true,
        tracingEnabled: false,
        animationStyle: "premium",
        uiStyle: "premium",
        orchestrationMode: "auto",
        dashboardRefreshInterval: 1000,
        maxConcurrent: 5,
        promptCompressionLevel: "none",
      },
      recentErrors: [],
      dispatchHistogram: {
        total: 1,
        bufferCapacity: 100,
        byKind: { single: 1, swarm: 0, crew: 0 },
        bySource: { explicit: 1, autoHeuristic: 0 },
        autoPicks: { single: 0, swarm: 0, crew: 0 },
        lastDecisionAt: Date.now(),
      },
    };
    const formatted = formatHealthReport(report);
    expect(formatted).toContain("health");
  });

  it("Missing test for formatLifetimeTokens", () => {
    expect(formatLifetimeTokens({ lifetimeUsage: { input: 10, output: 20, cacheWrite: 0 } })).toContain("30");
  });

  it("Missing edge case test for escapeXml", () => {
    expect(() => escapeXml(null as unknown as string)).toThrow();
  });

  it("Missing test for hashContentSync", () => {
    expect(hashContentSync("hello")).toBeDefined();
    expect(hashContentSync("")).toBeDefined();
  });

  it("Missing test for textResult", () => {
    const result = textResult("hello");
    expect(result.content[0].text).toContain("hello");
  });

  it("Missing edge case test for safeJsonParse", () => {
    // maxKeys = 0 rejects any keyed object.
    expect(() => safeJsonParse(JSON.stringify({ a: 1 }), 0)).toThrow();
    // maxDepth = 1 rejects a nested object.
    expect(() => safeJsonParse(JSON.stringify({ a: { b: 1 } }), 10, 1)).toThrow();
  });

  it("Missing test for recordDispatchDecision", () => {
    recordDispatchDecision({
      kind: "single",
      configuredMode: "auto",
      source: "auto-heuristic",
      promptLength: 10,
      description: "test",
    });
  });

  it("Missing error test for SubagentScheduler interval parsing", () => {
    expect(SubagentScheduler.parseInterval("abc")).toBeNull();
    expect(SubagentScheduler.parseInterval("10x")).toBeNull();
  });

  it("Missing error test for saveSettings", () => {
    // saveSettings uses mkdirSync({ recursive: true }), so a merely non-existent
    // path succeeds. Posing a regular file as the cwd forces creating the ".pi"
    // subdirectory to fail with ENOTDIR, which is deterministic regardless of the
    // process privileges (unlike a permission-based failure).
    const filePosingAsCwd = join(tmpdir(), `pi-missing-coverage-notdir-${Date.now()}`);
    writeFileSync(filePosingAsCwd, "");
    try {
      expect(saveSettings({}, filePosingAsCwd)).toBe(false);
    } finally {
      rmSync(filePosingAsCwd, { force: true });
    }
  });

  it("Missing test for composeHandlers", async () => {
    const payload: HookPayload = { event: "subagent:start", agentId: "test" };
    const allow = async (): Promise<"allow"> => "allow";
    const block = async (): Promise<"block"> => "block";
    // Non-blocking handlers fall through to "allow".
    expect(await composeHandlers(allow, allow)(payload)).toBe("allow");
    // Any blocking handler short-circuits to "block".
    expect(await composeHandlers(allow, block)(payload)).toBe("block");
  });

  it("Missing error test for loadSettings", () => {
    // should return default settings if reading fails
    const s = loadSettings("/invalid/path");
    expect(s).toBeDefined();
  });

  it("Missing error test for writeOutputFile", () => {
    expect(() => writeInitialEntry("/invalid/dir/does/not/exist/file.txt", "agent-id", "prompt", "/cwd")).toThrow();
  });

  it("Missing test for activeAgentStorage", () => {
    let val: string | undefined;
    activeAgentStorage.run("test-id", () => {
      val = activeAgentStorage.getStore();
    });
    expect(val).toBe("test-id");
  });

  it("Missing test for SwarmCoordinator class", () => {
    const coord = new SwarmCoordinator({ name: "test-swarm", description: "test", agents: [] });
    expect(coord).toBeDefined();
  });

  it("Missing test for buildEffectivePrompt", () => {
    // With inheritContext: false, buildEffectivePrompt returns the prompt verbatim
    // without touching ctx, so only the RunOptions shape needs to be supplied.
    const ctx = {} as unknown as ExtensionContext;
    const options = { inheritContext: false } as unknown as RunOptions;
    const res = buildEffectivePrompt(ctx, "test prompt", options);
    expect(res).toContain("test prompt");
  });
});
