import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditLog, resetAuditLogger } from "../src/audit-logger.js";
import { configureRateLimit, type EventBus, getRateLimitConfig, PROTOCOL_VERSION, type RpcDeps, registerRpcHandlers, resetRpcRateLimitsForTests, type SpawnCapable } from "../src/cross-extension-rpc.js";

/** Simple in-process event bus for testing. */
function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => { listeners.get(event)?.delete(handler); };
    },
    emit(event, data) {
      for (const handler of listeners.get(event) ?? []) handler(data);
    },
  };
}

describe("cross-extension RPC", () => {
  let events: EventBus;
  let manager: SpawnCapable;
  let ctx: object | undefined;
  let deps: RpcDeps;

  beforeEach(() => {
    resetRpcRateLimitsForTests();
    resetAuditLogger();
    events = createEventBus();
    manager = { spawn: vi.fn().mockReturnValue("agent-42"), abort: vi.fn().mockReturnValue(true) };
    ctx = { session: true };
    deps = { events, pi: { events }, getCtx: () => ctx, manager };
  });

  afterEach(() => {
    resetAuditLogger();
  });

  // --- ping ---

  describe("ping RPC", () => {
    it("replies with protocol version", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:req-1", reply);
      events.emit("subagents:rpc:ping", { requestId: "req-1" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: true, data: { version: PROTOCOL_VERSION } });
    });

    it("scopes replies — other requestIds do not receive it", async () => {
      registerRpcHandlers(deps);
      const wrongReply = vi.fn();
      events.on("subagents:rpc:ping:reply:req-other", wrongReply);
      events.emit("subagents:rpc:ping", { requestId: "req-1" });

      await new Promise((r) => setTimeout(r, 20));
      expect(wrongReply).not.toHaveBeenCalled();
    });

    it("unsub stops responding to pings", async () => {
      const { unsubPing } = registerRpcHandlers(deps);
      unsubPing();

      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:req-1", reply);
      events.emit("subagents:rpc:ping", { requestId: "req-1" });

      await new Promise((r) => setTimeout(r, 20));
      expect(reply).not.toHaveBeenCalled();
    });
  });

  // --- spawn ---

  describe("spawn RPC", () => {
    it("returns agent id on success", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-s1", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s1", type: "general-purpose", prompt: "do stuff",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: true, data: { id: "agent-42" } });
      expect(manager.spawn).toHaveBeenCalledWith(
        deps.pi, ctx, "general-purpose", "do stuff", {},
      );
    });

    it("passes options through to manager.spawn", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-s2", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s2", type: "Explore", prompt: "find it",
        options: { description: "search", isBackground: true },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(manager.spawn).toHaveBeenCalledWith(
        deps.pi, ctx, "Explore", "find it",
        { description: "search", isBackground: true },
      );
    });

    it("returns error when no active session", async () => {
      ctx = undefined;
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-s3", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s3", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: false, error: "No active session" });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("returns error when manager.spawn throws", async () => {
      (manager.spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("unknown agent type");
      });
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-s4", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s4", type: "bad-type", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: false, error: "unknown agent type" });
    });

    it("scopes replies — other requestIds do not receive it", async () => {
      registerRpcHandlers(deps);
      const wrongReply = vi.fn();
      const rightReply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-other", wrongReply);
      events.on("subagents:rpc:spawn:reply:req-s5", rightReply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s5", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(rightReply).toHaveBeenCalled());
      expect(wrongReply).not.toHaveBeenCalled();
    });

    it("unsub stops responding to spawns", async () => {
      const { unsubSpawn } = registerRpcHandlers(deps);
      unsubSpawn();

      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-s6", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-s6", type: "general-purpose", prompt: "x",
      });

      // Give any potential async handler time to fire
      await new Promise((r) => setTimeout(r, 20));
      expect(reply).not.toHaveBeenCalled();
    });

    it("uses authProvider identity and ignores spoofed payload authContext", async () => {
      const authProvider = vi.fn().mockReturnValue({ extensionId: "trusted-ext" });
      deps = { ...deps, authProvider };
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-auth", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-auth",
        type: "general-purpose",
        prompt: "x",
        authContext: { extensionId: "spoofed-ext" },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: true, data: { id: "agent-42" } });
      expect(authProvider).toHaveBeenCalledWith("req-auth");
    });

    it("rejects spawn when authProvider is configured but returns no identity", async () => {
      deps = { ...deps, authProvider: vi.fn().mockReturnValue(undefined) };
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-denied", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-denied",
        type: "general-purpose",
        prompt: "x",
        authContext: { extensionId: "payload-only" },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: false, error: "Unauthorized RPC request" });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("rate-limits spawn by authenticated extension identity", async () => {
      deps = { ...deps, authProvider: vi.fn().mockReturnValue({ extensionId: "rate-limited-ext" }) };
      registerRpcHandlers(deps);

      for (let i = 0; i < 10; i++) {
        events.emit("subagents:rpc:spawn", {
          requestId: `req-limit-${i}`,
          type: "general-purpose",
          prompt: "x",
        });
      }

      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-limit-final", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-limit-final",
        type: "general-purpose",
        prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false,
        error: "Rate limit exceeded for extension rate-limited-ext",
      });
    });
  });

  // --- stop ---

  describe("stop RPC", () => {
    it("returns success when agent is aborted", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-st1", reply);
      events.emit("subagents:rpc:stop", { requestId: "req-st1", agentId: "agent-42" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: true });
      expect(manager.abort).toHaveBeenCalledWith("agent-42");
    });

    it("returns error when agent not found", async () => {
      (manager.abort as ReturnType<typeof vi.fn>).mockReturnValue(false);
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-st2", reply);
      events.emit("subagents:rpc:stop", { requestId: "req-st2", agentId: "nonexistent" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: false, error: "Agent not found" });
    });

    it("scopes replies — other requestIds do not receive it", async () => {
      registerRpcHandlers(deps);
      const wrongReply = vi.fn();
      const rightReply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-other", wrongReply);
      events.on("subagents:rpc:stop:reply:req-st3", rightReply);
      events.emit("subagents:rpc:stop", { requestId: "req-st3", agentId: "agent-42" });

      await vi.waitFor(() => expect(rightReply).toHaveBeenCalled());
      expect(wrongReply).not.toHaveBeenCalled();
    });

    it("unsub stops responding to stop requests", async () => {
      const { unsubStop } = registerRpcHandlers(deps);
      unsubStop();

      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-st4", reply);
      events.emit("subagents:rpc:stop", { requestId: "req-st4", agentId: "agent-42" });

      await new Promise((r) => setTimeout(r, 20));
      expect(reply).not.toHaveBeenCalled();
    });

    it("rejects stop when authProvider is configured but returns no identity", async () => {
      deps = { ...deps, authProvider: vi.fn().mockReturnValue(undefined) };
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-stop-denied", reply);
      events.emit("subagents:rpc:stop", { requestId: "req-stop-denied", agentId: "agent-42" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: false, error: "Unauthorized RPC request" });
      expect(manager.abort).not.toHaveBeenCalled();
    });
  });

  // --- concurrent requests ---

  describe("concurrent requests", () => {
    it("handles multiple simultaneous spawn requests independently", async () => {
      let callCount = 0;
      (manager.spawn as ReturnType<typeof vi.fn>).mockImplementation(() => `agent-${++callCount}`);
      registerRpcHandlers(deps);

      const reply1 = vi.fn();
      const reply2 = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-a", reply1);
      events.on("subagents:rpc:spawn:reply:req-b", reply2);

      events.emit("subagents:rpc:spawn", { requestId: "req-a", type: "Explore", prompt: "first" });
      events.emit("subagents:rpc:spawn", { requestId: "req-b", type: "Plan", prompt: "second" });

      await vi.waitFor(() => {
        expect(reply1).toHaveBeenCalled();
        expect(reply2).toHaveBeenCalled();
      });

      expect(reply1).toHaveBeenCalledWith({ success: true, data: { id: "agent-1" } });
      expect(reply2).toHaveBeenCalledWith({ success: true, data: { id: "agent-2" } });
    });
  });

  // --- model override resolution (regression for cross-extension callers
  //     that forward a serializable string instead of a Model object) ---

  describe("spawn RPC model override", () => {
    const fakeModel = { id: "gpt-5.5", provider: "openai-codex", name: "GPT 5.5" };
    const registry = {
      find: (provider: string, id: string) =>
        provider === fakeModel.provider && id === fakeModel.id ? fakeModel : null,
      getAll: () => [fakeModel],
      getAvailable: () => [fakeModel],
    };

    beforeEach(() => {
      ctx = { session: true, modelRegistry: registry };
      deps = { events, pi: { events }, getCtx: () => ctx, manager };
    });

    it("resolves a string model to a Model instance before manager.spawn", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-m1", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-m1", type: "general-purpose", prompt: "x",
        options: { model: "openai-codex/gpt-5.5" },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({ success: true, data: { id: "agent-42" } });
      expect(manager.spawn).toHaveBeenCalledWith(
        deps.pi, ctx, "general-purpose", "x",
        { model: fakeModel },
      );
    });

    it("passes a Model object through unchanged", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-m2", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-m2", type: "general-purpose", prompt: "x",
        options: { model: fakeModel },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(manager.spawn).toHaveBeenCalledWith(
        deps.pi, ctx, "general-purpose", "x",
        { model: fakeModel },
      );
    });

    it("surfaces a clear error when the model string can't be resolved", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-m3", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-m3", type: "general-purpose", prompt: "x",
        options: { model: "nope/does-not-exist" },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const call = (reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.success).toBe(false);
      expect(call.error).toMatch(/Model not found/);
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("errors when ctx has no modelRegistry but a string model is given", async () => {
      ctx = { session: true }; // no modelRegistry
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-m4", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-m4", type: "general-purpose", prompt: "x",
        options: { model: "openai-codex/gpt-5.5" },
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const call = (reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.success).toBe(false);
      expect(call.error).toMatch(/modelRegistry is unavailable/);
      expect(manager.spawn).not.toHaveBeenCalled();
    });
  });

  // --- configurable rate limiting ---

  describe("configurable rate limiting", () => {
    it("respects custom maxPerWindow via configureRateLimit", async () => {
      configureRateLimit({ maxPerWindow: 2 });
      deps = { ...deps, authProvider: vi.fn().mockReturnValue({ extensionId: "cfg-ext" }) };
      registerRpcHandlers(deps);

      // First 2 should succeed.
      for (let i = 0; i < 2; i++) {
        events.emit("subagents:rpc:spawn", {
          requestId: `cfg-${i}`, type: "general-purpose", prompt: "x",
        });
      }

      // Third should be rate limited.
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:cfg-blocked", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "cfg-blocked", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Rate limit exceeded for extension cfg-ext",
      });
    });

    it("applies rateLimit config from RpcDeps at registration", async () => {
      deps = {
        ...deps,
        authProvider: vi.fn().mockReturnValue({ extensionId: "dep-ext" }),
        rateLimit: { maxPerWindow: 1 },
      };
      registerRpcHandlers(deps);

      // First spawn succeeds.
      const reply1 = vi.fn();
      events.on("subagents:rpc:spawn:reply:dep-1", reply1);
      events.emit("subagents:rpc:spawn", {
        requestId: "dep-1", type: "general-purpose", prompt: "x",
      });
      await vi.waitFor(() => expect(reply1).toHaveBeenCalled());
      expect(reply1).toHaveBeenCalledWith({ success: true, data: { id: "agent-42" } });

      // Second spawn is rate limited.
      const reply2 = vi.fn();
      events.on("subagents:rpc:spawn:reply:dep-2", reply2);
      events.emit("subagents:rpc:spawn", {
        requestId: "dep-2", type: "general-purpose", prompt: "x",
      });
      await vi.waitFor(() => expect(reply2).toHaveBeenCalled());
      expect(reply2).toHaveBeenCalledWith({
        success: false, error: "Rate limit exceeded for extension dep-ext",
      });
    });

    it("getRateLimitConfig returns current effective values", () => {
      expect(getRateLimitConfig()).toEqual({ windowMs: 60_000, maxPerWindow: 10 });
      configureRateLimit({ windowMs: 5000, maxPerWindow: 3 });
      expect(getRateLimitConfig()).toEqual({ windowMs: 5000, maxPerWindow: 3 });
    });

    it("resetRpcRateLimitsForTests restores defaults", () => {
      configureRateLimit({ windowMs: 1000, maxPerWindow: 1 });
      resetRpcRateLimitsForTests();
      expect(getRateLimitConfig()).toEqual({ windowMs: 60_000, maxPerWindow: 10 });
    });
  });

  // --- input validation ---

  describe("input validation", () => {
    it("rejects non-object payload with INVALID_PARAMS", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:undefined", reply);
      events.emit("subagents:rpc:ping", "not-an-object" as unknown);

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Expected object payload",
      });
    });

    it("rejects null payload with INVALID_PARAMS", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:undefined", reply);
      events.emit("subagents:rpc:ping", null);

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Expected object payload",
      });
    });

    it("rejects message without requestId", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:undefined", reply);
      events.emit("subagents:rpc:spawn", { type: "general-purpose", prompt: "x" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty requestId",
      });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("rejects message with empty requestId", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:", reply);
      events.emit("subagents:rpc:ping", { requestId: "" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty requestId",
      });
    });

    it("rejects spawn with empty type", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-inv-type", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-inv-type", type: "", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty agent type",
      });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("rejects spawn with non-string type", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-inv-type2", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-inv-type2", type: 123, prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty agent type",
      });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("rejects spawn with empty prompt", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:req-inv-prompt", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "req-inv-prompt", type: "general-purpose", prompt: "",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty prompt",
      });
      expect(manager.spawn).not.toHaveBeenCalled();
    });

    it("rejects stop with empty agentId", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-inv-stop", reply);
      events.emit("subagents:rpc:stop", {
        requestId: "req-inv-stop", agentId: "",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty agentId",
      });
      expect(manager.abort).not.toHaveBeenCalled();
    });

    it("rejects stop with non-string agentId", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:req-inv-stop2", reply);
      events.emit("subagents:rpc:stop", {
        requestId: "req-inv-stop2", agentId: null,
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      expect(reply).toHaveBeenCalledWith({
        success: false, error: "Missing or empty agentId",
      });
      expect(manager.abort).not.toHaveBeenCalled();
    });
  });

  // --- audit trail integration ---

  describe("audit trail", () => {
    it("records an audit entry for successful ping", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:ping:reply:aud-p1", reply);
      events.emit("subagents:rpc:ping", { requestId: "aud-p1" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].operation).toBe("ping");
      expect(log[0].outcome).toBe("success");
      expect(log[0].extensionId).toBe("legacy");
      expect(log[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("records an audit entry for successful spawn", async () => {
      deps = { ...deps, authProvider: vi.fn().mockReturnValue({ extensionId: "aud-ext", extensionName: "AuditTest" }) };
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:aud-s1", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "aud-s1", type: "Explore", prompt: "audit test",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].operation).toBe("spawn");
      expect(log[0].outcome).toBe("success");
      expect(log[0].extensionId).toBe("aud-ext");
      expect(log[0].extensionName).toBe("AuditTest");
    });

    it("records an audit entry for successful stop", async () => {
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:stop:reply:aud-st1", reply);
      events.emit("subagents:rpc:stop", { requestId: "aud-st1", agentId: "agent-42" });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].operation).toBe("stop");
      expect(log[0].outcome).toBe("success");
    });

    it("records error outcome when spawn fails", async () => {
      ctx = undefined;
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:aud-err", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "aud-err", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].outcome).toBe("error");
      expect(log[0].metadata?.error).toBe("No active session");
    });

    it("records rate_limited outcome", async () => {
      configureRateLimit({ maxPerWindow: 1 });
      deps = { ...deps, authProvider: vi.fn().mockReturnValue({ extensionId: "rl-ext" }) };
      registerRpcHandlers(deps);

      // First request consumes the single allowed slot.
      events.emit("subagents:rpc:spawn", {
        requestId: "aud-rl0", type: "general-purpose", prompt: "x",
      });
      // Second hits the limit.
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:aud-rl1", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "aud-rl1", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      const rateLimited = log.filter((e) => e.outcome === "rate_limited");
      expect(rateLimited).toHaveLength(1);
      expect(rateLimited[0].extensionId).toBe("rl-ext");
    });

    it("records unauthorized outcome", async () => {
      deps = { ...deps, authProvider: vi.fn().mockReturnValue(undefined) };
      registerRpcHandlers(deps);
      const reply = vi.fn();
      events.on("subagents:rpc:spawn:reply:aud-unauth", reply);
      events.emit("subagents:rpc:spawn", {
        requestId: "aud-unauth", type: "general-purpose", prompt: "x",
      });

      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      const log = getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].outcome).toBe("unauthorized");
    });

    it("accumulates entries across multiple RPC calls", async () => {
      registerRpcHandlers(deps);

      // Ping
      const pingReply = vi.fn();
      events.on("subagents:rpc:ping:reply:multi-1", pingReply);
      events.emit("subagents:rpc:ping", { requestId: "multi-1" });
      await vi.waitFor(() => expect(pingReply).toHaveBeenCalled());

      // Spawn
      const spawnReply = vi.fn();
      events.on("subagents:rpc:spawn:reply:multi-2", spawnReply);
      events.emit("subagents:rpc:spawn", {
        requestId: "multi-2", type: "general-purpose", prompt: "x",
      });
      await vi.waitFor(() => expect(spawnReply).toHaveBeenCalled());

      // Stop
      const stopReply = vi.fn();
      events.on("subagents:rpc:stop:reply:multi-3", stopReply);
      events.emit("subagents:rpc:stop", { requestId: "multi-3", agentId: "agent-42" });
      await vi.waitFor(() => expect(stopReply).toHaveBeenCalled());

      const log = getAuditLog();
      expect(log).toHaveLength(3);
      expect(log.map((e) => e.operation)).toEqual(["ping", "spawn", "stop"]);
      expect(log.every((e) => e.outcome === "success")).toBe(true);
    });
  });
});
