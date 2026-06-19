/**
 * Unit tests for src/telemetry-otel.ts.
 *
 * The module is library-only — it imports only the @opentelemetry/api
 * interface, not the SDK. The host application is expected to configure a
 * TracerProvider globally. To test span creation in isolation, we mock
 * `@opentelemetry/api` with an in-memory TracerProvider that records every
 * span, attribute, status, end(), and context propagation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory mock TracerProvider ────────────────────────────────────────

type SpanStatus = { code: number; message?: string };

/** A context tagged with the span that is active inside it. The library
 *  treats the context as opaque and passes it to startSpan as parentCtx;
 *  we tag it so tests can verify parent-child propagation. */
interface TaggedContext {
  __span?: MockSpan;
  [key: symbol]: unknown;
}

interface MockSpan {
  __id: number;
  __name: string;
  __attributes: Record<string, unknown>;
  __status: SpanStatus;
  __ended: boolean;
  __endedAt: number | null;
  __parentContext: unknown;
  setAttributes(attributes: Record<string, unknown>): MockSpan;
  setStatus(status: SpanStatus): MockSpan;
  end(time?: number): void;
}

interface MockTracer {
  __name: string;
  __version: string;
  __spans: MockSpan[];
  startSpan(name: string, options?: { attributes?: Record<string, unknown> }, ctx?: unknown): MockSpan;
}

interface MockTracerProvider {
  __tracers: MockTracer[];
  getTracer(name: string, version?: string): MockTracer;
}

const mock = vi.hoisted(() => {
  const ROOT_CTX: TaggedContext = { [Symbol("root-context")]: true };

  function createMockSpan(name: string, attributes: Record<string, unknown>, parentCtx: unknown): MockSpan {
    const id = provider.__tracers.flatMap((t) => t.__spans).length + 1;
    return {
      __id: id,
      __name: name,
      __attributes: { ...attributes },
      __status: { code: 0 },
      __ended: false,
      __endedAt: null,
      __parentContext: parentCtx,
      setAttribute(key, value) {
        this.__attributes[key] = value;
        return this;
      },
      setAttributes(attrs) {
        Object.assign(this.__attributes, attrs);
        return this;
      },
      setStatus(status) {
        this.__status = { ...status };
        return this;
      },
      end(time) {
        this.__ended = true;
        this.__endedAt = time ?? Date.now();
      },
    };
  }

  function createMockTracer(name: string, version: string): MockTracer {
    return {
      __name: name,
      __version: version,
      __spans: [],
      startSpan(spanName, options, ctx) {
        const span = createMockSpan(spanName, options?.attributes ?? {}, ctx);
        this.__spans.push(span);
        return span;
      },
    };
  }

  const provider: MockTracerProvider = {
    __tracers: [],
    // Always create a fresh tracer — matches the OTel SDK semantic where
    // `getTracer` is cheap and providers don't cache by default. This lets
    // us assert that `resetTracer` actually forces a new tracer lookup.
    getTracer(name, version) {
      const tracer = createMockTracer(name, version ?? "");
      this.__tracers.push(tracer);
      return tracer;
    },
  };

  const SpanStatusCode = { OK: 1, ERROR: 2, UNSET: 0 } as const;
  const trace = {
    getTracer(name: string, version?: string) {
      return provider.getTracer(name, version);
    },
    setSpan(ctx: unknown, span: MockSpan | null) {
      if (span === null || span === undefined) return (ctx ?? ROOT_CTX) as TaggedContext;
      return { __span: span } as TaggedContext;
    },
  };
  const context = {
    active() {
      return ROOT_CTX;
    },
  };

  return { provider, trace, context, SpanStatusCode };
});

vi.mock("@opentelemetry/api", () => mock);

// Imports must come AFTER vi.mock so the module under test sees the mock.
import {
  endAgentSpan,
  endCompactionSpan,
  endToolSpan,
  endTurnSpan,
  generateCorrelationId,
  getTracer,
  resetTracer,
  setTracingEnabled,
  startAgentSpan,
  startCompactionSpan,
  startToolSpan,
  startTurnSpan,
} from "../src/telemetry-otel.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function getLibraryTracer(): MockTracer {
  const tracer = mock.provider.__tracers.find((t) => t.__name === "pi-agent-orchestrator");
  if (!tracer) throw new Error("Library tracer was not created");
  return tracer;
}

beforeEach(() => {
  mock.provider.__tracers = [];
  resetTracer();
  // Tracing defaults to enabled in agent-registry.ts; reset to that baseline
  // so short-circuit tests can toggle it off without bleeding state across cases.
  setTracingEnabled(true);
});

