/**
 * Integration tests for OpenTelemetry span emission in src/agent-runner.ts.
 *
 * Drives a real `runAgent` invocation with a controlled session event
 * sequence and asserts the spans recorded by the mock TracerProvider
 * arrive in the expected order, with the right parent-child hierarchy,
 * attributes, and final status.
 *
 * Complements test/telemetry-otel.test.ts (unit-tests the bridge module in
 * isolation). Here we verify the bridge is wired into the agent-runner
 * lifecycle correctly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── OTel mock (focused: tracks span creation + deterministic end order) ─

type SpanStatus = { code: number; message?: string };

interface MockSpan {
  __id: number;
  __name: string;
  __attributes: Record<string, unknown>;
  __status: SpanStatus;
  __ended: boolean;
  /** Monotonic counter incremented on each `end()` call. Reliable even when
   *  multiple spans end in the same millisecond. */
  __endOrder: number;
  __parentContext: unknown;
  setAttributes(attrs: Record<string, unknown>): MockSpan;
  setStatus(status: SpanStatus): MockSpan;
  end(): void;
}

const mock = vi.hoisted(() => {
  const ROOT_CTX: Record<symbol, unknown> = { [Symbol("root")]: true };
  const spans: MockSpan[] = [];
  let nextSpanId = 0;
  let nextEndOrder = 0;

  // Cache the tracer by (name, version) — matches real OTel SDK behavior.
  // Without this, every `getTracer` call would return a new tracer and the
  // test would lose the ability to group spans by library.
  const tracerCache = new Map<string, ReturnType<typeof createTracer>>();

  function createTracer() {
    return {
      startSpan(
        spanName: string,
        options?: { attributes?: Record<string, unknown> },
        ctx?: unknown,
      ): MockSpan {
        const span: MockSpan = {
          __id: ++nextSpanId,
          __name: spanName,
          __attributes: { ...(options?.attributes ?? {}) },
          __status: { code: 0 },
          __ended: false,
          __endOrder: 0,
          __parentContext: ctx,
          setAttributes(attrs) {
            Object.assign(this.__attributes, attrs);
            return this;
          },
          setStatus(status) {
            this.__status = { ...status };
            return this;
          },
          end() {
            this.__ended = true;
            this.__endOrder = ++nextEndOrder;
          },
        };
        spans.push(span);
        return span;
      },
    };
  }    const provider = {
    getTracer(name: string, version?: string) {
      const key = `${name}@${version ?? ""}`;
      let tracer = tracerCache.get(key);
      if (!tracer) {
        tracer = createTracer();
        tracerCache.set(key, tracer);
      }
      return tracer;
    },
  };

  const trace = {
    getTracer(name: string, version?: string) {
      return provider.getTracer(name, version);
    },
    // Always returns a fresh tagged context — never mutates the input.
    setSpan(ctx: unknown, span: MockSpan | null | undefined) {
      if (span == null) return (ctx ?? ROOT_CTX) as Record<symbol, unknown>;
      return {
        ...((ctx ?? ROOT_CTX) as object),
        [Symbol.for("active-span")]: span,
      };
    },
  };
  const context = { active: () => ROOT_CTX };
  const SpanStatusCode = { OK: 1, ERROR: 2, UNSET: 0 } as const;

  function reset() {
    spans.length = 0;
    tracerCache.clear();
    nextSpanId = 0;
    nextEndOrder = 0;
  }

  return { spans, provider, trace, context, SpanStatusCode, ROOT_CTX, reset };
});

vi.mock("@opentelemetry/api", () => mock);

// ── Module mocks for the agent-runner session surface ───────────────────

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
    constructor(options: unknown) {
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
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    promptMode: "replace",
  })),
  getAgentConfig: vi.fn(() => ({
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    systemPrompt: "You are Explore.",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
  })),
  getMemoryToolNames: vi.fn(() => []),
  getReadOnlyMemoryToolNames: vi.fn(() => []),
  getToolNamesForType: vi.fn(() => ["read"]),
}));

vi.mock("../src/env.js", () => ({
  detectEnv: vi.fn(async () => ({ isGitRepo: false, branch: "", platform: "linux" })),
}));

