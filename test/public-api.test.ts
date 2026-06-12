/**
 * public-api.test.ts — Tests for the typed public API surface.
 *
 * Covers:
 * 1. Symbol-based discovery (publish + forget + discover)
 * 2. Typed RPC client wiring through the registry
 * 3. Typed event subscription — handlers receive the discriminated payload
 * 4. Re-exports of RPC + hook types from a single entry point
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSubagentsApi,
  createSubagentsRpcClient,
  type EventBus,
  getSubagentsApi,
  getSubagentsHooks,
  HookRegistry,
  PROTOCOL_VERSION,
  registerSubagentsApi,
  SUBAGENTS_API_SYMBOL,
  SUBAGENTS_HOOKS_SYMBOL,
  type TypedHookPayload,
} from "../src/public-api.js";

/** Minimal in-process event bus, mirroring the pattern from cross-extension-rpc.test.ts. */
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

describe("public-api", () => {
  let events: EventBus;
  let hooks: HookRegistry;

  beforeEach(() => {
    clearSubagentsApi();
    events = createEventBus();
    hooks = new HookRegistry();
  });

  afterEach(() => {
    clearSubagentsApi();
  });

  describe("Symbol discovery", () => {
    it("getSubagentsApi returns undefined when the extension is not loaded", () => {
      expect(getSubagentsApi()).toBeUndefined();
    });

    it("getSubagentsHooks returns undefined when the extension is not loaded", () => {
      expect(getSubagentsHooks()).toBeUndefined();
    });

    it("registerSubagentsApi publishes the API on globalThis under the documented symbol", () => {
      const api = registerSubagentsApi(events, hooks);
      expect((globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_API_SYMBOL]).toBe(api);
    });

    it("registerSubagentsApi publishes the raw HookRegistry under pi-subagents:hooks", () => {
      registerSubagentsApi(events, hooks);
      expect((globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_HOOKS_SYMBOL]).toBe(hooks);
    });

    it("getSubagentsApi returns the published API after registration", () => {
      const api = registerSubagentsApi(events, hooks);
      expect(getSubagentsApi()).toBe(api);
    });

    it("getSubagentsHooks returns the published HookRegistry after registration", () => {
      registerSubagentsApi(events, hooks);
      expect(getSubagentsHooks()).toBe(hooks);
    });

    it("clearSubagentsApi removes both published handles", () => {
      registerSubagentsApi(events, hooks);
      clearSubagentsApi();
      expect(getSubagentsApi()).toBeUndefined();
      expect(getSubagentsHooks()).toBeUndefined();
    });

    it("clearSubagentsApi is a safe no-op when nothing is registered", () => {
      expect(() => clearSubagentsApi()).not.toThrow();
      expect(getSubagentsApi()).toBeUndefined();
    });

    it("re-registration is idempotent — last call wins (matches RPC contract)", () => {
      const first = registerSubagentsApi(events, hooks, { extensionId: "first" });
      const hooks2 = new HookRegistry();
      const second = registerSubagentsApi(events, hooks2, { extensionId: "second" });
      expect(second).not.toBe(first);
      expect(getSubagentsApi()).toBe(second);
      expect(getSubagentsHooks()).toBe(hooks2);
    });

    it("api.hooks.registry is identity-equal to the HookRegistry passed in", () => {
      const api = registerSubagentsApi(events, hooks);
      expect(api.hooks.registry).toBe(hooks);
    });

    it("api.rpc is the typed client for the registered extensionId", () => {
      const api = registerSubagentsApi(events, hooks, { extensionId: "id-check" });
      // The client is created via createSubagentsRpcClient and exposes the
      // expected four-method shape.
      expect(Object.keys(api.rpc).sort()).toEqual(
        ["ping", "sessionUsage", "spawn", "stop"].sort(),
      );
    });

    it("exposes the protocol version on the published API", () => {
      const api = registerSubagentsApi(events, hooks);
      expect(api.protocolVersion).toBe(PROTOCOL_VERSION);
    });
  });

  describe("typed RPC surface", () => {
    it("exposes a working RPC client that can ping the orchestrator", async () => {
      registerSubagentsApi(events, hooks, { extensionId: "test-ext" });

      // Wire a minimal handler that mirrors the server side.
      events.on("subagents:rpc:ping", (raw) => {
        const r = raw as { requestId: string };
        events.emit(`subagents:rpc:ping:reply:${r.requestId}`, {
          success: true,
          data: { version: PROTOCOL_VERSION },
        });
      });

      const api = getSubagentsApi();
      expect(api).toBeDefined();
      const reply = await api!.rpc.ping();
      expect(reply).toEqual({ version: PROTOCOL_VERSION });
    });

    it("createSubagentsRpcClient is re-exported and usable as a stand-alone helper", () => {
      const client = createSubagentsRpcClient(events, { extensionId: "standalone" });
      expect(typeof client.ping).toBe("function");
      expect(typeof client.spawn).toBe("function");
      expect(typeof client.stop).toBe("function");
      expect(typeof client.sessionUsage).toBe("function");
    });
  });

  describe("typed event subscription", () => {
    it("handlers receive the discriminated payload for the subscribed event", async () => {
      const api = registerSubagentsApi(events, hooks);
      const handler = vi.fn(
        async (payload: TypedHookPayload<"subagent:start">) => {
          // Type-level contract check — these fields must exist.
          payload.data.type;
          payload.data.description;
          payload.data.parentId;
          return "allow" as const;
        },
      );
      api.hooks.on("subagent:start", handler);

      await hooks.dispatch("subagent:start", "agent-1", {
        type: "Explore",
        description: "scan deps",
        parentId: "agent-0",
      });
      expect(handler).toHaveBeenCalledTimes(1);
      const [arg] = handler.mock.calls[0]!;
      expect(arg.agentId).toBe("agent-1");
      expect(arg.data).toEqual({ type: "Explore", description: "scan deps", parentId: "agent-0" });
    });

    it("different events get different payload shapes (compile-time guarantee)", async () => {
      const api = registerSubagentsApi(events, hooks);
      const startHandler = vi.fn(
        async (_p: TypedHookPayload<"subagent:start">) => "allow" as const,
      );
      const endHandler = vi.fn(
        async (_p: TypedHookPayload<"subagent:end">) => "allow" as const,
      );
      api.hooks.on("subagent:start", startHandler);
      api.hooks.on("subagent:end", endHandler);

      await hooks.dispatch("subagent:start", "a-1", { type: "Explore", description: "x" });
      await hooks.dispatch("subagent:end", "a-1", { status: "completed", result: "ok" });

      expect(startHandler.mock.calls[0]![0].data.type).toBe("Explore");
      expect(endHandler.mock.calls[0]![0].data.status).toBe("completed");
    });

    it("unsubscribe stops the handler from being called", async () => {
      const api = registerSubagentsApi(events, hooks);
      const handler = vi.fn(async () => "allow" as const);
      const off = api.hooks.on("subagent:spawn", handler);

      await hooks.dispatch("subagent:spawn", "a-1", { type: "Explore", description: "x" });
      expect(handler).toHaveBeenCalledTimes(1);

      off();
      await hooks.dispatch("subagent:spawn", "a-1", { type: "Explore", description: "x" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("onAll subscribes to every lifecycle event and returns a single unsubscribe", async () => {
      const api = registerSubagentsApi(events, hooks);
      const handler = vi.fn(async () => "allow" as const);
      const off = api.hooks.onAll(handler);

      await hooks.dispatch("subagent:start", "a-1", { type: "Explore", description: "x" });
      await hooks.dispatch("tool:call", "a-1", { toolName: "read", input: { path: "x" } });
      await hooks.dispatch("swarm:join", "a-1", { swarmId: "s", agentId: "a-1" });
      expect(handler).toHaveBeenCalledTimes(3);

      off();
      await hooks.dispatch("subagent:start", "a-1", { type: "Explore", description: "x" });
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe("re-exports", () => {
    it("HookRegistry and PROTOCOL_VERSION are accessible from the public entry point", () => {
      expect(typeof HookRegistry).toBe("function");
      expect(typeof PROTOCOL_VERSION).toBe("number");
      const reg = new HookRegistry();
      expect(reg).toBeInstanceOf(HookRegistry);
    });
  });
});