// ── getTracer / resetTracer ─────────────────────────────────────────────

describe("getTracer", () => {
  it("lazily creates a tracer scoped to the library name and version", () => {
    expect(mock.provider.__tracers).toHaveLength(0);
    const tracer = getTracer();
    expect(tracer.__name).toBe("pi-agent-orchestrator");
    expect(mock.provider.__tracers).toHaveLength(1);
  });

  it("returns the same tracer instance on subsequent calls (cached)", () => {
    const a = getTracer();
    const b = getTracer();
    expect(a).toBe(b);
    expect(mock.provider.__tracers).toHaveLength(1);
  });

  it("resetTracer forces a new tracer instance on next getTracer call", () => {
    const a = getTracer();
    resetTracer();
    const b = getTracer();
    expect(b).not.toBe(a);
    expect(mock.provider.__tracers).toHaveLength(2);
  });

  it("uses the configured TracerProvider (delegates to trace.getTracer)", () => {
    const tracer = getTracer();
    expect(tracer).toBe(getLibraryTracer());
  });
});

// ── startAgentSpan ───────────────────────────────────────────────────────

describe("startAgentSpan", () => {
  it("creates a span named 'agent.run:<type>' with the agent id and type", () => {
    const { span } = startAgentSpan("agent-123", "Explore");
    expect(span.__name).toBe("agent.run:Explore");
    expect(span.__attributes["agent.id"]).toBe("agent-123");
    expect(span.__attributes["agent.type"]).toBe("Explore");
    expect(span.__ended).toBe(false);
  });

  it("adds optional description, depth, and model attributes when provided", () => {
    const { span } = startAgentSpan("a1", "Plan", {
      description: "Plan the migration",
      depth: 2,
      model: "anthropic/claude-sonnet-4",
    });
    expect(span.__attributes["agent.description"]).toBe("Plan the migration");
    expect(span.__attributes["agent.depth"]).toBe(2);
    expect(span.__attributes["agent.model"]).toBe("anthropic/claude-sonnet-4");
  });

  it("omits optional attributes when not provided", () => {
    const { span } = startAgentSpan("a1", "Explore");
    expect(span.__attributes).not.toHaveProperty("agent.description");
    expect(span.__attributes).not.toHaveProperty("agent.depth");
    expect(span.__attributes).not.toHaveProperty("agent.model");
  });

  it("returns an active context that points to the new span", () => {
    const { span, ctx } = startAgentSpan("a1", "Explore");
    expect((ctx as TaggedContext).__span).toBe(span);
  });

  it("starts a new span each call (no reuse)", () => {
    const { span: s1 } = startAgentSpan("a1", "Explore");
    const { span: s2 } = startAgentSpan("a2", "Explore");
    expect(s1).not.toBe(s2);
    expect(getLibraryTracer().__spans).toHaveLength(2);
  });
});

// ── endAgentSpan ─────────────────────────────────────────────────────────

