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
  getSubagentsManager,
  HookRegistry,
  PROTOCOL_VERSION,
  registerSubagentsApi,
  SUBAGENTS_API_SYMBOL,
  SUBAGENTS_HOOKS_SYMBOL,
  SUBAGENTS_MANAGER_SYMBOL,
  type SubagentManagerLike,
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

/**
 * In-memory mock of the structural shape `registerSubagentsApi` requires
 * for the manager argument. Covers the four methods the handle exposes
 * (waitForAll, hasRunning, getRecord, listAgentIds) plus the internal
 * `listAgents` used by the handle builder.
 */
function createMockManager(seed: ReadonlyArray<{ id: string; type: string; status: string; description?: string }> = []): SubagentManagerLike {
  const records = new Map(seed.map((r) => [r.id, r]));
  return {
    waitForAll: vi.fn(async () => {}),
    hasRunning: vi.fn(() => Array.from(records.values()).some((r) => r.status === "running")),
    getRecord: vi.fn((id: string) => records.get(id)),
    listAgents: vi.fn(() => Array.from(records.values()).map((r) => ({ id: r.id, type: r.type }))),
  };
}

describe("public-api", () => {
  let events: EventBus;
  let hooks: HookRegistry;
  let manager: SubagentManagerLike;

  beforeEach(() => {
    clearSubagentsApi();
    events = createEventBus();
    hooks = new HookRegistry();
    manager = createMockManager();
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

    it("getSubagentsManager returns undefined when the extension is not loaded", () => {
      expect(getSubagentsManager()).toBeUndefined();
    });

    it("registerSubagentsApi publishes the API on globalThis under the documented symbol", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect((globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_API_SYMBOL]).toBe(api);
    });

    it("registerSubagentsApi publishes the raw HookRegistry under pi-subagents:hooks", () => {
      registerSubagentsApi(events, hooks, manager);
      expect((globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_HOOKS_SYMBOL]).toBe(hooks);
    });

    it("registerSubagentsApi publishes the manager handle under pi-subagents:manager", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect((globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_MANAGER_SYMBOL]).toBe(
        api.manager,
      );
    });

    it("getSubagentsApi returns the published API after registration", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect(getSubagentsApi()).toBe(api);
    });

    it("getSubagentsHooks returns the published HookRegistry after registration", () => {
      registerSubagentsApi(events, hooks, manager);
      expect(getSubagentsHooks()).toBe(hooks);
    });

    it("clearSubagentsApi removes all three published handles", () => {
      registerSubagentsApi(events, hooks, manager);
      clearSubagentsApi();
      expect(getSubagentsApi()).toBeUndefined();
      expect(getSubagentsHooks()).toBeUndefined();
      expect(getSubagentsManager()).toBeUndefined();
    });

    it("clearSubagentsApi is a safe no-op when nothing is registered", () => {
      expect(() => clearSubagentsApi()).not.toThrow();
      expect(getSubagentsApi()).toBeUndefined();
    });

    it("re-registration is idempotent — last call wins (matches RPC contract)", () => {
      const first = registerSubagentsApi(events, hooks, manager, { extensionId: "first" });
      const hooks2 = new HookRegistry();
      const manager2 = createMockManager();
      const second = registerSubagentsApi(events, hooks2, manager2, { extensionId: "second" });
      expect(second).not.toBe(first);
      expect(getSubagentsApi()).toBe(second);
      expect(getSubagentsHooks()).toBe(hooks2);
      expect(getSubagentsManager()).toBe(second.manager);
    });

    it("api.hooks.registry is identity-equal to the HookRegistry passed in", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect(api.hooks.registry).toBe(hooks);
    });

    it("api.rpc is the typed client for the registered extensionId", () => {
      const api = registerSubagentsApi(events, hooks, manager, { extensionId: "id-check" });
      // The client is created via createSubagentsRpcClient and exposes the
      // expected four-method shape.
      expect(Object.keys(api.rpc).sort()).toEqual(
        ["ping", "sessionUsage", "spawn", "stop"].sort(),
      );
    });

    it("exposes the protocol version on the published API", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect(api.protocolVersion).toBe(PROTOCOL_VERSION);
    });
  });

  describe("typed RPC surface", () => {
    it("exposes a working RPC client that can ping the orchestrator", async () => {
      registerSubagentsApi(events, hooks, manager, { extensionId: "test-ext" });

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
      const api = registerSubagentsApi(events, hooks, manager);
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
      const api = registerSubagentsApi(events, hooks, manager);
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
      const api = registerSubagentsApi(events, hooks, manager);
      const handler = vi.fn(async () => "allow" as const);
      const off = api.hooks.on("subagent:spawn", handler);

      await hooks.dispatch("subagent:spawn", "a-1", { type: "Explore", description: "x" });
      expect(handler).toHaveBeenCalledTimes(1);

      off();
      await hooks.dispatch("subagent:spawn", "a-1", { type: "Explore", description: "x" });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("onAll subscribes to every lifecycle event and returns a single unsubscribe", async () => {
      const api = registerSubagentsApi(events, hooks, manager);
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

  describe("manager handle", () => {
    it("getSubagentsManager returns the published handle after registration", () => {
      const api = registerSubagentsApi(events, hooks, manager);
      expect(getSubagentsManager()).toBe(api.manager);
    });

    it("getRecord returns undefined for a nonexistent id", () => {
      const mgr = createMockManager([{ id: "a-1", type: "Explore", status: "running" }]);
      const api = registerSubagentsApi(events, hooks, mgr);
      expect(api.manager.getRecord("a-1")).toEqual({
        id: "a-1",
        type: "Explore",
        status: "running",
        description: undefined,
      });
      expect(api.manager.getRecord("nonexistent")).toBeUndefined();
    });

    it("getRecord truncates the description to 200 characters (sanitized projection)", () => {
      const long = "x".repeat(500);
      const mgr = createMockManager([{ id: "a-1", type: "Explore", status: "running", description: long }]);
      const api = registerSubagentsApi(events, hooks, mgr);
      const rec = api.manager.getRecord("a-1");
      expect(rec?.description?.length).toBe(200);
    });

    it("getRecord passes short descriptions through unchanged", () => {
      const short = "scan deps";
      const mgr = createMockManager([{ id: "a-1", type: "Explore", status: "running", description: short }]);
      const api = registerSubagentsApi(events, hooks, mgr);
      expect(api.manager.getRecord("a-1")?.description).toBe(short);
    });

    it("listAgentIds returns correctly filtered agent ids by type", () => {
      const mgr = createMockManager([
        { id: "e-1", type: "Explore", status: "completed" },
        { id: "e-2", type: "Explore", status: "running" },
        { id: "p-1", type: "Plan", status: "completed" },
        { id: "g-1", type: "general-purpose", status: "running" },
      ]);
      const api = registerSubagentsApi(events, hooks, mgr);
      expect(api.manager.listAgentIds("Explore").sort()).toEqual(["e-1", "e-2"]);
      expect(api.manager.listAgentIds("Plan")).toEqual(["p-1"]);
      expect(api.manager.listAgentIds("general-purpose")).toEqual(["g-1"]);
      expect(api.manager.listAgentIds("Unknown")).toEqual([]);
    });

    it("waitForAll and hasRunning delegate to the wrapped manager", async () => {
      const mgr = createMockManager([{ id: "a-1", type: "Explore", status: "running" }]);
      const api = registerSubagentsApi(events, hooks, mgr);
      expect(api.manager.hasRunning()).toBe(true);
      await api.manager.waitForAll();
      expect(mgr.waitForAll).toHaveBeenCalledTimes(1);
      expect(mgr.hasRunning).toHaveBeenCalled();
    });

    it("api.manager is identity-equal to the value published on the symbol", () => {
      const mgr = createMockManager();
      const api = registerSubagentsApi(events, hooks, mgr);
      const fromSymbol = (globalThis as unknown as Record<symbol, unknown>)[SUBAGENTS_MANAGER_SYMBOL];
      expect(fromSymbol).toBe(api.manager);
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
