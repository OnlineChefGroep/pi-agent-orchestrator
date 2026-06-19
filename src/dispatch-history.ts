/**
 * dispatch-history.ts — Module-level ring buffer that records every
 * orchestration dispatch decision so the `/agents → Health check` report can
 * surface a "dispatch-decision histogram" (auto → single/swarm/crew counts in
 * the last N spawns).
 *
 * Why a separate module, not a field on `AgentRecord`:
 * - The decision is made BEFORE we know the agent's final id (e.g. an auto
 *   pick that fans into 3 crew members all share one dispatch decision).
 *   Tying the decision to the first member's id would corrupt later counts.
 * - The histogram is a category-aggregate concern. Ring-buffer logic + the
 *   aggregate helper live next to each other and stay trivially testable
 *   (no manager state, no agent id, just structural operations).
 * - The auditor can reset the buffer between tests via `clearDispatchHistory()`
 *   without needing to spin down an `AgentManager`.
 *
 * Thread / process model: this module is intentionally single-process and
 * shared-state. The `Agent` tool is the only writer (the one place that
 * computes the dispatch decision in user-driven flows), and `buildHealthReport`
 * is a reader that snapshots via `computeDispatchHistogram()`. The
 * `recentErrors` section on the same report already follows this pattern, so
 * we're staying consistent with the existing health-report conventions.
 */
import type { OrchestrationMode } from "./agent-registry.js";
import { emitTelemetry } from "./telemetry.js";

// ---- Decision types ----

/**
 * Final dispatch kind the orchestrator fans out into. For an `auto`-mode call,
 * this is what the heuristic picked; for explicit `single`/`swarm`/`crew`
 * calls, this matches the configured mode verbatim.
 */
export type DispatchKind = "single" | "swarm" | "crew";

/**
 * Where the decision came from. `explicit` means the user pinned the mode via
 * settings (`single` / `swarm` / `crew` directly); `auto-heuristic` means the
 * user-pinned mode was `auto` and the prompt-analysis heuristic picked the
 * concrete kind.
 */
export type DispatchSource = "explicit" | "auto-heuristic";

export interface DispatchDecision {
  /** `Date.now()` at the time the decision was recorded. */
  timestamp: number;
  /** What got fanned out. */
  kind: DispatchKind;
  /** User-pinned `OrchestrationMode` at decision time (`auto` → heuristic fired). */
  configuredMode: OrchestrationMode;
  /**
   * `explicit` if the user pinned the same mode in settings,
   * `auto-heuristic` if the user pinned `auto` and this entry records the
   * concrete kind the heuristic picked for this prompt.
   */
  source: DispatchSource;
  /** Prompt length in characters — useful context for histogram follow-ups. */
  promptLength: number;
  /**
   * Short description string from the agent call, for triage when the user
   * sees "the heuristic picked single 4 times in a row" and wants to know
   * what those 4 prompts were.
   */
  description: string;
}

// ---- Module state ----

const DEFAULT_MAX_ENTRIES = 200;
let entries: DispatchDecision[] = [];
let maxEntries = DEFAULT_MAX_ENTRIES;

// ---- Configuration ----

/** (Re)configure the ring buffer. Mirrors `configureAuditLogger` shape. */
export function configureDispatchHistory(config: { maxEntries?: number } = {}): void {
  if (
    config.maxEntries !== undefined &&
    Number.isFinite(config.maxEntries) &&
    config.maxEntries > 0
  ) {
    maxEntries = config.maxEntries;
  }
  // Trim the buffer if the cap was lowered.
  if (entries.length > maxEntries) {
    entries = entries.slice(entries.length - maxEntries);
  }
}

// ---- Recording ----

/**
 * Record one dispatch decision. Called by the Agent tool's execute path
 * immediately after `resolveOrchestrationMode(...)` resolves the decision.
 *
 * Records are appended at the tail; older entries slide off the head when the
 * cap (`maxEntries`, default 200) is exceeded — a true FIFO ring, so the most
 * recent N are always preserved for the histogram.
 *
 * Side effect: emits `subagent:dispatch_decision` via `emitTelemetry(...)`
 * so downstream consumers (sentry / splunk / Go cinematic sidecar) see the
 * same decision flow as the in-memory ring buffer. The emit happens AFTER
 * the ring-buffer write so a telemetry handler that throws cannot corrupt
 * the histogram (the `emitTelemetry` helper itself logs + swallows handler
 * errors, see `src/telemetry.ts`).
 */
