/**
 * Cross-extension RPC handlers for the subagents extension.
 *
 * Exposes ping, spawn, and stop RPCs over the pi.events event bus,
 * using per-request scoped reply channels.
 *
 * Reply envelope follows pi-mono convention:
 *   success → { success: true, data?: T }
 *   error   → { success: false, error: string }
 */

import { type AuditOutcome, recordAudit } from "./audit-logger.js";
import { type ModelRegistry, resolveModel } from "./model-resolver.js";

// ---------------------------------------------------------------------------
// Typed RPC errors — used by auditedRpc to classify outcomes without
// fragile string matching.
// ---------------------------------------------------------------------------

export type RpcErrorCode = "RATE_LIMITED" | "UNAUTHORIZED" | "ERROR" | "INVALID_PARAMS";

export class RpcError extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** Minimal event bus interface needed by the RPC handlers. */
export interface EventBus {
  on(event: string, handler: (data: unknown) => void): () => void;
  emit(event: string, data: unknown): void;
}

/** RPC reply envelope — matches pi-mono's RpcResponse shape. */
export type RpcReply<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/** RPC protocol version — bumped when the envelope or method contracts change. */
export const PROTOCOL_VERSION = 2;

export interface SpawnCapable {
  spawn(pi: unknown, ctx: unknown, type: string, prompt: string, options: any): string;
  abort(id: string): boolean;
}

// Host-provided authentication context for RPC calls.
export interface AuthContext {
  extensionId: string;
  extensionName?: string;
}

export interface SpawnRpcRequest {
  type: string;
  prompt: string;
  options?: Record<string, unknown>;
}

export interface StopRpcRequest {
  agentId: string;
}

export interface PingRpcReply {
  version: number;
}

export interface SubagentsRpcClient {
  ping(): Promise<PingRpcReply>;
  spawn(request: SpawnRpcRequest): Promise<{ id: string }>;
  stop(request: StopRpcRequest): Promise<void>;
}

// ---------------------------------------------------------------------------
// Rate limiter — configurable window and max via RateLimitConfig
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Tunables for the per-extension rate limiter. */
export interface RateLimitConfig {
  /** Sliding window size in milliseconds (default 60 000 — one minute). */
  windowMs?: number;
  /** Maximum calls per window per extension+operation (default 10). */
  maxPerWindow?: number;
}

const DEFAULT_RATE_LIMIT_WINDOW = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 10;

let rateLimitWindow = DEFAULT_RATE_LIMIT_WINDOW;
let rateLimitMax = DEFAULT_RATE_LIMIT_MAX;
const rateLimitMap = new Map<string, RateLimitEntry>();

/** Apply rate-limit configuration. Safe to call multiple times. */
export function configureRateLimit(config: RateLimitConfig): void {
  let windowChanged = false;
  if (config.windowMs !== undefined && Number.isFinite(config.windowMs) && config.windowMs > 0) {
    rateLimitWindow = config.windowMs;
    windowChanged = true;
  }
  if (config.maxPerWindow !== undefined && Number.isFinite(config.maxPerWindow) && config.maxPerWindow > 0) {
    rateLimitMax = config.maxPerWindow;
  }
  // Restart cleanup timer when the window changes so the interval stays aligned.
  if (windowChanged) {
    clearInterval(rateLimitCleanup);
    rateLimitCleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of rateLimitMap.entries()) {
        if (now > entry.resetAt) {
          rateLimitMap.delete(key);
        }
      }
    }, Math.max(1_000, Math.floor(rateLimitWindow / 2)));
    rateLimitCleanup.unref?.();
  }
}

function checkRateLimit(extensionId: string, operation: string): boolean {
  const now = Date.now();
  const key = `${extensionId}:${operation}`;
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + rateLimitWindow });
    return true;
  }

  if (entry.count >= rateLimitMax) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up old rate limit entries periodically.
// Derive interval from the configured window so expired entries don't linger
// when the window is shorter than the old hardcoded 60 s.
let rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, Math.max(1_000, Math.floor(rateLimitWindow / 2)));
rateLimitCleanup.unref?.();

export function resetRpcRateLimitsForTests(): void {
  rateLimitMap.clear();
  rateLimitWindow = DEFAULT_RATE_LIMIT_WINDOW;
  rateLimitMax = DEFAULT_RATE_LIMIT_MAX;
}

/** Return current effective rate-limit settings (useful in tests & diagnostics). */
export function getRateLimitConfig(): Required<RateLimitConfig> {
  return { windowMs: rateLimitWindow, maxPerWindow: rateLimitMax };
}