vi.mock("../src/prompts.js", () => ({
  buildAgentPrompt: vi.fn(() => "system prompt"),
}));

vi.mock("../src/memory.js", () => ({
  buildMemoryBlock: vi.fn(() => ""),
  buildReadOnlyMemoryBlock: vi.fn(() => ""),
}));

vi.mock("../src/skill-loader.js", () => ({
  preloadSkills: vi.fn(() => []),
}));

import { runAgent } from "../src/agent-runner.js";
import { resetTracer } from "../src/telemetry-otel.js";

// ── Session harness ─────────────────────────────────────────────────────

type EventHandler = (event: any) => void;

function createSession() {
  const listeners: EventHandler[] = [];
  const session = {
    messages: [] as any[],
    subscribe: vi.fn((listener: EventHandler) => {
      listeners.push(listener);
      return () => {};
    }),
    prompt: vi.fn(async () => {}),
    abort: vi.fn(),
    steer: vi.fn(),
    getActiveToolNames: vi.fn(() => ["read"]),
    setActiveToolsByName: vi.fn(),
    setSessionName: vi.fn(),
    bindExtensions: vi.fn(async () => {}),
  };
  return { session, listeners };
}

function emit(listeners: EventHandler[], event: any) {
  for (const l of listeners) l(event);
}

/** Drive a complete two-turn session: 2 tool calls, 2 assistant messages, 1 compaction. */
function emitHappyPath(listeners: EventHandler[]) {
  // Turn 1
  emit(listeners, { type: "turn_start" });
  emit(listeners, { type: "tool_execution_start", toolName: "read" });
  emit(listeners, { type: "tool_execution_end", toolName: "read" });
  emit(listeners, { type: "message_start" });
  emit(listeners, {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "Hello" },
  });
  emit(listeners, {
    type: "message_end",
    message: { role: "assistant", usage: { input: 10, output: 5, cacheWrite: 2 } },
  });
  emit(listeners, { type: "turn_end" });
  // Turn 2
  emit(listeners, { type: "turn_start" });
  emit(listeners, { type: "tool_execution_start", toolName: "search" });
  emit(listeners, { type: "tool_execution_end", toolName: "search" });
  emit(listeners, { type: "message_start" });
  emit(listeners, {
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: " world" },
  });
  emit(listeners, {
    type: "message_end",
    message: { role: "assistant", usage: { input: 20, output: 10, cacheWrite: 4 } },
  });
  emit(listeners, { type: "turn_end" });
  // Compaction (event span)
  emit(listeners, {
    type: "compaction_end",
    aborted: false,
    reason: "threshold",
    result: { tokensBefore: 5000 },
  });
}

const ctx = {
  cwd: "/tmp",
  model: { provider: "test", id: "test-model" },
  modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
  getSystemPrompt: vi.fn(() => "parent prompt"),
  sessionManager: { getBranch: vi.fn(() => []) },
} as any;

const pi = {} as any;

beforeEach(() => {
  // Reset the library's tracer cache so each test exercises the mock's
  // tracer lookup (otherwise the module-level `_tracer` would be reused
  // and the mock's cache would be effectively dead).
  resetTracer();
  mock.reset();
  createAgentSession.mockReset();
  defaultResourceLoaderCtor.mockClear();
  getAgentDir.mockClear();
  sessionManagerInMemory.mockClear();
  settingsManagerCreate.mockClear();
});

// ── Helpers for assertions ──────────────────────────────────────────────

function spanByName(name: string): MockSpan {
  const span = mock.spans.find((s) => s.__name === name);
  if (!span) throw new Error(`No span named ${name}; have: ${mock.spans.map((s) => s.__name).join(", ")}`);
  return span;
}

function allSpansByName(name: string): MockSpan[] {
  return mock.spans.filter((s) => s.__name === name);
}

