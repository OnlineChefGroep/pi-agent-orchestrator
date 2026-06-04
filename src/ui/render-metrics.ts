/**
 * render-metrics.ts — Lightweight render performance tracking.
 *
 * Tracks min/mean/max render durations and logs warnings when
 * renders exceed configurable thresholds.
 *
 * Use via environment variable PI_SUBAGENTS_LOG_LEVEL=debug to see metrics.
 */

import { logger } from "../logger.js";

/** Default slow render threshold: 16ms (~60fps). */
const DEFAULT_SLOW_THRESHOLD_MS = 16;

export interface RenderMetricsSnapshot {
  label: string;
  renderCount: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
}

export class RenderMetrics {
  private renderCount = 0;
  private totalRenderTime = 0;
  private maxRenderTime = 0;
  private minRenderTime = Infinity;
  private lastDurationMs = 0;

  constructor(
    private readonly label: string,
    private readonly slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS,
  ) {}

  /** Record a render duration. Returns true if it was logged as slow. */
  record(durationMs: number): boolean {
    this.renderCount++;
    this.totalRenderTime += durationMs;
    this.lastDurationMs = durationMs;
    if (durationMs > this.maxRenderTime) this.maxRenderTime = durationMs;
    if (durationMs < this.minRenderTime) this.minRenderTime = durationMs;

    if (durationMs > this.slowThresholdMs) {
      logger.debug(`render-metrics: slow ${this.label}`, {
        durationMs: Math.round(durationMs * 100) / 100,
        thresholdMs: this.slowThresholdMs,
        renderCount: this.renderCount,
        meanMs: Math.round(this.mean * 100) / 100,
      });
      return true;
    }
    return false;
  }

  /** Reset all counters. */
  reset(): void {
    this.renderCount = 0;
    this.totalRenderTime = 0;
    this.maxRenderTime = 0;
    this.minRenderTime = Infinity;
    this.lastDurationMs = 0;
  }

  /** Get a snapshot of current metrics. */
  snapshot(): RenderMetricsSnapshot {
    return {
      label: this.label,
      renderCount: this.renderCount,
      meanMs: Math.round(this.mean * 100) / 100,
      minMs: this.minRenderTime === Infinity ? 0 : Math.round(this.minRenderTime * 100) / 100,
      maxMs: Math.round(this.maxRenderTime * 100) / 100,
      lastMs: Math.round(this.lastDurationMs * 100) / 100,
    };
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
}
