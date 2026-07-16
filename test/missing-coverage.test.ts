import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeAgentStorage } from "../src/agent-manager.js";
import { buildEffectivePrompt } from "../src/agent-runner.js";
import { getTemplateInfo, listTemplates } from "../src/agent-templates.js";
import { configureRateLimit, RpcError } from "../src/cross-extension-rpc.js";
import { recordDispatchDecision } from "../src/dispatch-history.js";
import { safeJsonParse } from "../src/handoff.js";
import { formatHealthReport, type HealthReport } from "../src/health-report.js";
import { composeHandlers } from "../src/hooks.js";
import { writeInitialEntry } from "../src/output-file.js";
import { SubagentScheduler } from "../src/schedule.js";
import { loadSettings, saveSettings } from "../src/settings.js";
import { SwarmCoordinator } from "../src/swarm-join.js";
import { hashContentSync } from "../src/telemetry.js";
import { escapeXml, formatLifetimeTokens, textResult } from "../src/tool-result-helpers.js";
import { getSessionContextPercent } from "../src/usage.js";

describe("Missing tests coverage", () => {

  it("Missing test for listTemplates", () => {
     expect(listTemplates().length).toBeGreaterThan(0);
  });

  it("Missing edge case test for getSessionContextPercent", () => {
    // Edge cases might include undefined session, or session with no model window
    expect(getSessionContextPercent(undefined)).toBeNull();
    expect(getSessionContextPercent({} as any)).toBeNull();
    // mock an object that doesn't provide maxModelWindow or it's zero
    expect(getSessionContextPercent({ getConversationStats: () => ({ modelWindowTokens: 0, currentTokens: 100 }) } as any)).toBeNull();
  });

  it("Missing test for getTemplateInfo", () => {
    expect(getTemplateInfo("nonexistent-template")).toBeUndefined();
    expect(getTemplateInfo("adversarial-validator")?.name).toBe("adversarial-validator");
  });

  it("Missing test for configureRateLimit", () => {
    configureRateLimit({ maxPerWindow: -1, windowMs: 1000 });
  });

  it("Missing test for RpcError", () => {
    const err = new RpcError("TEST_CODE" as any, "Test Message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Test Message");
  });

  it("Missing test for formatHealthReport", () => {
    const report: HealthReport = {
      status: "healthy",
      startupTimeMs: 10,
      uptimeMs: 100,
      process: { nodeVersion: "v18", platform: "linux", uptimeMs: 1000 },
      memoryUsage: { rss: 1000, heapTotal: 500, heapUsed: 250, external: 10, arrayBuffers: 10 },
      activeAgents: 1,
      totalAgentsCreated: 5,
      errors: [],
      schedules: { total: 0, active: 0, nextRun: null },
      swarm: { available: true, swarmCount: 1, dynamicAgents: 2, cachedTemplates: 3 },
      tracing: { enabled: true, tracerName: "otel", tracerVersion: "1" },
      circuitBreaker: { state: "closed", failures: 0, lastFailureAt: 0 },
      schedule: { enabled: true, active: true, jobCount: 1 },
      agents: {
        total: 10, running: 5, queued: 1, aborted: 1, failed: 1, completed: 2,
        byStatus: { running: 5, queued: 1, aborted: 1, error: 1, completed: 2 } as any,
        sessionUsage: { spawnedAgents: 5, cumulativeDurationMs: 100 },
        sessionLimits: { maxAgentsPerSession: 10, maxDurationMsPerSession: 1000 }
      },
      settings: {
        maxConcurrent: 5,
        defaultMaxTurns: 10,
        graceTurns: 2,
        interactiveMode: true,
        schedulerEnabled: true,
        enableTracing: false
      },
      recentErrors: [],
      dispatchHistogram: {
        total: 1, bufferCapacity: 100,
        byKind: { single: 1, swarm: 0, crew: 0 },
        bySource: { explicit: 1, "auto-heuristic": 0 },
        autoPicks: { single: 0, swarm: 0, crew: 0 },
        lastDecisionAt: Date.now()
      }
    } as any;
    const formatted = formatHealthReport(report);
    expect(formatted).toContain("health");
  });

  it("Missing test for formatLifetimeTokens", () => {
    expect(formatLifetimeTokens({ lifetimeUsage: { prompt: 10, completion: 20, total: 30, input: 10, output: 20, cacheWrite: 0 } } as any)).toContain("30");
  });

  it("Missing edge case test for escapeXml", () => {
    expect(() => escapeXml(null as any)).toThrow();
  });

  it("Missing test for hashContentSync", () => {
    expect(hashContentSync("hello")).toBeDefined();
    expect(hashContentSync("")).toBeDefined();
  });

  it("Missing test for textResult", () => {
    const result = textResult("hello", { status: "running" } as any);
    expect(result.content[0].text).toContain("hello");
  });

  it("Missing edge case test for safeJsonParse", () => {
    expect(() => safeJsonParse('{"a":1}', 0)).toThrow(); // maxKeys = 0
    expect(() => safeJsonParse('{"a":{"b":1}}', 10, 1)).toThrow(); // maxDepth = 1
  });

  it("Missing test for recordDispatchDecision", () => {
    recordDispatchDecision({ kind: "single", configuredMode: "auto", source: "auto-heuristic", promptLength: 10, description: "test" });
  });

  it("Missing error test for SubagentScheduler interval parsing", () => {
    expect(SubagentScheduler.parseInterval("abc")).toBeNull();
    expect(SubagentScheduler.parseInterval("10x")).toBeNull();
  });

  it("Missing error test for saveSettings", () => {
    // saveSettings uses mkdirSync({ recursive: true }), so a merely non-existent
    // path succeeds. Force a real failure by posing a regular file as the cwd so
    // creating the ".pi" subdirectory fails with ENOTDIR.
    const filePosingAsCwd = join(tmpdir(), `pi-missing-coverage-notdir-${Date.now()}`);
    writeFileSync(filePosingAsCwd, "");
    try {
      expect(saveSettings({} as any, filePosingAsCwd)).toBe(false);
    } finally {
      rmSync(filePosingAsCwd, { force: true });
    }
  });

  it("Missing test for composeHandlers", () => {
    const handler1 = () => "h1";
    const handler2 = () => "h2";
    const composed = composeHandlers(handler1 as any, handler2 as any);
    expect(composed).toBeDefined();
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
     let val: any;
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
     const res = buildEffectivePrompt({} as any, "test prompt", { inheritContext: false } as any);
     expect(res).toContain("test prompt");
  });
});
