/**
 * global-registry.ts — Typed accessors for Symbol-keyed globals.
 *
 * Replaces ad-hoc (globalThis as any)[Symbol.for(...)] patterns with
 * typed getter/setter pairs. Each key has its own typed accessor so
 * consumers don't need to know the Symbol name.
 */

import type { RenderMetricsSnapshot } from "./render-metrics.js";

// Symbol keys (must match consumers in index.ts and agent-dashboard.ts)
const WIDGET_KEY = Symbol.for("pi-subagents:widget-metrics");
const TELEMETRY_KEY = Symbol.for("pi-subagents:telemetry-handlers");

interface WidgetMetricsRegistry {
  getSnapshot(): RenderMetricsSnapshot;
}

/** Safe typed accessor for widget metrics — returns undefined if not registered. */
export function getWidgetMetrics(): WidgetMetricsRegistry | undefined {
  const raw = (globalThis as Record<symbol, unknown>)[WIDGET_KEY];
  if (raw && typeof raw === "object" && "getSnapshot" in raw) {
    return raw as WidgetMetricsRegistry;
  }
  return undefined;
}

/** Register widget metrics on the global symbol. */
export function setWidgetMetrics(registry: WidgetMetricsRegistry): void {
  (globalThis as Record<symbol, unknown>)[WIDGET_KEY] = registry;
}

/** Remove widget metrics from the global symbol. */
export function clearWidgetMetrics(): void {
  delete (globalThis as Record<symbol, unknown>)[WIDGET_KEY];
}

/** Safe typed accessor for telemetry handler registry — returns undefined if not registered. */
export function getTelemetryRegistry<T>(): T | undefined {
  const raw = (globalThis as Record<symbol, unknown>)[TELEMETRY_KEY];
  if (raw && typeof raw === "object") {
    return raw as T;
  }
  return undefined;
}

/** Register telemetry handler registry on the global symbol. */
export function setTelemetryRegistry<T>(registry: T): void {
  (globalThis as Record<symbol, unknown>)[TELEMETRY_KEY] = registry;
}