describe("endAgentSpan", () => {
  it("sets OK status and records duration + token metrics on the span", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1234,
      turns: 3,
      toolCalls: 5,
      tokensIn: 1000,
      tokensOut: 500,
    });
    expect(span.__status.code).toBe(1); // OK
    expect(span.__ended).toBe(true);
    expect(span.__attributes["agent.status"]).toBe("completed");
    expect(span.__attributes["agent.duration_ms"]).toBe(1234);
    expect(span.__attributes["agent.turns"]).toBe(3);
    expect(span.__attributes["agent.tool_calls"]).toBe(5);
    expect(span.__attributes["agent.tokens_in"]).toBe(1000);
    expect(span.__attributes["agent.tokens_out"]).toBe(500);
  });

  it("includes cache-write attribute when positive", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensCacheWrite: 250,
    });
    expect(span.__attributes["agent.tokens_cache_write"]).toBe(250);
  });

  it("omits cache-write attribute when zero (source gates on > 0)", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensCacheWrite: 0,
    });
    expect(span.__attributes).not.toHaveProperty("agent.tokens_cache_write");
  });

  it("omits cache-write attribute when negative (source gates on > 0)", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensCacheWrite: -1,
    });
    expect(span.__attributes).not.toHaveProperty("agent.tokens_cache_write");
  });

  it("records validated=true as an attribute", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      validated: true,
    });
    expect(span.__attributes["agent.validated"]).toBe(true);
  });

  it("records validated=false as an attribute (source gates on !== undefined)", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      validated: false,
    });
    expect(span.__attributes["agent.validated"]).toBe(false);
  });

  it("omits validated attribute when undefined", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(span.__attributes).not.toHaveProperty("agent.validated");
  });

  it("sets ERROR status for 'error' result and includes the error message", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "error",
      durationMs: 500,
      turns: 1,
      toolCalls: 0,
      tokensIn: 100,
      tokensOut: 50,
      error: "Boom",
    });
    expect(span.__status.code).toBe(2); // ERROR
    // Note: the library intentionally surfaces the error via the OTel
    // status message, not as a span attribute.
    expect(span.__status.message).toBe("Boom");
    expect(span.__ended).toBe(true);
  });

  it("sets ERROR status for 'aborted' result with default message when none provided", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "aborted",
      durationMs: 100,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(span.__status.code).toBe(2);
    expect(span.__status.message).toBe("Agent aborted");
  });

  it("treats 'steered' as OK (lifecycle still successful)", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "steered",
      durationMs: 200,
      turns: 2,
      toolCalls: 1,
      tokensIn: 50,
      tokensOut: 25,
    });
    expect(span.__status.code).toBe(1);
  });

  it("ends the span and records the end timestamp", () => {
    const { span } = startAgentSpan("a1", "Explore");
    endAgentSpan(span, {
      status: "completed",
      durationMs: 1,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
    });
    expect(span.__ended).toBe(true);
    expect(span.__endedAt).not.toBeNull();
  });
});

// ── startToolSpan / endToolSpan ──────────────────────────────────────────

describe("startToolSpan / endToolSpan", () => {
  it("creates a 'tool.call' span with the agent id and tool name", () => {
    const span = startToolSpan("a1", "read");
    expect(span.__name).toBe("tool.call");
    expect(span.__attributes["agent.id"]).toBe("a1");
    expect(span.__attributes["tool.name"]).toBe("read");
  });

  it("passes the parent context to the tracer for proper hierarchy", () => {
    const { ctx } = startAgentSpan("a1", "Explore");
    const span = startToolSpan("a1", "read", ctx);
    expect(span.__parentContext).toBe(ctx);
  });

  it("works without a parent context (root span)", () => {
    const span = startToolSpan("a1", "read");
    expect(span.__parentContext).toBeUndefined();
    expect(span.__ended).toBe(false);
  });

  it("endToolSpan sets OK status when no error is given", () => {
    const span = startToolSpan("a1", "read");
    endToolSpan(span);
    expect(span.__status.code).toBe(1);
    expect(span.__ended).toBe(true);
  });

  it("endToolSpan sets ERROR status and message when an error is given", () => {
    const span = startToolSpan("a1", "bash");
    endToolSpan(span, "command failed");
    expect(span.__status.code).toBe(2);
    expect(span.__status.message).toBe("command failed");
  });
});

// ── startTurnSpan / endTurnSpan ──────────────────────────────────────────

describe("startTurnSpan / endTurnSpan", () => {
  it("creates an 'agent.turn' span with the turn number", () => {
    const span = startTurnSpan("a1", 7);
    expect(span.__name).toBe("agent.turn");
    expect(span.__attributes["agent.id"]).toBe("a1");
    expect(span.__attributes["turn.number"]).toBe(7);
  });

  it("propagates the agent context to keep the turn as a child of the agent span", () => {
    const { ctx } = startAgentSpan("a1", "Explore");
    const turnSpan = startTurnSpan("a1", 1, ctx);
    expect(turnSpan.__parentContext).toBe(ctx);
  });

  it("endTurnSpan always sets OK and ends the span", () => {
    const span = startTurnSpan("a1", 1);
    endTurnSpan(span);
    expect(span.__status.code).toBe(1);
    expect(span.__ended).toBe(true);
  });
});

// ── startCompactionSpan / endCompactionSpan ──────────────────────────────

describe("startCompactionSpan / endCompactionSpan", () => {
  it("creates an 'agent.compaction' span with reason and tokens-before", () => {
    const span = startCompactionSpan("a1", "threshold", 12345);
    expect(span.__name).toBe("agent.compaction");
    expect(span.__attributes["agent.id"]).toBe("a1");
    expect(span.__attributes["compaction.reason"]).toBe("threshold");
    expect(span.__attributes["compaction.tokens_before"]).toBe(12345);
  });

  it("inherits the agent context for the parent-child hierarchy", () => {
    const { ctx } = startAgentSpan("a1", "Explore");
    const compactionSpan = startCompactionSpan("a1", "threshold", 9999, ctx);
    expect(compactionSpan.__parentContext).toBe(ctx);
  });

  it("endCompactionSpan always sets OK and ends the span", () => {
    const span = startCompactionSpan("a1", "manual", 500);
    endCompactionSpan(span);
    expect(span.__status.code).toBe(1);
    expect(span.__ended).toBe(true);
  });
});

