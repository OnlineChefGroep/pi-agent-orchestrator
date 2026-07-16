import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
/**
 * hooks.ts — Enterprise Hook System for Subagent Lifecycle
 *
 * Inspired by Claude Code's hook events and OpenCode's plugin architecture.
 * Features:
 * - Priority-based execution (before/after/around middleware)
 * - Async middleware chain with short-circuit support
 * - Per-hook metrics (latency, error rate, invocation count)
 * - Hook composition (chain multiple handlers into one)
 * - Graceful degradation with circuit breaker patterns
 * - Timeout and error protection (handlers never crash the agent)
 */

/** All hook event types in the subagent lifecycle. */
export type HookEvent =
  | "subagent:start"
  | "subagent:end"
  | "subagent:error"
  | "subagent:spawn"
  | "subagent:steer"
  | "tool:call"
  | "tool:result"
  | "compaction:start"
  | "compaction:end"
  | "turn:start"
  | "turn:end"
  | "swarm:join"
  | "swarm:leave"
  | "validation:start"
  | "validation:end";

/** Payload delivered to hook handlers. */
export interface HookPayload {
  event: HookEvent;
  agentId: string;
  data?: Record<string, unknown>;
  /** Timestamp when the event fired. */
  timestamp?: number;
}

/** Response from a blocking hook handler. */
export type HookResponse = "allow" | "block" | "modify";

/** Hook priority: lower numbers run first. */
export type HookPriority = "critical" | "high" | "normal" | "low" | "background";

const PRIORITY_MAP: Record<HookPriority, number> = {
  critical: 0,
  high: 25,
  normal: 50,
  low: 75,
  background: 100,
};

/** A hook handler function with metadata. */
export interface HookHandler {
  fn: (
    payload: HookPayload,
  ) => Promise<HookResponse | undefined> | HookResponse | undefined;
  priority: number;
  id: string;
  /** If true, handler errors are fatal (default: false). */
  fatal?: boolean;
  /** Max executions before auto-unregister (for one-shot hooks). */
  maxExecutions?: number;
  /** Circuit breaker: max consecutive errors before disabling. */
  circuitBreakerThreshold?: number;
}

/** Default timeout for individual hook handlers (5 seconds). */
const DEFAULT_HANDLER_TIMEOUT_MS = 5_000;

/** Metrics for a single hook handler. */
interface HookMetrics {
  invocations: number;
  errors: number;
  timeouts: number;
  totalLatencyMs: number;
  lastExecutedAt?: number;
  lastErrorAt?: number;
  consecutiveErrors: number;
  disabled: boolean;
}

/**
 * Execute a single handler with timeout, error protection, and metrics.
 */
async function executeHandler(
  handler: HookHandler,
  payload: HookPayload,
  timeoutMs: number,
  metrics: HookMetrics,
): Promise<HookResponse | undefined> {
  if (metrics.disabled) {
    logger.debug(`Hook disabled by circuit breaker`, { handlerId: handler.id, event: payload.event });
    return undefined;
  }

  metrics.invocations++;
  metrics.lastExecutedAt = Date.now();
  const start = Date.now();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const handlerPromise = (async () => {
    try {
      const result = await handler.fn(payload);
      metrics.consecutiveErrors = 0;
      return result;
    } catch (err) {
      metrics.errors++;
      metrics.consecutiveErrors++;
      metrics.lastErrorAt = Date.now();

      // Circuit breaker check
      if (handler.circuitBreakerThreshold && metrics.consecutiveErrors >= handler.circuitBreakerThreshold) {
        metrics.disabled = true;
        logger.warn(`Hook circuit breaker opened`, { handlerId: handler.id, event: payload.event, threshold: handler.circuitBreakerThreshold });
      }

      if (handler.fatal) {
        throw err; // Re-throw fatal errors
      }

      logger.warn(`Handler "${handler.id}" threw on "${payload.event}":`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  })();

  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      metrics.timeouts++;
      metrics.consecutiveErrors++;
      logger.warn(`Handler "${handler.id}" timed out after ${timeoutMs}ms on "${payload.event}"`);
      resolve(undefined);
    }, timeoutMs);
  });

  const result = await Promise.race([handlerPromise, timeoutPromise]);

  if (timeoutId) clearTimeout(timeoutId);
  metrics.totalLatencyMs += Date.now() - start;

  return result;
}

