/**
 * hooks.test.ts — Tests for HookRegistry: register, dispatch, unregister,
 * timeout protection, error resilience, and thread-safety.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HookEvent,
  type HookPayload,
  HookRegistry,
} from "../src/hooks.js";

/** Build a standard payload for testing. */
function payload(
  event: HookEvent,
  agentId = "test-agent-1",
  data?: Record<string, unknown>,
): HookPayload {
  return { event, agentId, ...(data ? { data } : {}) };
}

describe("HookRegistry", () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("register", () => {
    it("adds a handler and dispatch calls it", async () => {
      const handler = vi.fn().mockReturnValue("allow");
      registry.register("subagent:start", handler);

      await registry.dispatch("subagent:start", "test-agent-1");

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        payload("subagent:start", "test-agent-1"),
      );
    });

    it("supports async handlers", async () => {
      const handler = vi.fn().mockResolvedValue("allow");
      registry.register("subagent:end", handler);

      const result = await registry.dispatch("subagent:end", "test-agent-1");

      expect(handler).toHaveBeenCalledOnce();
      expect(result).toBe("allow");
    });
  });

  describe("registerAll", () => {
    it("adds multiple handlers at once", async () => {
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      registry.registerAll({
        "subagent:start": startHandler,
        "subagent:end": endHandler,
      });

      await registry.dispatch("subagent:start", "a1");
      await registry.dispatch("subagent:end", "a1");

      expect(startHandler).toHaveBeenCalledOnce();
      expect(endHandler).toHaveBeenCalledOnce();
    });
  });

  describe("unregister", () => {
    it("removes a handler so it is no longer called", async () => {
      const handler = vi.fn();
      registry.register("subagent:start", handler);
      registry.unregister("subagent:start", handler);

      await registry.dispatch("subagent:start", "a1");

      expect(handler).not.toHaveBeenCalled();
    });

    it("removes only the specified handler, leaving others intact", async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      registry.register("subagent:start", h1);
      registry.register("subagent:start", h2);
      registry.unregister("subagent:start", h1);

      await registry.dispatch("subagent:start", "a1");

      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledOnce();
    });
  });

  describe("dispatch", () => {
    it('returns "block" when any handler blocks', async () => {
      registry.register("subagent:start", () => "allow");
      registry.register("subagent:start", () => "block");
      registry.register("subagent:start", () => "modify");

      const result = await registry.dispatch("subagent:start", "a1");

      expect(result).toBe("block");
    });

    it('returns "modify" when a handler modifies and none block', async () => {
      registry.register("tool:call", () => "allow");
      registry.register("tool:call", () => "modify");

      const result = await registry.dispatch("tool:call", "a1");

      expect(result).toBe("modify");
    });

    it('returns "allow" when no handlers are registered', async () => {
      const result = await registry.dispatch("turn:start", "a1");

      expect(result).toBe("allow");
    });

    it('returns "allow" when all handlers return void', async () => {
      registry.register("subagent:end", () => {});
      registry.register("subagent:end", () => {});

      const result = await registry.dispatch("subagent:end", "a1");

      expect(result).toBe("allow");
    });
  });

  describe("timeout protection", () => {
    it("logs a warning and continues when a handler times out", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const slowHandler = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("allow"), 5000)),
      );
      const fastHandler = vi.fn().mockReturnValue("allow");

      registry.register("subagent:start", slowHandler);
      registry.register("subagent:start", fastHandler);

      const result = await registry.dispatch(
        "subagent:start",
        "a1",
        undefined,
        10, // 10ms timeout
      );

      // fastHandler should still have been called
      expect(fastHandler).toHaveBeenCalledOnce();
      // slowHandler was started but timed out
      expect(result).toBe("allow");
      // A warning should have been logged for the timeout
      expect(warnSpy).toHaveBeenCalled();
      const timeoutWarnCall = warnSpy.mock.calls[0];
      expect(timeoutWarnCall[0]).toContain("timed out");

      warnSpy.mockRestore();
    });
  });

  describe("error resilience", () => {
    it("catches handler exceptions and continues dispatching", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const throwingHandler = vi.fn().mockImplementation(() => {
        throw new Error("boom");
      });
      const normalHandler = vi.fn().mockReturnValue("allow");

      registry.register("subagent:error", throwingHandler);
      registry.register("subagent:error", normalHandler);

      const result = await registry.dispatch("subagent:error", "a1");

      // The normal handler should still run
      expect(normalHandler).toHaveBeenCalledOnce();
      expect(result).toBe("allow");
      expect(warnSpy).toHaveBeenCalled();
      const firstWarnCall = warnSpy.mock.calls[0];
      expect(firstWarnCall[0]).toContain("threw");

      warnSpy.mockRestore();
    });
  });

  describe("multiple handlers", () => {
    it("calls all registered handlers", async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();

      registry.register("compaction:start", h1);
      registry.register("compaction:start", h2);
      registry.register("compaction:start", h3);

      await registry.dispatch("compaction:start", "a1");

      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
      expect(h3).toHaveBeenCalledOnce();
    });
  });

  describe("getHandlers", () => {
    it("returns the correct Map structure", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      registry.register("subagent:start", h1);
      registry.register("subagent:end", h2);

      const map = registry.getHandlers();

      expect(map).toBeInstanceOf(Map);
      expect(map.get("subagent:start")).toEqual([h1]);
      expect(map.get("subagent:end")).toEqual([h2]);
      expect(map.get("turn:start")).toBeUndefined();
    });

    it("returns an empty Map when nothing is registered", () => {
      const map = registry.getHandlers();

      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBe(0);
    });
  });

  describe("dispatch with data", () => {
    it("passes data to handler correctly", async () => {
      const handler = vi.fn();
      registry.register("tool:call", handler);

      await registry.dispatch("tool:call", "agent-x", {
        toolName: "read",
        args: { filePath: "/tmp/test" },
      });

      expect(handler).toHaveBeenCalledWith({
        event: "tool:call",
        agentId: "agent-x",
        data: { toolName: "read", args: { filePath: "/tmp/test" } },
      });
    });
  });
});