// ── Span hierarchy (integration) ─────────────────────────────────────────

describe("span hierarchy end-to-end", () => {
  it("agent → turn → tool spans form a connected tree via context propagation", () => {
    // Root agent span
    const { span: agentSpan, ctx: agentCtx } = startAgentSpan("a1", "Explore");

    // Two turns, each with a tool call
    const turn1 = startTurnSpan("a1", 1, agentCtx);
    const tool1 = startToolSpan("a1", "read", agentCtx);
    endToolSpan(tool1);
    endTurnSpan(turn1);

    const turn2 = startTurnSpan("a1", 2, agentCtx);
    const tool2 = startToolSpan("a1", "search", agentCtx);
    endToolSpan(tool2);
    endTurnSpan(turn2);

    // A compaction event under the agent
    const compaction = startCompactionSpan("a1", "threshold", 50000, agentCtx);
    endCompactionSpan(compaction);

    // Close the agent
    endAgentSpan(agentSpan, {
      status: "completed",
      durationMs: 5000,
      turns: 2,
      toolCalls: 2,
      tokensIn: 100,
      tokensOut: 50,
    });

    // All 6 spans (agent + 2 turns + 2 tools + 1 compaction) were created
    // in the library tracer
    const spans = getLibraryTracer().__spans;
    expect(spans).toHaveLength(6);
    expect(spans.map((s) => s.__name)).toEqual([
      "agent.run:Explore",
      "agent.turn",
      "tool.call",
      "agent.turn",
      "tool.call",
      "agent.compaction",
    ]);

    // All child spans were created with the agent context as parent
    for (const s of spans.slice(1)) {
      expect(s.__parentContext).toBe(agentCtx);
    }

    // All spans are ended
    for (const s of spans) {
      expect(s.__ended).toBe(true);
    }

    // The agent span is the only one with status/result attributes
    expect(agentSpan.__attributes["agent.status"]).toBe("completed");
    expect(agentSpan.__attributes["agent.turns"]).toBe(2);
  });

  it("parallel agents do not share context — each has its own parent chain", () => {
    const { ctx: ctx1, span: agent1 } = startAgentSpan("a1", "Explore");
    const { ctx: ctx2, span: agent2 } = startAgentSpan("a2", "Explore");

    const t1 = startTurnSpan("a1", 1, ctx1);
    const t2 = startTurnSpan("a2", 1, ctx2);

    expect(ctx1).not.toBe(ctx2);
    expect((ctx1 as TaggedContext).__span).toBe(agent1);
    expect((ctx2 as TaggedContext).__span).toBe(agent2);
    expect(t1.__parentContext).toBe(ctx1);
    expect(t2.__parentContext).toBe(ctx2);
  });
});

// ── No-op safety (sanity) ────────────────────────────────────────────────

describe("no-op safety", () => {
  it("endAgentSpan on a span with zero metrics does not throw", () => {
    const { span } = startAgentSpan("a1", "Explore");
    expect(() =>
      endAgentSpan(span, {
        status: "completed",
        durationMs: 0,
        turns: 0,
        toolCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
      }),
    ).not.toThrow();
  });
});

// ── tracingEnabled short-circuit ─────────────────────────────────────────

