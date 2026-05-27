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

import { logger } from "./logger.js";
import { type ModelRegistry, resolveModel } from "./model-resolver.js";

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

// CVE-003 FIX: Simple rate limiter for RPC calls
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW = 60000;  // 1 minute
const RATE_LIMIT_MAX = 10;        // Max 10 spawns per minute per extension
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(extensionId: string, operation: string): boolean {
  const now = Date.now();
  const key = `${extensionId}:${operation}`;
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Clean up old rate limit entries periodically.
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);
rateLimitCleanup.unref?.();

export function resetRpcRateLimitsForTests(): void {
  rateLimitMap.clear();
}

export interface RpcDeps {
  events: EventBus;
  pi: unknown;                    // passed through to manager.spawn
  getCtx: () => unknown | undefined;  // returns current ExtensionContext
  manager: SpawnCapable;
  authProvider?: (requestId: string) => AuthContext | undefined;
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
    const params = raw as P;
    try {
      const data = await fn(params);
      const reply: { success: true; data?: unknown } = { success: true };
      if (data !== undefined) reply.data = data;
      events.emit(`${channel}:reply:${params.requestId}`, reply);
    } catch (err: any) {
      events.emit(`${channel}:reply:${params.requestId}`, {
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
    throw new Error("Unauthorized RPC request");
  }
  return auth;
}

function authorizeRpcMutation(deps: RpcDeps, requestId: string, operation: string): AuthContext {
  const auth = resolveAuth(deps, requestId);
  if (!checkRateLimit(auth.extensionId, operation)) {
    throw new Error(`Rate limit exceeded for extension ${auth.extensionId}`);
  }
  return auth;
}

/**
 * Register ping, spawn, and stop RPC handlers on the event bus.
 * Returns unsub functions for cleanup.
 */
export function registerRpcHandlers(deps: RpcDeps): RpcHandle {
  const { events, pi, getCtx, manager } = deps;

  const unsubPing = handleRpc(events, "subagents:rpc:ping", () => {
    return { version: PROTOCOL_VERSION };
  });

  const unsubSpawn = handleRpc<{ requestId: string; type: string; prompt: string; options?: any; authContext?: AuthContext }>(
    events, "subagents:rpc:spawn", ({ requestId, type, prompt, options }) => {
      const ctx = getCtx();
      if (!ctx) throw new Error("No active session");
      
      const auth = authorizeRpcMutation(deps, requestId, "spawn");
      logger.info("rpc spawn", { extensionId: auth.extensionId, type });

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
          // resolveModel returns a human-readable error string when the
          // input doesn't match any available model. Surface it instead of
          // silently falling back so the caller sees the auth/typo issue.
          throw new Error(resolved);
        }
        normalizedOptions = { ...normalizedOptions, model: resolved };
      }

      return { id: manager.spawn(pi, ctx, type, prompt, normalizedOptions) };
    },
  );

  const unsubStop = handleRpc<{ requestId: string; agentId: string }>(
    events, "subagents:rpc:stop", ({ requestId, agentId }) => {
      authorizeRpcMutation(deps, requestId, "stop");
      if (!manager.abort(agentId)) throw new Error("Agent not found");
    },
  );

  return { unsubPing, unsubSpawn, unsubStop };
}
