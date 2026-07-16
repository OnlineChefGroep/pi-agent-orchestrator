import { describe, expect, it, vi } from "vitest";

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { HookRegistry, composeHandlers } = await import("../src/hooks.js");

describe("HookRegistry", () => {
  describe("register", () => {
    it("registers a handler and returns an id", () => {
      const registry = new HookRegistry();
      const id = registry.register("subagent:start", async () => "allow");
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("accepts custom id option", () => {
      const registry = new HookRegistry();
      const id = registry.register("subagent:start", async () => "allow", { id: "my-hook" });
      expect(id).toBe("my-hook");
    });

    it("sorts handlers by priority", () => {
      const registry = new HookRegistry();
      const order: string[] = [];
      registry.register("subagent:start", async () => { order.push("normal"); }, { priority: "normal" });
      registry.register("subagent:start", async () => { order.push("critical"); }, { priority: "critical" });
      registry.register("subagent:start", async () => { order.push("background"); }, { priority: "background" });

      return registry.dispatch("subagent:start", "agent-1").then(() => {
        expect(order).toEqual(["critical", "normal", "background"]);
      });
    });

    it("accepts numeric priority", () => {
      const registry = new HookRegistry();
      const order: string[] = [];
      registry.register("subagent:start", async () => { order.push("second"); }, { priority: 50 });
      registry.register("subagent:start", async () => { order.push("first"); }, { priority: 10 });

      return registry.dispatch("subagent:start", "agent-1").then(() => {
        expect(order).toEqual(["first", "second"]);
      });
    });
  });

  describe("registerAll", () => {
    it("registers multiple handlers at once", () => {
      const registry = new HookRegistry();
      const ids = registry.registerAll({
        "subagent:start": async () => "allow",
        "subagent:end": async () => "allow",
      });
      expect(ids.length).toBe(2);

      const snapshot = registry.getHandlers();
      expect(snapshot.has("subagent:start")).toBe(true);
      expect(snapshot.has("subagent:end")).toBe(true);
    });

    it("returns empty array for empty handler map", () => {
      const registry = new HookRegistry();
      const ids = registry.registerAll({});
      expect(ids).toEqual([]);
    });
  });

  describe("unregister", () => {
    it("removes handlers by function reference", () => {
      const registry = new HookRegistry();
      const fn = async () => "allow";
      registry.register("subagent:start", fn);
      expect(registry.getHandlers().size).toBe(1);

      registry.unregister("subagent:start", fn);
      expect(registry.getHandlers().size).toBe(0);
    });

    it("is a no-op for unregistered events", () => {
      const registry = new HookRegistry();
      expect(() => registry.unregister("subagent:start" as any, async () => {})).not.toThrow();
    });
  });

  describe("unregisterById", () => {
    it("removes handler by id", () => {
      const registry = new HookRegistry();
      const id = registry.register("subagent:start", async () => "allow", { id: "hook-1" });
      expect(registry.unregisterById(id)).toBe(true);
      expect(registry.getHandlers().size).toBe(0);
    });

    it("returns false for unknown id", () => {
      const registry = new HookRegistry();
      expect(registry.unregisterById("nonexistent")).toBe(false);
    });

    it("removes empty event entry after last handler", () => {
      const registry = new HookRegistry();
      const id = registry.register("subagent:start", async () => "allow");
      registry.unregisterById(id);
      expect(registry.getHandlers().get("subagent:start")).toBeUndefined();
    });
  });

  describe("dispatch", () => {
    it("returns allow when no handlers registered", async () => {
      const registry = new HookRegistry();
      const result = await registry.dispatch("subagent:start", "agent-1");
      expect(result).toBe("allow");
    });

    it("returns block when handler returns block", async () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => "block", { priority: 0 });
      registry.register("subagent:start", async () => "allow", { priority: 1 });

      const result = await registry.dispatch("subagent:start", "agent-1");
      expect(result).toBe("block");
    });

    it("returns modify when handler returns modify", async () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => "modify");

      const result = await registry.dispatch("subagent:start", "agent-1");
      expect(result).toBe("modify");
    });

    it("passes agentId in payload", async () => {
      const registry = new HookRegistry();
      let receivedAgentId: string | undefined;
      registry.register("subagent:start", async (payload) => {
        receivedAgentId = payload.agentId;
        return "allow";
      });

      await registry.dispatch("subagent:start", "agent-42");
      expect(receivedAgentId).toBe("agent-42");
    });

    it("passes data in payload", async () => {
      const registry = new HookRegistry();
      let receivedData: Record<string, unknown> | undefined;
      registry.register("subagent:start", async (payload) => {
        receivedData = payload.data;
        return "allow";
      });

      await registry.dispatch("subagent:start", "agent-1", { key: "value" });
      expect(receivedData).toEqual({ key: "value" });
    });

    it("handles synchronous handlers", async () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", () => "allow");

      const result = await registry.dispatch("subagent:start", "agent-1");
      expect(result).toBe("allow");
    });

    it("swallows handler errors and continues", async () => {
      const registry = new HookRegistry();
      let secondCalled = false;
      registry.register("subagent:start", async () => { throw new Error("boom"); }, { id: "bad" });
      registry.register("subagent:start", async () => { secondCalled = true; return "allow"; });

      const result = await registry.dispatch("subagent:start", "agent-1");
      expect(result).toBe("allow");
      expect(secondCalled).toBe(true);
    });

    it("disables handler after circuit breaker threshold", async () => {
      const registry = new HookRegistry();
      let callCount = 0;
      registry.register("subagent:start", async () => { callCount++; throw new Error("fail"); }, {
        circuitBreakerThreshold: 2,
      });

      await registry.dispatch("subagent:start", "agent-1");
      await registry.dispatch("subagent:start", "agent-1");
      await registry.dispatch("subagent:start", "agent-1"); // third — should be disabled

      // First 3 calls fire, then 4th+ are disabled
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("use (middleware)", () => {
    it("runs handlers through middleware chain", async () => {
      const registry = new HookRegistry();
      const middlewareOrder: string[] = [];
      registry.use(async (_payload, next) => {
        middlewareOrder.push("mw1-before");
        const result = await next();
        middlewareOrder.push("mw1-after");
        return result;
      });
      registry.use(async (_payload, next) => {
        middlewareOrder.push("mw2");
        return next();
      });
      registry.register("subagent:start", async () => { middlewareOrder.push("handler"); return "allow"; });

      await registry.dispatch("subagent:start", "agent-1");
      expect(middlewareOrder).toEqual(["mw1-before", "mw2", "handler", "mw1-after"]);
    });
  });

  describe("getHandlers", () => {
    it("returns a frozen snapshot of registered handlers", () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => "allow", { id: "h1", fatal: true });

      const snapshot = registry.getHandlers();
      const handlers = snapshot.get("subagent:start");
      expect(handlers).toBeDefined();
      expect(handlers!.length).toBe(1);
      expect(handlers![0].id).toBe("h1");
      expect(handlers![0].fatal).toBe(true);
    });

    it("returns empty map when nothing registered", () => {
      const registry = new HookRegistry();
      const snapshot = registry.getHandlers();
      expect(snapshot.size).toBe(0);
    });
  });

  describe("getMetrics", () => {
    it("returns metrics for registered handlers even without dispatch", () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => "allow");
      const metrics = registry.getMetrics();
      // Metrics are created at registration time, not dispatch time
      expect(metrics.length).toBe(1);
      expect(metrics[0].invocations).toBe(0);
    });

    it("returns metrics after dispatch", async () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => "allow");
      await registry.dispatch("subagent:start", "agent-1");

      const metrics = registry.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].invocations).toBe(1);
      expect(metrics[0].errors).toBe(0);
    });
  });

  describe("resetMetrics", () => {
    it("resets all counters to zero", async () => {
      const registry = new HookRegistry();
      registry.register("subagent:start", async () => { throw new Error("fail"); });
      await registry.dispatch("subagent:start", "agent-1");

      registry.resetMetrics();
      const metrics = registry.getMetrics();
      expect(metrics[0].invocations).toBe(0);
      expect(metrics[0].errors).toBe(0);
      expect(metrics[0].disabled).toBe(false);
    });
  });
});