/** Registry for hook handlers with fail-open semantics and rich metadata. */
export class HookRegistry {
  private handlers = new Map<HookEvent, HookHandler[]>();
  private metrics = new Map<string, HookMetrics>();
  private handlerEventMap = new Map<string, HookEvent>();
  private globalMiddleware: Array<(payload: HookPayload, next: () => Promise<HookResponse>) => Promise<HookResponse>> = [];

  /** Register a handler for a specific event with priority. */
  register(
    event: HookEvent,
    handler: HookHandler["fn"],
    options?: {
      priority?: HookPriority | number;
      id?: string;
      fatal?: boolean;
      maxExecutions?: number;
      circuitBreakerThreshold?: number;
    },
  ): string {
    // `id` is the primary key for `metrics` and `handlerEventMap`; a collision would
    // overwrite those entries and, after unregisterById(), leave a ghost handler that
    // runHandlers() silently skips (metrics missing). Use a 64-bit suffix and, for
    // auto-generated ids, regenerate on the vanishingly rare clash to guarantee uniqueness.
    let id = options?.id;
    if (!id) {
      do {
        id = `${event}-${Date.now().toString(36)}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      } while (this.metrics.has(id));
    }
    const priority = typeof options?.priority === "number"
      ? options.priority
      : PRIORITY_MAP[options?.priority ?? "normal"];

    const hookHandler: HookHandler = {
      fn: handler,
      priority,
      id,
      fatal: options?.fatal ?? false,
      maxExecutions: options?.maxExecutions,
      circuitBreakerThreshold: options?.circuitBreakerThreshold,
    };

    const list = this.handlers.get(event);
    if (list) {
      list.push(hookHandler);
      list.sort((a, b) => a.priority - b.priority);
    } else {
      this.handlers.set(event, [hookHandler]);
    }

    this.metrics.set(id, {
      invocations: 0,
      errors: 0,
      timeouts: 0,
      totalLatencyMs: 0,
      consecutiveErrors: 0,
      disabled: false,
    });
    this.handlerEventMap.set(id, event);

    return id;
  }

  /** Register multiple handlers at once. */
  registerAll(handlers: Record<string, HookHandler["fn"]>, options?: {
    priority?: HookPriority | number;
    circuitBreakerThreshold?: number;
  }): string[] {
    const ids: string[] = [];
    for (const [event, handler] of Object.entries(handlers)) {
      ids.push(this.register(event as HookEvent, handler, options));
    }
    return ids;
  }

  /** Add global middleware that wraps all hook executions. */
  use(middleware: (payload: HookPayload, next: () => Promise<HookResponse>) => Promise<HookResponse>): void {
    this.globalMiddleware.push(middleware);
  }

  /** Remove a previously registered handler by ID. */
  unregisterById(handlerId: string): boolean {
    const event = this.handlerEventMap.get(handlerId);
    if (!event) return false;

    const list = this.handlers.get(event);
    if (list) {
      const idx = list.findIndex((h) => h.id === handlerId);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.metrics.delete(handlerId);
        this.handlerEventMap.delete(handlerId);
        if (list.length === 0) this.handlers.delete(event);
        return true;
      }
    }
    return false;
  }

  /** Remove a previously registered handler by function reference (legacy). */
  unregister(event: HookEvent, handler: HookHandler["fn"]): void {
    const list = this.handlers.get(event);
    if (!list) return;

    const idx = list.findIndex((h) => h.fn === handler);
    if (idx !== -1) {
      const id = list[idx].id;
      this.metrics.delete(id);
      this.handlerEventMap.delete(id);
      list.splice(idx, 1);
    }

    if (list.length === 0) this.handlers.delete(event);
  }

  /**
   * Dispatch an event to all registered handlers.
   *
   * Execution order:
   * 1. Global middleware chain (if any)
   * 2. Priority-sorted handlers (critical → background)
   * 3. Short-circuit on "block", aggregate "modify"
   *
   * Each handler runs with timeout protection. Failures are caught and logged.
   */
  async dispatch(
    event: HookEvent,
    agentId: string,
    data?: Record<string, unknown>,
    timeoutMs = DEFAULT_HANDLER_TIMEOUT_MS,
  ): Promise<HookResponse> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return "allow";

    const payload: HookPayload = {
      event,
      agentId,
      data,
      timestamp: Date.now(),
    };

    // If middleware exists, run through chain
    if (this.globalMiddleware.length > 0) {
      let index = 0;
      const next = async (): Promise<HookResponse> => {
        if (index >= this.globalMiddleware.length) {
          return this.runHandlers(list, payload, timeoutMs);
        }
        const mw = this.globalMiddleware[index++];
        return mw(payload, next);
      };
      return next();
    }

    return this.runHandlers(list, payload, timeoutMs);
  }

  private async runHandlers(
    list: HookHandler[],
    payload: HookPayload,
    timeoutMs: number,
  ): Promise<HookResponse> {
    let hasModify = false;

    for (const handler of list) {
      const metrics = this.metrics.get(handler.id);
      if (!metrics) continue;

      // One-shot cleanup
      if (handler.maxExecutions && metrics.invocations >= handler.maxExecutions) {
        this.unregisterById(handler.id);
        continue;
      }

      const result = await executeHandler(handler, payload, timeoutMs, metrics);

      if (result === "block") return "block";
      if (result === "modify") hasModify = true;
    }

    return hasModify ? "modify" : "allow";
  }

  /** Get metrics snapshot for monitoring/dashboard. */
  getMetrics(): Array<{
    id: string;
    event: HookEvent;
    invocations: number;
    errors: number;
    timeouts: number;
    avgLatencyMs: number;
    disabled: boolean;
  }> {
    const results: ReturnType<typeof this.getMetrics> = [];
    for (const [event, list] of this.handlers) {
      for (const handler of list) {
        const m = this.metrics.get(handler.id);
        if (!m) continue;
        results.push({
          id: handler.id,
          event,
          invocations: m.invocations,
          errors: m.errors,
          timeouts: m.timeouts,
          avgLatencyMs: m.invocations > 0 ? Math.round(m.totalLatencyMs / m.invocations) : 0,
          disabled: m.disabled,
        });
      }
    }
    return results;
  }

  /** Reset metrics and re-enable circuit-broken handlers. */
  resetMetrics(): void {
    for (const [_id, metrics] of this.metrics) {
      metrics.invocations = 0;
      metrics.errors = 0;
      metrics.timeouts = 0;
      metrics.totalLatencyMs = 0;
      metrics.consecutiveErrors = 0;
      metrics.disabled = false;
    }
  }

  /** Get a frozen snapshot of the handler map for inspection/testing. */
  getHandlers(): ReadonlyMap<HookEvent, ReadonlyArray<{ id: string; priority: number; fatal: boolean }>> {
    const snapshot = new Map<HookEvent, ReadonlyArray<{ id: string; priority: number; fatal: boolean }>>();
    for (const [event, handlers] of this.handlers) {
      snapshot.set(
        event,
        handlers.map((h) => ({ id: h.id, priority: h.priority, fatal: h.fatal ?? false })),
      );
    }
    return snapshot;
  }
}

/** Compose multiple hook handlers into a single handler (sequential execution). */
export function composeHandlers(
  ...handlers: HookHandler["fn"][]
): (payload: HookPayload) => Promise<HookResponse | undefined> {
  return async (payload) => {
    for (const handler of handlers) {
      const result = await handler(payload);
      if (result === "block") return "block";
      // "modify" continues to next handler
    }
    return "allow";
  };
}