describe("tracingEnabled short-circuit", () => {
  it("startAgentSpan returns the shared no-op span when tracing is disabled", () => {
    setTracingEnabled(false);
    const beforeTracerCount = mock.provider.__tracers.length;
    const { span, ctx } = startAgentSpan("a1", "Explore");
    // No new tracer was created — we short-circuited before calling getTracer()
    expect(mock.provider.__tracers.length).toBe(beforeTracerCount);
    // No real span was pushed to any tracer
    const allSpans = mock.provider.__tracers.flatMap((t) => t.__spans);
    expect(allSpans).toHaveLength(0);
    // The no-op span reports empty context and is not recording
    expect(span.spanContext().traceId).toBe("");
    expect(span.spanContext().spanId).toBe("");
    expect(span.isRecording()).toBe(false);
    // ctx is the active context (not a tagged one)
    expect(ctx).toBe(mock.context.active());
  });

  it("startToolSpan / startTurnSpan / startCompactionSpan all return the no-op span when disabled", () => {
    setTracingEnabled(false);
    const beforeTracerCount = mock.provider.__tracers.length;
    const toolSpan = startToolSpan("a1", "read");
    const turnSpan = startTurnSpan("a1", 1);
    const compactionSpan = startCompactionSpan("a1", "threshold", 5000);
    expect(mock.provider.__tracers.length).toBe(beforeTracerCount);
    for (const s of [toolSpan, turnSpan, compactionSpan]) {
      expect(s.isRecording()).toBe(false);
      expect(s.spanContext().traceId).toBe("");
    }
  });

  it("end*Span helpers accept the no-op span without throwing", () => {
    setTracingEnabled(false);
    const { span } = startAgentSpan("a1", "Explore");
    const toolSpan = startToolSpan("a1", "read");
    const turnSpan = startTurnSpan("a1", 1);
    const compactionSpan = startCompactionSpan("a1", "threshold", 5000);
    expect(() =>
      endAgentSpan(span, {
        status: "completed",
        durationMs: 100,
        turns: 1,
        toolCalls: 1,
        tokensIn: 10,
        tokensOut: 5,
      }),
    ).not.toThrow();
    expect(() => endToolSpan(toolSpan)).not.toThrow();
    expect(() => endToolSpan(toolSpan, "boom")).not.toThrow();
    expect(() => endTurnSpan(turnSpan)).not.toThrow();
    expect(() => endCompactionSpan(compactionSpan)).not.toThrow();
  });

  it("re-enabling tracing restores normal span creation", () => {
    setTracingEnabled(false);
    startAgentSpan("a1", "Explore"); // no-op
    expect(mock.provider.__tracers.flatMap((t) => t.__spans)).toHaveLength(0);
    setTracingEnabled(true);
    const { span } = startAgentSpan("a2", "Explore");
    expect(span.__name).toBe("agent.run:Explore");
    expect(mock.provider.__tracers.flatMap((t) => t.__spans).length).toBeGreaterThanOrEqual(1);
  });
});

// ── Correlation IDs ──────────────────────────────────────────────────────

describe("correlation IDs", () => {
  it("generateCorrelationId returns an 8-char hex string", () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generateCorrelationId returns unique values across calls (collision check)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateCorrelationId());
    expect(ids.size).toBe(100);
  });

  it("startAgentSpan attaches the provided correlationId as the OTel attribute", () => {
    const { span } = startAgentSpan("a1", "Explore", { correlationId: "deadbeef" });
    expect(span.__attributes["correlation.id"]).toBe("deadbeef");
  });

  it("startAgentSpan omits the correlation.id attribute when not provided", () => {
    const { span } = startAgentSpan("a1", "Explore");
    expect(span.__attributes).not.toHaveProperty("correlation.id");
  });

  it("startAgentSpan echoes the correlationId on the return value", () => {
    const r = startAgentSpan("a1", "Explore", { correlationId: "abc12345" });
    expect(r.correlationId).toBe("abc12345");
  });

  it("startAgentSpan echoes undefined when no correlationId is provided", () => {
    const r = startAgentSpan("a1", "Explore");
    expect(r.correlationId).toBeUndefined();
  });

  it("the correlation.id attribute survives endAgentSpan's attribute pass", () => {
    const { span } = startAgentSpan("a1", "Explore", { correlationId: "feedface" });
    endAgentSpan(span, {
      status: "completed",
      durationMs: 10,
      turns: 1,
      toolCalls: 0,
      tokensIn: 1,
      tokensOut: 1,
    });
    expect(span.__attributes["correlation.id"]).toBe("feedface");
  });

  it("correlationId is still echoed on the return value when tracing is disabled (so log helpers can read it)", () => {
    setTracingEnabled(false);
    const beforeTracerCount = mock.provider.__tracers.length;
    const r = startAgentSpan("a1", "Explore", { correlationId: "11223344" });
    // No tracer was created — we short-circuited before calling getTracer().
    expect(mock.provider.__tracers.length).toBe(beforeTracerCount);
    // The no-op span is returned and reports not-recording.
    expect(r.span.isRecording()).toBe(false);
    // The active context is still returned (callers that pass it to child-span
    // helpers must keep working even when tracing is disabled).
    expect(r.ctx).toBe(mock.context.active());
    // The correlationId is echoed on the return value so log helpers can
    // tag log lines with it even when no real span exists.
    expect(r.correlationId).toBe("11223344");
  });
});
