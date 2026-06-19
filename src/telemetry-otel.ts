/**
 * telemetry-otel.ts — OpenTelemetry span export bridge.
 *
 * Provides no-op-safe OpenTelemetry span creation for agent lifecycle events.
 * Uses the global @opentelemetry/api tracer — if the host application hasn't
 * configured a TracerProvider, all operations are zero-cost no-ops.
 *
 * Architecture:
 *   - Only imports from @opentelemetry/api (the interface, not the SDK)
 *   - The host application is responsible for configuring the TracerProvider
 *     and exporters (Console, OTLP, Jaeger, etc.)
 *   - This module creates spans at meaningful lifecycle points with proper
 *     parent-child relationships via context propagation
 *
 * Span hierarchy (when a TracerProvider is configured):
 *   agent.run:Explore
 *   ├── agent.turn:1
 *   │   ├── tool.call:read
 *   │   └── tool.call:write
 *   ├── agent.turn:2
 *   │   └── tool.call:search
 *   └── agent.compaction (event, duration ~0)
 */

import { randomUUID } from "node:crypto";
import {
  type Context,
  context,
  type Span,
  SpanStatusCode,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { isTracingEnabled, setTracingEnabled } from "./agent-registry.js";

// Re-export the tracing-enabled setter so callers (tests, future runtime
// toggles) can flip the gate without taking a second dependency on
// agent-registry. The getter stays internal because callers should use the
// `isTracingEnabled()` call inside this module to check the flag.
export { setTracingEnabled };

/** OpenTelemetry attribute name for the per-agent correlation id. */
export const CORRELATION_ID_ATTRIBUTE = "correlation.id";

/**
 * Generate a short correlation id (8 hex chars, derived from a v4 UUID).
 * Cheap (~one crypto call) and collision-resistant for one session — the
 * underlying UUID v4 is uniformly random, and the 32-bit prefix is plenty
 * to tie a subagent run + its spans + its log lines together in `/agents
 * health` and in the dashboard.
 *
 * The id is stable for the lifetime of an agent record (set at spawn,
 * preserved across `resumeAgent`), so re-running an agent keeps the same
 * correlation id and traces line up.
 */
export function generateCorrelationId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/** Library name for scoped tracer identification. */
export const TRACER_NAME = "pi-agent-orchestrator";
export const TRACER_VERSION = "0.14.1";

/** Cache the tracer instance — lazy-created on first use. */
let _tracer: Tracer | undefined;

/** Get a tracer scoped to this library. No-op safe. */
export function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);
  }
  return _tracer;
}

/** Invalidate cached tracer (for testing after TracerProvider changes). */
export function resetTracer(): void {
  _tracer = undefined;
}

/**
 * Shared no-op span. Returned by every `start*Span` helper when the runtime
 * `tracingEnabled` setting is `false`. All mutator methods are chainable
 * no-ops that return the same reference, so the `end*Span` helpers can call
 * `setStatus` / `end` on it without any conditional at the call site.
 *
 * The `as unknown as Span` cast is intentional: implementing the full
 * ~20-method OTel `Span` interface just to make every method a no-op would
 * add noise. The OTel SDK's own no-op span (returned when no provider is
 * registered) follows the same pattern — a minimal object that satisfies
 * the structural shape callers actually exercise.
 */
const NOOP_SPAN = {
  spanContext: () => ({ traceId: "", spanId: "", traceFlags: 0 }),
  setAttribute: function () { return this; },
  setAttributes: function () { return this; },
  addEvent: function () { return this; },
  addLink: function () { return this; },
  addLinks: function () { return this; },
  recordException: function () { return this; },
  updateName: function () { return this; },
  setStatus: function () { return this; },
  end: function () { return this; },
  isRecording: () => false,
} as unknown as Span;

// ── Span helpers ──────────────────────────────────────────────────────────

/**
 * Start an agent lifecycle span and return both the span and an active
 * context so child spans (tool, turn, compaction) inherit the parent.
 *
 * If `options.correlationId` is provided it is attached as the OTel
 * `correlation.id` attribute (so the value is queryable through the OTel
 * SDK's normal `getSpanAttribute` / `attributes` accessors) and is also
 * echoed back on the result. The runner does not depend on this return
 * value — the agent record is the source of truth for correlation ids —
 * but tests and ad-hoc log helpers can read it without an extra import.
 */
