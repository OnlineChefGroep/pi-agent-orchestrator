/**
 * telemetry.ts — Structured event emitter for security and validation events.
 *
 * Provides a lightweight pub/sub system for agent lifecycle events.
 * Fail-open: if no listeners are registered, falls back to console.warn.
 */

/** Telemetry event types and their payloads */
export interface TelemetryEvents {
  "agent:loaded": { name: string; source: "project" | "global" | "embedded"; hash: string; enabled: boolean };
  "agent:validation-failed": { name: string; errors: string[] };
  "agent:unknown-tools": { name: string; tools: string[] };
  "agent:spawned": { type: string; parentType?: string; depth: number; budget?: number };
  "agent:completed": { type: string; duration: number; validatorResults?: { passed: boolean; summary: string }[] };
  "rpc:audit": {
    timestamp: string;
    extensionId: string;
    extensionName?: string;
    operation: string;
    outcome: string;
    durationMs: number;
    metadata?: Record<string, unknown>;
  };
}

/** Event names as a union type */
export type TelemetryEventName = keyof TelemetryEvents;

/** Handler function type */
export type TelemetryHandler<E extends TelemetryEventName> = (payload: TelemetryEvents[E]) => void;

/** Global registry of telemetry handlers (Symbol-based to avoid collisions) */
const TELEMETRY_REGISTRY_KEY = Symbol.for("pi-subagents:telemetry-handlers");

type HandlerRegistry = Map<TelemetryEventName, Set<TelemetryHandler<any>>>;

function getRegistry(): HandlerRegistry {
  let registry = (globalThis as any)[TELEMETRY_REGISTRY_KEY] as HandlerRegistry | undefined;
  if (!registry) {
    registry = new Map();
    (globalThis as any)[TELEMETRY_REGISTRY_KEY] = registry;
  }
  return registry;
}

/**
 * Subscribe to a telemetry event.
 * Returns an unsubscribe function.
 */
export function onTelemetry<E extends TelemetryEventName>(
  event: E,
  handler: TelemetryHandler<E>,
): () => void {
  const registry = getRegistry();
  let handlers = registry.get(event);
  if (!handlers) {
    handlers = new Set();
    registry.set(event, handlers);
  }
  handlers.add(handler);

  return () => {
    handlers?.delete(handler);
  };
}

/**
 * Emit a telemetry event.
 * If no listeners are registered, falls back to console.warn for security events.
 */
export function emitTelemetry<E extends TelemetryEventName>(
  event: E,
  payload: TelemetryEvents[E],
): void {
  const registry = getRegistry();
  const handlers = registry.get(event);

  if (handlers && handlers.size > 0) {
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        // Handler errors are logged but don't break the emitter
        console.warn(`[pi-subagents] Telemetry handler error for ${event}:`, err);
      }
    }
  } else {
    // Fail-open: log to console.warn for security-relevant events
    const securityEvents: TelemetryEventName[] = [
      "agent:loaded",
      "agent:validation-failed",
      "agent:unknown-tools",
    ];
    if (securityEvents.includes(event)) {
      console.warn(`[pi-subagents] ${event}:`, JSON.stringify(payload));
    }
  }
}

/**
 * Compute SHA-256 hash of a string (hex-encoded).
 * Used for agent content integrity logging.
 */
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Synchronous hash using Node.js crypto (fallback for non-browser environments).
 * Used when async hash is not convenient.
 */
import { createHash } from "node:crypto";

export function hashContentSync(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