export interface RpcDeps {
  events: EventBus;
  pi: unknown;                    // passed through to manager.spawn
  getCtx: () => unknown | undefined;  // returns current ExtensionContext
  manager: SpawnCapable;
  authProvider?: (requestId: string) => AuthContext | undefined;
  /** Optional rate-limit tunables applied at registration time. */
  rateLimit?: RateLimitConfig;
}

export interface RpcHandle {
  unsubPing: () => void;
  unsubSpawn: () => void;
  unsubStop: () => void;
}

/**
 * Wire a single RPC handler: listen on `channel`, run `fn(params)`,
 * emit the reply envelope on `channel:reply:${requestId}`.
 */
function handleRpc<P extends { requestId: string }>(
  events: EventBus,
  channel: string,
  fn: (params: P) => unknown | Promise<unknown>,
): () => void {
  return events.on(channel, async (raw: unknown) => {
    try {
      if (typeof raw !== "object" || raw === null) {
        throw new RpcError("INVALID_PARAMS", "Expected object payload");
      }
      const rawObj = raw as Record<string, unknown>;
      if (typeof rawObj.requestId !== "string" || !rawObj.requestId) {
        throw new RpcError("INVALID_PARAMS", "Missing or empty requestId");
      }
      const params = raw as P;
      const data = await fn(params);
      const reply: { success: true; data?: unknown } = { success: true };
      if (data !== undefined) reply.data = data;
      events.emit(`${channel}:reply:${params.requestId}`, reply);
    } catch (err: any) {
      const requestId = (raw as Record<string, unknown>)?.requestId;
      events.emit(`${channel}:reply:${requestId}`, {
        success: false, error: err?.message ?? String(err),
      });
    }
  });
}