export function startAgentSpan(
  agentId: string,
  type: string,
  options?: {
    description?: string;
    depth?: number;
    model?: string;
    correlationId?: string;
  },
): { span: Span; ctx: Context; correlationId?: string } {
  // Short-circuit when the user has disabled OTel span emission. The
  // returned span is a shared no-op so child-span helpers receive a
  // valid (but useless) parent context, and `endAgentSpan` can call
  // its methods without conditional checks at the call site. The
  // correlation id is still surfaced for log helpers that want it.
  if (!isTracingEnabled()) {
    return {
      span: NOOP_SPAN,
      ctx: context.active(),
      correlationId: options?.correlationId,
    };
  }
  const tracer = getTracer();
  const span = tracer.startSpan(`agent.run:${type}`, {
    attributes: {
      "agent.id": agentId,
      "agent.type": type,
      ...(options?.description ? { "agent.description": options.description } : {}),
      ...(options?.depth !== undefined ? { "agent.depth": options.depth } : {}),
      ...(options?.model ? { "agent.model": options.model } : {}),
      ...(options?.correlationId
        ? { [CORRELATION_ID_ATTRIBUTE]: options.correlationId }
        : {}),
    },
  });
  const ctx = trace.setSpan(context.active(), span);
  return { span, ctx, correlationId: options?.correlationId };
}

/**
 * End an agent span with completion status and metrics.
 */
export function endAgentSpan(
  span: Span,
  result: {
    status: "completed" | "error" | "aborted" | "steered";
    durationMs: number;
    turns: number;
    toolCalls: number;
    tokensIn: number;
    tokensOut: number;
    tokensCacheWrite?: number;
    validated?: boolean;
    error?: string;
  },
): void {
  span.setAttributes({
    "agent.status": result.status,
    "agent.duration_ms": result.durationMs,
    "agent.turns": result.turns,
    "agent.tool_calls": result.toolCalls,
    "agent.tokens_in": result.tokensIn,
    "agent.tokens_out": result.tokensOut,
    ...(result.tokensCacheWrite !== undefined && result.tokensCacheWrite > 0
      ? { "agent.tokens_cache_write": result.tokensCacheWrite }
      : {}),
    ...(result.validated !== undefined ? { "agent.validated": result.validated } : {}),
  });

  if (result.status === "error" || result.status === "aborted") {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: result.error ?? `Agent ${result.status}`,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
}

/**
 * Start a tool call sub-span as a child of the agent span context.
 */
export function startToolSpan(
  agentId: string,
  toolName: string,
  parentCtx?: Context,
): Span {
  if (!isTracingEnabled()) return NOOP_SPAN;
  const tracer = getTracer();
  return tracer.startSpan(
    "tool.call",
    {
      attributes: {
        "agent.id": agentId,
        "tool.name": toolName,
      },
    },
    parentCtx,
  );
}

/**
 * End a tool call span with status.
 */
export function endToolSpan(span: Span, error?: string): void {
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Start a turn sub-span as a child of the agent span context.
 */
export function startTurnSpan(
  agentId: string,
  turnNumber: number,
  parentCtx?: Context,
): Span {
  if (!isTracingEnabled()) return NOOP_SPAN;
  const tracer = getTracer();
  return tracer.startSpan(
    "agent.turn",
    {
      attributes: {
        "agent.id": agentId,
        "turn.number": turnNumber,
      },
    },
    parentCtx,
  );
}

/**
 * End a turn span.
 */
export function endTurnSpan(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Add a compaction sub-span (event/duration ~0) as a child of the agent context.
 */
export function startCompactionSpan(
  agentId: string,
  reason: string,
  tokensBefore: number,
  parentCtx?: Context,
): Span {
  if (!isTracingEnabled()) return NOOP_SPAN;
  const tracer = getTracer();
  return tracer.startSpan(
    "agent.compaction",
    {
      attributes: {
        "agent.id": agentId,
        "compaction.reason": reason,
        "compaction.tokens_before": tokensBefore,
      },
    },
    parentCtx,
  );
}

/**
 * End a compaction span.
 */
export function endCompactionSpan(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