export function recordDispatchDecision(
  decision: Omit<DispatchDecision, "timestamp">,
): void {
  // Shallow-copy so external mutation cannot corrupt the buffered record.
  const stored: DispatchDecision = { ...decision, timestamp: Date.now() };
  entries.push(stored);
  if (entries.length > maxEntries) {
    entries.shift();
  }
  // Telemetry: hand subscribers a defensive copy so a handler that mutates
  // its argument cannot reach back into the buffer.
  emitTelemetry("subagent:dispatch_decision", {
    kind: stored.kind,
    configuredMode: stored.configuredMode,
    source: stored.source,
    promptLength: stored.promptLength,
    description: stored.description,
  });
}

// ---- Read helpers ----

/**
 * Newest → oldest. Returned array is a defensive copy so callers cannot mutate
 * the buffer. The name carries the ordering because the audit-logger's
 * sibling (`getAuditLog`) returns oldest-first — the difference is intentional,
 * and a contributor landing on this module should read both JSDocs before
 * swapping them.
 */
export function getDispatchHistory(): readonly DispatchDecision[] {
  // The buffer itself is `[push, push, push]` (chronological). A shallow copy
  // reversed yields newest-first in one extra alloc — fine for our default cap.
  return [...entries].reverse();
}

/** Ordered oldest → newest. Defensive copy. */
export function getDispatchHistoryOldestFirst(): readonly DispatchDecision[] {
  return [...entries].sort((a, b) => a.timestamp - b.timestamp);
}

// ---- Histogram aggregate ----

export interface DispatchHistogram {
  /** Total spawns recorded in the buffer. */
  total: number;
  /** Histogram across the eventual kinds (regardless of source). */
  byKind: { single: number; swarm: number; crew: number };
  /** Histogram across how the kind was decided (user-pinned vs heuristic). */
  bySource: { explicit: number; autoHeuristic: number };
  /**
   * Same as `byKind`, but only counting the auto-heuristic-decided entries.
   * Lets the user answer "of the prompts the heuristic saw, how many did it
   * route to single / swarm / crew?" — which is the exact signal the health
   * report is meant to surface. Returns zero entries for the case where the
   * user never set `auto`.
   */
  autoPicks: { single: number; swarm: number; crew: number };
  /** Buffer cap so the TUI renderer can phrase "(none in last N spawns)". */
  bufferCapacity: number;
  /**
   * Timestamp of the most recent entry, or `null` when the buffer is empty.
   * Lets the renderer note "last dispatch: 2s ago" so a stale session with no
   * recent spawns signals "no traffic yet" rather than "broken".
   */
  lastDecisionAt: number | null;
}

/**
 * Compute the histogram from the current buffer.
 *
 * Pure / side-effect free — safe to call from any reader (no need for a
 * snapshotting lock since the only writer is `recordDispatchDecision` and we
 * accept that two adjacent reads might see one new entry each other missed).
 */
export function computeDispatchHistogram(): DispatchHistogram {
  const byKind = { single: 0, swarm: 0, crew: 0 };
  const bySource = { explicit: 0, autoHeuristic: 0 };
  const autoPicks = { single: 0, swarm: 0, crew: 0 };
  let lastDecisionAt: number | null = null;
  for (const e of entries) {
    byKind[e.kind]++;
    if (e.source === "auto-heuristic") {
      bySource.autoHeuristic++;
      autoPicks[e.kind]++;
    } else {
      bySource.explicit++;
    }
    if (lastDecisionAt === null || e.timestamp > lastDecisionAt) {
      lastDecisionAt = e.timestamp;
    }
  }
  return {
    total: entries.length,
    byKind,
    bySource,
    autoPicks,
    bufferCapacity: maxEntries,
    lastDecisionAt,
  };
}

// ---- Test hooks ----

/** Clear all buffered decisions. Test-only. */
export function clearDispatchHistory(): void {
  entries = [];
}

/** Reset to defaults. Test-only. */
export function resetDispatchHistory(): void {
  entries = [];
  maxEntries = DEFAULT_MAX_ENTRIES;
}