function createRequestId(): string {
  return `rpc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestRpc<T>(
  events: EventBus,
  channel: string,
  payload: object,
  timeoutMs: number,
): Promise<T> {
  const requestId = createRequestId();
  const replyChannel = `${channel}:reply:${requestId}`;
  return new Promise((resolve, reject) => {
    const unsub = events.on(replyChannel, (raw) => {
      clearTimeout(timer);
      unsub();
      const reply = raw as RpcReply<T>;
      if (reply.success) resolve(reply.data as T);
      else reject(new Error(reply.error));
    });
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`RPC timeout waiting for ${channel}`));
    }, timeoutMs);
    events.emit(channel, { ...payload, requestId });
  });
}

export function createSubagentsRpcClient(
  events: EventBus,
  options: { timeoutMs?: number } = {},
): SubagentsRpcClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    ping: () => requestRpc<PingRpcReply>(events, "subagents:rpc:ping", {}, timeoutMs),
    spawn: (request) => requestRpc<{ id: string }>(events, "subagents:rpc:spawn", request, timeoutMs),
    stop: async (request) => {
      await requestRpc<void>(events, "subagents:rpc:stop", request, timeoutMs);
    },
  };
}

function resolveAuth(deps: RpcDeps, requestId: string): AuthContext {
  if (!deps.authProvider) {
    return { extensionId: "legacy" };
  }

  const auth = deps.authProvider(requestId);
  if (!auth?.extensionId) {
    throw new RpcError("UNAUTHORIZED", "Unauthorized RPC request");
  }
  return auth;
}

function authorizeRpcMutation(deps: RpcDeps, requestId: string, operation: string): AuthContext {
  const auth = resolveAuth(deps, requestId);
  if (!checkRateLimit(auth.extensionId, operation)) {
    throw new RpcError("RATE_LIMITED", `Rate limit exceeded for extension ${auth.extensionId}`);
  }
  return auth;
}

// ---------------------------------------------------------------------------
// Audit-trail helper — wraps an RPC handler to capture outcome and duration.
// ---------------------------------------------------------------------------

type AuditableOperation = "ping" | "spawn" | "stop";

function auditedRpc<P extends { requestId: string }>(
  deps: RpcDeps,
  operation: AuditableOperation,
  fn: (params: P) => { auth: AuthContext; result: unknown | Promise<unknown> },
): (params: P) => unknown | Promise<unknown> {
  return async (params: P) => {
    const start = Date.now();
    let outcome: AuditOutcome = "success";
    // Eagerly resolve caller identity so the audit entry is attributed
    // even when the handler throws (rate-limit, unauthorized, etc.).
    let auth: AuthContext;
    try {
      auth = resolveAuth(deps, params.requestId);
    } catch {
      auth = { extensionId: "unknown" };
    }
    let metadata: Record<string, unknown> | undefined;
    try {
      const out = fn(params);
      auth = out.auth;
      const result = await out.result;
      return result;
    } catch (err: unknown) {
      if (err instanceof RpcError) {
        outcome = err.code === "RATE_LIMITED"
          ? "rate_limited"
          : err.code === "UNAUTHORIZED"
            ? "unauthorized"
            : "error";
      } else {
        outcome = "error";
      }
      metadata = { error: err instanceof Error ? err.message : String(err) };
      throw err;
    } finally {
      recordAudit({
        timestamp: new Date().toISOString(),
        extensionId: auth.extensionId,
        extensionName: auth.extensionName,
        operation,
        outcome,
        durationMs: Date.now() - start,
        metadata,
      });
    }
  };
}

/**
 * Register ping, spawn, and stop RPC handlers on the event bus.
 * Returns unsub functions for cleanup.
 *
 * **Global rate-limit state:** Calling this function with `deps.rateLimit` will
 * mutate module-level globals (`rateLimitWindow`, `rateLimitMax`) via
 * {@link configureRateLimit}. Multiple registrations in the same process share
 * and override these settings — the last registration wins. This is intentional
 * for the expected single-registration pattern; callers registering multiple
 * times should be aware of the side effect.
 */
export function registerRpcHandlers(deps: RpcDeps): RpcHandle {
  const { events, pi, getCtx, manager } = deps;

  // Apply caller-provided rate-limit tunables (if any).
  if (deps.rateLimit) configureRateLimit(deps.rateLimit);

  const unsubPing = handleRpc(
    events,
    "subagents:rpc:ping",
    auditedRpc<{ requestId: string }>(deps, "ping", ({ requestId }) => {
      const auth = resolveAuth(deps, requestId);
      return { auth, result: { version: PROTOCOL_VERSION } };
    }),
  );

  const unsubSpawn = handleRpc<{ requestId: string; type: string; prompt: string; options?: any; authContext?: AuthContext }>(
    events,
    "subagents:rpc:spawn",
    auditedRpc<{ requestId: string; type: string; prompt: string; options?: any; authContext?: AuthContext }>(
      deps,
      "spawn",
      ({ requestId, type, prompt, options }) => {
        if (typeof type !== "string" || !type) {
          throw new RpcError("INVALID_PARAMS", "Missing or empty agent type");
        }
        if (typeof prompt !== "string" || !prompt) {
          throw new RpcError("INVALID_PARAMS", "Missing or empty prompt");
        }
        const ctx = getCtx();
        if (!ctx) throw new Error("No active session");

        const auth = authorizeRpcMutation(deps, requestId, "spawn");

        // Cross-extension RPC callers (e.g. pi-tasks TaskExecute) naturally
        // forward serializable values, so options.model can be a string like
        // "openai-codex/gpt-5.5". Resolve it to a real Model instance here
        // — same pattern the scheduler path already uses — so the spawned
        // agent's auth lookup doesn't crash with "No API key found for
        // undefined".
        let normalizedOptions = options ?? {};
        if (typeof normalizedOptions.model === "string") {
          const registry = (ctx as { modelRegistry?: ModelRegistry }).modelRegistry;
          if (!registry) {
            throw new Error(
              `Model override "${normalizedOptions.model}" provided but ctx.modelRegistry is unavailable`,
            );
          }
          const resolved = resolveModel(normalizedOptions.model, registry);
          if (typeof resolved === "string") {
            throw new Error(resolved);
          }
          normalizedOptions = { ...normalizedOptions, model: resolved };
        }

        const id = manager.spawn(pi, ctx, type, prompt, normalizedOptions);
        return { auth, result: { id } };
      },
    ),
  );

  const unsubStop = handleRpc<{ requestId: string; agentId: string }>(
    events,
    "subagents:rpc:stop",
    auditedRpc<{ requestId: string; agentId: string }>(deps, "stop", ({ requestId, agentId }) => {
      if (typeof agentId !== "string" || !agentId) {
        throw new RpcError("INVALID_PARAMS", "Missing or empty agentId");
      }
      const auth = authorizeRpcMutation(deps, requestId, "stop");
      if (!manager.abort(agentId)) throw new Error("Agent not found");
      return { auth, result: undefined };
    }),
  );

  return { unsubPing, unsubSpawn, unsubStop };
}
