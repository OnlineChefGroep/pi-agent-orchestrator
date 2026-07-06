/**
 * render-metrics.ts — Lightweight render performance tracking.
 *
 * Tracks min/mean/max render durations, request vs actual render counts,
 * active agents per render, time to first visible, and render rate.
 *
 * Use via environment variable PI_SUBAGENTS_LOG_LEVEL=debug to see slow render logs.
 */

import { logger } from "../logger.js";

/** Default slow render threshold: 16ms (~60fps). */
const DEFAULT_SLOW_THRESHOLD_MS = 16;

export interface RenderMetricsSnapshot {
  label: string;

  // Render duration stats
  renderCount: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;

  // Request vs actual (debounce effectiveness)
  requestedRenderCount: number;
  skippedRenderCount: number;
  requestToActualRatio: number;

  // Agent context
  activeAgentCount: number;
  activeAgentMin: number;
  activeAgentMax: number;
  activeAgentMean: number;

  // Time to first visible
  firstRenderTimestamp: number;
  firstSpawnTimestamp: number;
  timeToFirstVisibleMs: number;

  // Render rate
  startedAt: number;
  elapsedMs: number;
  rendersPerSecond: number;
  rendersPerMinute: number;
}

export class RenderMetrics {
  private renderCount = 0;
  private totalRenderTime = 0;
  private maxRenderTime = 0;
  private minRenderTime = Infinity;
  private lastDurationMs = 0;

  // Request vs actual
  private requestedRenderCount = 0;

  // Agent context
  private activeAgentCount = 0;
  private activeAgentTotal = 0;
  private activeAgentMin = Infinity;
  private activeAgentMax = 0;

  // Time to first visible
  private firstRenderTimestamp = 0;
  private firstSpawnTimestamp = 0;

  // Render rate
  private startedAt = Date.now();

  constructor(
    private readonly label: string,
    private readonly slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
  ) {}

  /**
   * Record a requested render (before debounce/dirty-check filtering).
   * Returns the net requested count.
   */
  recordRequested(): number {
    this.requestedRenderCount++;
    return this.requestedRenderCount;
  }

  /**
   * Record an actual render execution.
   *
   * @param durationMs - How long the render took.
   * @param activeAgents - How many agents were active at render time.
   * @returns true if the render was logged as slow.
   */
  record(durationMs: number, activeAgents?: number): boolean {
    // Track first render timestamp
    if (this.firstRenderTimestamp === 0) {
      this.firstRenderTimestamp = Date.now();
    }

    this.renderCount++;
    this.totalRenderTime += durationMs;
    this.lastDurationMs = durationMs;
    if (durationMs > this.maxRenderTime) this.maxRenderTime = durationMs;
    if (durationMs < this.minRenderTime) this.minRenderTime = durationMs;

    // Track active agents
    if (activeAgents !== undefined) {
      this.activeAgentCount++;
      this.activeAgentTotal += activeAgents;
      if (activeAgents > this.activeAgentMax) this.activeAgentMax = activeAgents;
      if (activeAgents < this.activeAgentMin) this.activeAgentMin = activeAgents;
    }

    if (durationMs > this.slowThresholdMs) {
      logger.debug(`render-metrics: slow ${this.label}`, {
        durationMs: Math.round(durationMs * 100) / 100,
        thresholdMs: this.slowThresholdMs,
        renderCount: this.renderCount,
        requested: this.requestedRenderCount,
        skipped: this.skippedCount,
        activeAgents,
        meanMs: Math.round(this.mean * 100) / 100,
      });
      return true;
    }
    return false;
  }

  /** Set the spawn timestamp for time-to-first-visible calculation. */
  setFirstSpawnTimestamp(ts: number): void {
    if (this.firstSpawnTimestamp === 0 || ts < this.firstSpawnTimestamp) {
      this.firstSpawnTimestamp = ts;
    }
  }

  /** Reset all counters. */
  reset(): void {
    this.renderCount = 0;
    this.totalRenderTime = 0;
    this.maxRenderTime = 0;
    this.minRenderTime = Infinity;
    this.lastDurationMs = 0;
    this.requestedRenderCount = 0;
    this.activeAgentCount = 0;
    this.activeAgentTotal = 0;
    this.activeAgentMin = Infinity;
    this.activeAgentMax = 0;
    this.firstRenderTimestamp = 0;
    this.firstSpawnTimestamp = 0;
    this.startedAt = Date.now();
  }

  /** Get a snapshot of current metrics. */
  snapshot(): RenderMetricsSnapshot {
    const now = Date.now();
    const elapsedMs = now - this.startedAt;
    const elapsedSecs = elapsedMs / 1000;
    const elapsedMins = elapsedSecs / 60;
    const timeToFirstVisible =
      this.firstRenderTimestamp > 0 && this.firstSpawnTimestamp > 0
        ? this.firstRenderTimestamp - this.firstSpawnTimestamp
        : 0;

    return {
      label: this.label,

      renderCount: this.renderCount,
      meanMs: Math.round(this.mean * 100) / 100,
      minMs: this.minRenderTime === Infinity ? 0 : Math.round(this.minRenderTime * 100) / 100,
      maxMs: Math.round(this.maxRenderTime * 100) / 100,
      lastMs: Math.round(this.lastDurationMs * 100) / 100,

      requestedRenderCount: this.requestedRenderCount,
      skippedRenderCount: this.skippedCount,
      requestToActualRatio:
        this.renderCount > 0 ? Math.round((this.requestedRenderCount / this.renderCount) * 100) / 100 : 0,

      activeAgentCount: this.activeAgentCount,
      activeAgentMin: this.activeAgentMin === Infinity ? 0 : this.activeAgentMin,
      activeAgentMax: this.activeAgentMax,
      activeAgentMean:
        this.activeAgentCount > 0 ? Math.round((this.activeAgentTotal / this.activeAgentCount) * 100) / 100 : 0,

      firstRenderTimestamp: this.firstRenderTimestamp,
      firstSpawnTimestamp: this.firstSpawnTimestamp,
      timeToFirstVisibleMs: timeToFirstVisible,

      startedAt: this.startedAt,
      elapsedMs,
      rendersPerSecond: elapsedSecs > 0 ? Math.round((this.renderCount / elapsedSecs) * 100) / 100 : 0,
      rendersPerMinute: elapsedMins > 0 ? Math.round((this.renderCount / elapsedMins) * 100) / 100 : 0,
    };
  }

  /** Number of renders skipped due to debounce/dirty-check. */
  get skippedCount(): number {
    return Math.max(0, this.requestedRenderCount - this.renderCount);
  }

  get mean(): number {
    return this.renderCount > 0 ? this.totalRenderTime / this.renderCount : 0;
  }

  get count(): number {
    return this.renderCount;
  }

  get max(): number {
    return this.maxRenderTime;
  }

  get min(): number {
    return this.minRenderTime === Infinity ? 0 : this.minRenderTime;
  }

  get last(): number {
    return this.lastDurationMs;
  }

  get requestedCount(): number {
    return this.requestedRenderCount;
  }
}