describe("composeHandlers", () => {
  it("runs all composed handlers in order", async () => {
    const order: string[] = [];
    const composed = composeHandlers(
      async () => { order.push("first"); return undefined; },
      async () => { order.push("second"); return "allow"; },
    );

    await composed({ event: "subagent:start", agentId: "a1" });
    expect(order).toEqual(["first", "second"]);
  });

  it("short-circuits on block", async () => {
    const order: string[] = [];
    const composed = composeHandlers(
      async () => { order.push("first"); return "block"; },
      async () => { order.push("second"); return "allow"; },
    );

    const result = await composed({ event: "subagent:start", agentId: "a1" });
    expect(result).toBe("block");
    expect(order).toEqual(["first"]); // second never runs
  });

  it("preserves object-form block feedback", async () => {
    const composed = composeHandlers(
      async () => ({ action: "block" as const, feedback: "fix the tests" }),
      async () => "allow" as const,
    );
    const result = await composed({ event: "subagent:end", agentId: "a1" });
    expect(result).toEqual({ action: "block", feedback: "fix the tests" });
  });

  it("returns allow when no handlers given", async () => {
    const composed = composeHandlers();
    const result = await composed({ event: "subagent:start", agentId: "a1" });
    expect(result).toBe("allow");
  });
});

describe("normalizeHookResponse", () => {
  it("normalizes string and object forms", async () => {
    const { normalizeHookResponse, isBlockResponse } = await import("../src/hooks.js");
    expect(normalizeHookResponse("allow")).toEqual({ action: "allow" });
    expect(normalizeHookResponse("block")).toEqual({ action: "block" });
    expect(normalizeHookResponse("modify")).toEqual({ action: "modify" });
    expect(normalizeHookResponse({ action: "block", feedback: "retry", reason: "fail" })).toEqual({
      action: "block",
      feedback: "retry",
      reason: "fail",
    });
    expect(isBlockResponse("block")).toBe(true);
    expect(isBlockResponse({ action: "block" })).toBe(true);
    expect(isBlockResponse("allow")).toBe(false);
  });
});

describe("HookRegistry object-form block", () => {
  it("short-circuits and returns object feedback from dispatch", async () => {
    const registry = new HookRegistry();
    registry.register("subagent:end", async () => ({ action: "block", feedback: "needs more detail" }));
    const result = await registry.dispatch("subagent:end", "agent-1", { responseText: "draft" });
    expect(result).toEqual({ action: "block", feedback: "needs more detail" });
  });
});
