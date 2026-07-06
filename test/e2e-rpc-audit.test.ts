/**
 * e2e-rpc-audit.test.ts — End-to-end tests for RPC audit logging & rate limiting.
 *
 * Exercises the full RPC → audit → rate-limit pipeline through the real
 * event bus, verifying audit entries, outcome classification, configurable
 * rate limits, and the typed RpcError path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuditLog,
  getAuditLog,
  getAuditLogByExtension,
  getAuditLogByOperation,
  resetAuditLogger,
} from "../src/audit-logger.js";
import {
  configureRateLimit,
  createSubagentsRpcClient,
  type EventBus,
  getRateLimitConfig,
  registerRpcHandlers,
  resetRpcRateLimitsForTests,
  type SpawnCapable,
} from "../src/cross-extension-rpc.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)?.delete(handler);
      };
    },
    emit(event, data) {
      for (const handler of listeners.get(event) ?? []) handler(data);
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("E2E: RPC audit logging & rate limiting", () => {
  let events: EventBus;
  let manager: SpawnCapable;

  beforeEach(() => {
    resetRpcRateLimitsForTests();
    resetAuditLogger();
    events = createEventBus();
    manager = {
      spawn: vi.fn().mockReturnValue("agent-42"),
      abort: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    resetRpcRateLimitsForTests();
    resetAuditLogger();
  });

  // ── 1. Full audit trail ─────────────────────────────────────────────────

  describe("audit trail", () => {
    it("records ping, spawn, and stop calls with correct fields", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
      });

      const client = createSubagentsRpcClient(events);

      // ping
      await client.ping();
      // spawn
      await client.spawn({ type: "Explore", prompt: "test" });
      // stop
      await client.stop({ agentId: "agent-42" });

      const log = getAuditLog();
      expect(log).toHaveLength(3);

      // Verify structure of each entry
      expect(log[0]).toMatchObject({
        operation: "ping",
        outcome: "success",
        extensionId: "legacy", // no authProvider
      });
      expect(log[1]).toMatchObject({
        operation: "spawn",
        outcome: "success",
        extensionId: "legacy",
      });
      expect(log[2]).toMatchObject({
        operation: "stop",
        outcome: "success",
        extensionId: "legacy",
      });

      // All entries should have timestamps and non-negative duration
      for (const entry of log) {
        expect(entry.timestamp).toBeDefined();
        expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
        expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("consecutive calls produce independent audit entry objects", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
      });

      const client = createSubagentsRpcClient(events);
      await client.spawn({ type: "Explore", prompt: "test" });
      await client.ping();

      const log = getAuditLog();
      expect(log).toHaveLength(2);
      // Each entry is a distinct object (not the same reference)
      expect(log[0]).not.toBe(log[1]);
      expect(log[0].extensionId).toBe("legacy");
    });
  });

  // ── 2. Rate limiting ────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("blocks calls after exceeding maxPerWindow and records rate_limited", async () => {
      configureRateLimit({ windowMs: 60_000, maxPerWindow: 2 });
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
        authProvider: (_reqId) => ({ extensionId: "ext-test", extensionName: "Test" }),
      });

      const client = createSubagentsRpcClient(events);

      // First 2 spawns succeed
      await client.spawn({ type: "Explore", prompt: "ok 1" });
      await client.spawn({ type: "Explore", prompt: "ok 2" });

      // Third spawn should be rate-limited
      await expect(client.spawn({ type: "Explore", prompt: "blocked" })).rejects.toThrow(/Rate limit/);

      const log = getAuditLog();
      expect(log).toHaveLength(3);

      // First two are success
      expect(log[0].outcome).toBe("success");
      expect(log[1].outcome).toBe("success");

      // Third is rate_limited
      expect(log[2]).toMatchObject({
        operation: "spawn",
        outcome: "rate_limited",
        extensionId: "ext-test",
        extensionName: "Test",
      });
      expect(log[2].metadata).toBeDefined();
      expect(log[2].metadata!.error).toContain("Rate limit");
    });

    it("configurable maxPerWindow=1 blocks on second spawn", async () => {
      configureRateLimit({ maxPerWindow: 1 });
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
        authProvider: () => ({ extensionId: "ext-strict" }),
      });

      const client = createSubagentsRpcClient(events);
      await client.spawn({ type: "Explore", prompt: "ok" }); // first spawn succeeds

      await expect(client.spawn({ type: "Explore", prompt: "blocked" })).rejects.toThrow(/Rate limit/);

      const log = getAuditLog();
      expect(log[0].outcome).toBe("success");
      expect(log[1].outcome).toBe("rate_limited");
    });

    it("different extensions have independent rate limits", async () => {
      configureRateLimit({ maxPerWindow: 1 });
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
        authProvider: (reqId: string) => {
          // Alternate between two extensions based on requestId
          const id = reqId.includes("a-") ? "ext-A" : "ext-B";
          return { extensionId: id };
        },
      });

      // Manual emit to control requestId
      events.emit("subagents:rpc:ping", { requestId: "a-1" });
      await vi.waitFor(() => expect(getAuditLog()).toHaveLength(1));

      events.emit("subagents:rpc:ping", { requestId: "b-1" });
      await vi.waitFor(() => expect(getAuditLog()).toHaveLength(2));

      // Both should succeed — independent windows
      const log = getAuditLog();
      expect(log[0].outcome).toBe("success");
      expect(log[0].extensionId).toBe("ext-A");
      expect(log[1].outcome).toBe("success");
      expect(log[1].extensionId).toBe("ext-B");
    });
  });

  // ── 3. Unauthorized ─────────────────────────────────────────────────────

  describe("unauthorized", () => {
    it("records unauthorized outcome when authProvider rejects", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
        authProvider: (_reqId: string) => undefined, // always reject
      });

      const client = createSubagentsRpcClient(events);
      await expect(client.spawn({ type: "Explore", prompt: "nope" })).rejects.toThrow(/Unauthorized/);

      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        operation: "spawn",
        outcome: "unauthorized",
        extensionId: "unknown", // fallback when auth fails
      });
    });
  });

  // ── 4. Audit log filtering ──────────────────────────────────────────────

  describe("audit log filtering", () => {
    it("getAuditLogByOperation returns only matching entries", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
      });

      const client = createSubagentsRpcClient(events);
      await client.ping();
      await client.spawn({ type: "Explore", prompt: "test" });
      await client.ping();

      expect(getAuditLogByOperation("ping")).toHaveLength(2);
      expect(getAuditLogByOperation("spawn")).toHaveLength(1);
      expect(getAuditLogByOperation("stop")).toHaveLength(0);
    });

    it("getAuditLogByExtension returns only matching entries", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
        authProvider: (reqId) => {
          if (reqId.startsWith("a-")) return { extensionId: "ext-A" };
          return { extensionId: "ext-B" };
        },
      });

      events.emit("subagents:rpc:ping", { requestId: "a-1" });
      events.emit("subagents:rpc:ping", { requestId: "b-1" });
      events.emit("subagents:rpc:ping", { requestId: "a-2" });

      await vi.waitFor(() => expect(getAuditLog()).toHaveLength(3));

      expect(getAuditLogByExtension("ext-A")).toHaveLength(2);
      expect(getAuditLogByExtension("ext-B")).toHaveLength(1);
    });
  });

  // ── 5. clearAuditLog ────────────────────────────────────────────────────

  describe("clearAuditLog", () => {
    it("empties the buffer", async () => {
      registerRpcHandlers({
        events,
        pi: {},
        getCtx: () => ({ session: true }),
        manager,
      });

      const client = createSubagentsRpcClient(events);
      await client.ping();
      expect(getAuditLog()).toHaveLength(1);

      clearAuditLog();
      expect(getAuditLog()).toHaveLength(0);
    });
  });

  // ── 6. getRateLimitConfig ───────────────────────────────────────────────

  describe("getRateLimitConfig", () => {
    it("returns defaults when not configured", () => {
      const config = getRateLimitConfig();
      expect(config.windowMs).toBe(60_000);
      expect(config.maxPerWindow).toBe(10);
    });

    it("reflects configured values", () => {
      configureRateLimit({ windowMs: 5_000, maxPerWindow: 3 });
      const config = getRateLimitConfig();
      expect(config.windowMs).toBe(5_000);
      expect(config.maxPerWindow).toBe(3);
    });
  });

  // ── 7. RPC client timeout ───────────────────────────────────────────────

  describe("RPC client timeout", () => {
    it("rejects with timeout when server never replies", async () => {
      // Don't register any handlers — nobody will reply
      const client = createSubagentsRpcClient(events, { timeoutMs: 50 });

      await expect(client.ping()).rejects.toThrow(/RPC timeout/);
    });
  });
});