function byEndOrder(spans: MockSpan[]): MockSpan[] {
  return [...spans].sort((a, b) => a.__endOrder - b.__endOrder);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("agent-runner → OTel integration", () => {
  it("emits the expected span sequence for a multi-turn, multi-tool session", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    // 1 agent + 2 turns + 2 tools + 1 compaction = 6 spans, in this order
    expect(mock.spans.map((s) => s.__name)).toEqual([
      "agent.run:Explore",
      "agent.turn",
      "tool.call",
      "agent.turn",
      "tool.call",
      "agent.compaction",
    ]);
  });

  it("ends spans in lifecycle order (tools before turns, agent last)", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    // Every span must be ended (also asserts no leak).
    for (const s of mock.spans) {
      expect(s.__ended).toBe(true);
    }

    // End order: tool → turn → tool → turn → compaction → agent.
    // The `__endOrder` counter is monotonic across end() calls, so this is
    // stable even when multiple spans end in the same millisecond.
    expect(byEndOrder(mock.spans).map((s) => s.__name)).toEqual([
      "tool.call", // read end
      "agent.turn", // turn 1 end
      "tool.call", // search end
      "agent.turn", // turn 2 end
      "agent.compaction", // start+end within same event
      "agent.run:Explore", // closed after prompt returns
    ]);
  });

  it("links every child span to the agent context (parent-child hierarchy)", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    const agentSpan = spanByName("agent.run:Explore");
    // The agent span is the only one without a parent context (it's the root)
    expect(agentSpan.__parentContext).toBeUndefined();
    // All other spans should be tagged with the agent span
    for (const s of mock.spans.slice(1)) {
      const tagged = s.__parentContext as Record<symbol, unknown>;
      expect(tagged[Symbol.for("active-span")]).toBe(agentSpan);
    }
  });

  it("numbers the turn spans in lifecycle order and tags tools with their name", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    const turnSpans = allSpansByName("agent.turn");
    expect(turnSpans.map((s) => s.__attributes["turn.number"])).toEqual([1, 2]);

    const toolSpans = allSpansByName("tool.call");
    expect(toolSpans.map((s) => s.__attributes["tool.name"])).toEqual(["read", "search"]);
  });

  it("records the compaction reason and tokens-before on the agent.compaction span", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    const compaction = spanByName("agent.compaction");
    expect(compaction.__attributes["agent.id"]).toBe("a1");
    expect(compaction.__attributes["compaction.reason"]).toBe("threshold");
    expect(compaction.__attributes["compaction.tokens_before"]).toBe(5000);
    // Compaction is an event span — created and ended within the same
    // event handler, so the end invariant must hold by the time runAgent
    // returns.
    expect(compaction.__ended).toBe(true);
  });

  it("does not create a span on compaction_start (only compaction_end emits one)", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emit(listeners, { type: "compaction_start", reason: "threshold" });
      emit(listeners, { type: "turn_start" });
      emit(listeners, { type: "turn_end" });
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    // Agent + turn, no compaction span (compaction_end never fired)
    expect(mock.spans.map((s) => s.__name)).toEqual(["agent.run:Explore", "agent.turn"]);
  });

  it("writes the final lifecycle attributes onto the agent span (status, turns, tokens)", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      emitHappyPath(listeners);
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      });
    });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1" });

    const agentSpan = spanByName("agent.run:Explore");
    // Aggregated from the two message_end events (10+20, 5+10, 2+4)
    expect(agentSpan.__attributes["agent.status"]).toBe("completed");
    expect(agentSpan.__attributes["agent.turns"]).toBe(2);
    expect(agentSpan.__attributes["agent.tool_calls"]).toBe(2);
    expect(agentSpan.__attributes["agent.tokens_in"]).toBe(30);
    expect(agentSpan.__attributes["agent.tokens_out"]).toBe(15);
    expect(agentSpan.__attributes["agent.tokens_cache_write"]).toBe(6);
    expect(agentSpan.__status.code).toBe(1); // OK
  });

  it("sets ERROR status on the agent span when session.prompt throws, with no child spans", async () => {
    const { session } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      throw new Error("LLM provider unavailable");
    });

    await expect(runAgent(ctx, "Explore", "go", { pi, agentId: "a1" })).rejects.toThrow(
      "LLM provider unavailable",
    );

    // No events fired before the throw, so only the agent span exists.
    expect(mock.spans).toHaveLength(1);
    expect(mock.spans[0].__name).toBe("agent.run:Explore");

    const agentSpan = mock.spans[0];
    expect(agentSpan.__status.code).toBe(2); // ERROR
    expect(agentSpan.__status.message).toBe("LLM provider unavailable");
    expect(agentSpan.__ended).toBe(true);
    expect(agentSpan.__attributes["agent.status"]).toBe("error");
    expect(agentSpan.__parentContext).toBeUndefined();
  });

  it("sets ERROR status with 'Agent aborted' message when the tool-call quota trips", async () => {
    const { session, listeners } = createSession();
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      // maxToolCalls: 2, so the third tool_execution_start trips the quota
      // and the runner sets aborted=true + session.abort(). The prompt
      // resolves normally afterwards.
      for (let i = 0; i < 3; i++) {
        emit(listeners, { type: "tool_execution_start", toolName: `tool${i}` });
        emit(listeners, { type: "tool_execution_end", toolName: `tool${i}` });
      }
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "OK" }],
      });
    });

    await runAgent(ctx, "Explore", "go", {
      pi,
      agentId: "a1",
      quotas: { maxToolCalls: 2 },
    });

    const agentSpan = spanByName("agent.run:Explore");
    expect(agentSpan.__attributes["agent.status"]).toBe("aborted");
    expect(agentSpan.__status.code).toBe(2); // ERROR
    expect(agentSpan.__status.message).toBe("Agent aborted");
    expect(session.abort).toHaveBeenCalled();
  });

  it("parallel agents emit independent span trees that do not share parent context", async () => {
    // Pre-build both sessions; route each runAgent call to its own session.
    const sessionA = createSession();
    const sessionB = createSession();
    createAgentSession
      .mockImplementationOnce(async () => ({ session: sessionA.session }))
      .mockImplementationOnce(async () => ({ session: sessionB.session }));

    sessionA.session.prompt = vi.fn(async () => {
      emit(sessionA.listeners, { type: "turn_start" });
      emit(sessionA.listeners, { type: "tool_execution_start", toolName: "read" });
      emit(sessionA.listeners, { type: "tool_execution_end", toolName: "read" });
      emit(sessionA.listeners, { type: "message_start" });
      emit(sessionA.listeners, {
        type: "message_end",
        message: { role: "assistant", usage: { input: 1, output: 1, cacheWrite: 0 } },
      });
      emit(sessionA.listeners, { type: "turn_end" });
      sessionA.session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "A" }],
      });
    });

    sessionB.session.prompt = vi.fn(async () => {
      emit(sessionB.listeners, { type: "turn_start" });
      emit(sessionB.listeners, { type: "tool_execution_start", toolName: "search" });
      emit(sessionB.listeners, { type: "tool_execution_end", toolName: "search" });
      emit(sessionB.listeners, { type: "message_start" });
      emit(sessionB.listeners, {
        type: "message_end",
        message: { role: "assistant", usage: { input: 2, output: 2, cacheWrite: 0 } },
      });
      emit(sessionB.listeners, { type: "turn_end" });
      sessionB.session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "B" }],
      });
    });

    await Promise.all([
      runAgent(ctx, "Explore", "first", { pi, agentId: "a1" }),
      runAgent(ctx, "Explore", "second", { pi, agentId: "a2" }),
    ]);

    // Two agent spans, one turn each, one tool each
    const agentSpans = allSpansByName("agent.run:Explore");
    expect(agentSpans).toHaveLength(2);
    expect(agentSpans[0].__attributes["agent.id"]).toBe("a1");
    expect(agentSpans[1].__attributes["agent.id"]).toBe("a2");

    // The two agent spans have different parent contexts (both undefined as
    // they're roots, but the contexts they create are distinct).
    const toolSpans = allSpansByName("tool.call");
    expect(toolSpans).toHaveLength(2);
    const toolParents = toolSpans.map((t) => t.__parentContext);
    expect(toolParents[0]).not.toBe(toolParents[1]);

    // Each tool's parent context points at its own agent span
    for (const tool of toolSpans) {
      const tagged = tool.__parentContext as Record<symbol, unknown>;
      const parent = tagged[Symbol.for("active-span")];
      expect(agentSpans).toContain(parent);
    }
  });
});
