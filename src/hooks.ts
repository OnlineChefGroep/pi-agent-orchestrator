/**
 * hooks.ts — Extensible hook system for subagent lifecycle events.
 *
 * Inspired by Claude Code's 27 hook event types and OpenCode's plugin hooks.
 * Hooks NEVER crash the agent — all handlers are wrapped in try/catch with
 * timeout protection. Blocking events can return "block" to abort, "modify"
 * to alter behavior, or void/"allow" to proceed.
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
  | "turn:end";

/** Payload delivered to hook handlers. */
export interface HookPayload {
  event: HookEvent;
  agentId: string;
  data?: Record<string, unknown>;
}

/** Response from a blocking hook handler. */
export type HookResponse = "allow" | "block" | "modify";

/**
 * A hook handler function. Returns a response for blocking hooks, or void
 * for observation-only hooks. Can be sync or async.
 */
export type HookHandler = (
  payload: HookPayload,
) => Promise<HookResponse | undefined> | HookResponse | undefined;

/** Default timeout for individual hook handlers (5 seconds). */
const DEFAULT_HANDLER_TIMEOUT_MS = 5_000;

/**
 * Execute a single handler with timeout and error protection.
 * Returns the handler's response, or undefined if it timed out or threw.
 */
async function executeHandler(
  handler: HookHandler,
  payload: HookPayload,
  timeoutMs: number,
): Promise<HookResponse | undefined> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const handlerPromise = (async () => {
    try {
      return await handler(payload);
    } catch (err) {
      console.warn(
        `[pi-subagents:hooks] Handler for "${payload.event}" threw:`,
        err instanceof Error ? err.message : String(err),
      );
      return undefined;
    }
  })();

  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `[pi-subagents:hooks] Handler for "${payload.event}" timed out after ${timeoutMs}ms`,
      );
      resolve(undefined);
    }, timeoutMs);
  });

  const result = await Promise.race([handlerPromise, timeoutPromise]);

  if (timeoutId) clearTimeout(timeoutId);

  return result;
}

/** Registry for hook handlers with fail-open semantics. */
export class HookRegistry {
  private handlers = new Map<HookEvent, HookHandler[]>();

  /** Register a handler for a specific event. */
  register(event: HookEvent, handler: HookHandler): void {
    const list = this.handlers.get(event);
    if (list) {
      list.push(handler);
    } else {
      this.handlers.set(event, [handler]);
    }
  }

  /** Register multiple handlers at once. Keys are event names, values are handlers. */
  registerAll(handlers: Record<string, HookHandler>): void {
    for (const [event, handler] of Object.entries(handlers)) {
      this.register(event as HookEvent, handler);
    }
  }

  /** Remove a previously registered handler for an event. */
  unregister(event: HookEvent, handler: HookHandler): void {
    const list = this.handlers.get(event);
    if (!list) return;

    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);

    if (list.length === 0) this.handlers.delete(event);
  }

  /**
   * Dispatch an event to all registered handlers.
   *
   * Each handler runs with timeout protection. Failures are caught and logged —
   * a handler MUST NOT crash the dispatch. If any handler returns "block",
   * dispatch returns "block" immediately. "modify" takes precedence over "allow".
   *
   * @param event The hook event type.
   * @param agentId The agent this event relates to.
   * @param data Optional contextual data.
   * @param timeoutMs Per-handler timeout in milliseconds (default: 5000).
   * @returns "block" if any handler blocked, "modify" if any modified, "allow" otherwise.
   */
  async dispatch(
    event: HookEvent,
    agentId: string,
    data?: Record<string, unknown>,
    timeoutMs = DEFAULT_HANDLER_TIMEOUT_MS,
  ): Promise<HookResponse> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return "allow";

    const payload: HookPayload = { event, agentId, ...(data ? { data } : {}) };

    // Race all handlers — "block" wins and short-circuits
    const results = await Promise.all(
      list.map((handler) => executeHandler(handler, payload, timeoutMs)),
    );

    let hasModify = false;
    for (const result of results) {
      if (result === "block") return "block";
      if (result === "modify") hasModify = true;
    }

    return hasModify ? "modify" : "allow";
  }

  /** Get the internal handler map for inspection/testing. */
  getHandlers(): Map<HookEvent, HookHandler[]> {
    return this.handlers;
  }
}
