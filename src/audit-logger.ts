/**
 * audit-logger.ts — Structured audit logging for cross-extension RPC operations.
 *
 * Records every RPC call with: timestamp, caller identity, operation,
 * parameters, outcome (success/error), and duration.  Entries are written
 * via the shared `logger` and emitted as telemetry events so external
 * consumers can subscribe.
 *
 * The in-memory ring buffer keeps the last N entries (configurable via
 * `AuditLoggerConfig.maxEntries`) for programmatic inspection and the
 * `/agents` diagnostic menu.
 */

import { logger } from "./logger.js";
import { emitTelemetry } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditOperation = "ping" | "spawn" | "stop";
export type AuditOutcome = "success" | "error" | "rate_limited" | "unauthorized";

export interface AuditEntry {
  /** ISO-8601 timestamp of the RPC call. */
  timestamp: string;
  /** Authenticated extension identity (or "legacy" when auth is unavailable). */
  extensionId: string;
  /** Human-readable extension name, if available. */
  extensionName?: string;
  /** RPC operation that was invoked. */
  operation: AuditOperation;
  /** Outcome of the call. */
  outcome: AuditOutcome;
  /** Wall-clock duration of the handler in milliseconds. */
  durationMs: number;
  /** Operation-specific metadata (agent type, agent id, error message, etc.). */
  metadata?: Record<string, unknown>;
}

export interface AuditLoggerConfig {
  /** Maximum number of entries kept in the in-memory ring buffer (default 200). */
  maxEntries?: number;
  /** When `true`, suppress logger output (telemetry events still fire). */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let entries: AuditEntry[] = [];
let maxEntries = 200;
let silent = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** (Re)configure the audit logger.  Safe to call multiple times. */
export function configureAuditLogger(config: AuditLoggerConfig): void {
  if (config.maxEntries !== undefined && config.maxEntries > 0) {
    maxEntries = config.maxEntries;
  }
  if (config.silent !== undefined) {
    silent = config.silent;
  }
  // Trim the buffer if the cap was lowered.
  if (entries.length > maxEntries) {
    entries = entries.slice(entries.length - maxEntries);
  }
}

/** Record a completed RPC call. */
export function recordAudit(entry: AuditEntry): void {
  // Append to ring buffer.
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries.shift();
  }

  // Structured log line via the shared logger.
  if (!silent) {
    const level = entry.outcome === "success" ? "info" : "warn";
    logger[level](`rpc:${entry.operation} ${entry.outcome}`, {
      ...(entry.metadata ?? {}),
      extensionId: entry.extensionId,
      ...(entry.extensionName ? { extensionName: entry.extensionName } : {}),
      durationMs: entry.durationMs,
    });
  }

  // Emit as telemetry so external consumers can subscribe.
  emitTelemetry("rpc:audit", entry);
}

/** Return a shallow copy of the current audit log (oldest → newest). */
export function getAuditLog(): readonly AuditEntry[] {
  return [...entries];
}

/** Return only entries matching a given operation. */
export function getAuditLogByOperation(operation: AuditOperation): readonly AuditEntry[] {
  return entries.filter((e) => e.operation === operation);
}

/** Return only entries from a given extension. */
export function getAuditLogByExtension(extensionId: string): readonly AuditEntry[] {
  return entries.filter((e) => e.extensionId === extensionId);
}

/** Clear the in-memory buffer (useful in tests). */
export function clearAuditLog(): void {
  entries = [];
}

/** Reset to defaults (useful in tests). */
export function resetAuditLogger(): void {
  entries = [];
  maxEntries = 200;
  silent = false;
}
