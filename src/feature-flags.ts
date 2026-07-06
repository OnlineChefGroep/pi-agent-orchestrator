/**
 * feature-flags.ts — Lightweight feature flag system for the pi-agent-orchestrator extension.
 *
 * Supports:
 *   - Environment-based defaults (PI_FEATURE_<NAME> env vars)
 *   - Runtime overrides via settings persistence
 *   - Percentage-based rollouts (deterministic hash of agent/session id)
 *   - Custom flags defined at runtime by the host or other extensions
 *
 * This is a local-first, zero-dependency feature flag system. It does NOT
 * require LaunchDarkly, Statsig, or any external service. Flags are evaluated
 * synchronously in-process, making them suitable for gating tool registration,
 * UI rendering paths, and agent spawn decisions.
 *
 * Integration:
 *   - index.ts → initialize flags from env + settings on extension activation
 *   - Any module → `isFeatureEnabled("myFlag")` to check
 *   - Settings menu → toggle flags at runtime via /agents → Settings
 *
 * For teams needing cloud-hosted feature flags (Unleash, GrowthBook), this
 * module provides the evaluation interface; a remote provider adapter can
 * be plugged in by setting flag overrides via `setFeatureOverride()`.
 */

import { createHash } from "node:crypto";

/** Built-in feature flags with their default states. */
export interface BuiltinFlags {
  /** Schedule-based autonomous agent jobs (cron). */
  scheduling: boolean;
  /** OpenTelemetry span emission for agent lifecycle. */
  tracing: boolean;
  /** Context-mode peer extension integration (ctx_* tools). */
  contextMode: boolean;
  /** Error tracking (Sentry) bridge activation. */
  errorTracking: boolean;
  /** Product analytics event emission. */
  analytics: boolean;
  /** Prompt compression for sub-agents. */
  promptCompression: boolean;
  /** Swarm coordination (multi-agent join/leave). */
  swarm: boolean;
}

/** Default flag values when no override is set. */
const DEFAULT_FLAGS: BuiltinFlags = {
  scheduling: true,
  tracing: true,
  contextMode: false,
  errorTracking: false,
  analytics: false,
  promptCompression: true,
  swarm: true,
};

/** In-memory flag store. Keys are case-insensitive. */
const flagStore = new Map<string, boolean>(Object.entries(DEFAULT_FLAGS));

/** Runtime overrides (take precedence over defaults and env). */
const overrideStore = new Map<string, boolean>();

/** Rollout percentages: 0-100, keyed by flag name. */
const rolloutStore = new Map<string, number>();

/**
 * Initialize feature flags from environment variables.
 * Env var format: `PI_FEATURE_<FLAG_NAME>=true|false`
 * Example: `PI_FEATURE_SCHEDULING=false` disables scheduling.
 *
 * Called once during extension activation.
 */
export function initFeatureFlags(env: NodeJS.ProcessEnv = process.env): void {
  const prefix = "PI_FEATURE_";
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix)) continue;
    const flagName = key.slice(prefix.length).toLowerCase();
    const parsed = value === "true" || value === "1";
    flagStore.set(flagName, parsed);
  }
}

/**
 * Check if a feature flag is enabled.
 *
 * Evaluation order (first match wins):
 *   1. Runtime override (set via `setFeatureOverride`)
 *   2. Env-initialized value
 *   3. Default value
 *
 * For flags with a rollout percentage set, the flag is only enabled
 * if the deterministic hash of the optional `contextId` falls within
 * the rollout bucket. Without a `contextId`, percentage rollouts
 * are ignored (flag is evaluated purely on boolean state).
 *
 * @param name Flag name (case-insensitive)
 * @param contextId Optional agent/session id for percentage-based rollouts
 * @returns true if the flag is enabled for this context
 */
export function isFeatureEnabled(name: string, contextId?: string): boolean {
  const key = name.toLowerCase();

  const baseValue = overrideStore.has(key) ? overrideStore.get(key)! : (flagStore.get(key) ?? false);

  if (!baseValue) return false;

  // Percentage rollout check
  const rollout = rolloutStore.get(key);
  if (rollout !== undefined && contextId) {
    return isInRollout(key, contextId, rollout);
  }

  return true;
}

/**
 * Set a runtime override for a feature flag.
 * This takes precedence over defaults and env-initialized values.
 * Use to toggle features at runtime (e.g., from the settings menu).
 */
export function setFeatureOverride(name: string, enabled: boolean): void {
  overrideStore.set(name.toLowerCase(), enabled);
}

/**
 * Clear a runtime override, falling back to the default/env value.
 */
export function clearFeatureOverride(name: string): void {
  overrideStore.delete(name.toLowerCase());
}

/**
 * Set a rollout percentage for a feature flag (0-100).
 * When set, the flag is only enabled for `percentage` percent of contexts,
 * determined by a deterministic hash of the contextId.
 *
 * @param name Flag name
 * @param percentage 0-100 (0 = disabled for all, 100 = enabled for all)
 */
export function setFeatureRollout(name: string, percentage: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  rolloutStore.set(name.toLowerCase(), clamped);
}

/**
 * Get all known feature flag names and their current effective state.
 * Useful for the settings menu / dashboard display.
 */
export function getAllFeatureFlags(): Array<{ name: string; enabled: boolean; overridden: boolean; rollout?: number }> {
  const allKeys = new Set([...flagStore.keys(), ...overrideStore.keys()]);
  return Array.from(allKeys).map((key) => ({
    name: key,
    enabled: overrideStore.has(key) ? overrideStore.get(key)! : (flagStore.get(key) ?? false),
    overridden: overrideStore.has(key),
    rollout: rolloutStore.get(key),
  }));
}

/**
 * Reset all feature flags to their default values.
 * Clears overrides, rollouts, and env-initialized values.
 */
export function resetFeatureFlags(): void {
  flagStore.clear();
  for (const [k, v] of Object.entries(DEFAULT_FLAGS)) {
    flagStore.set(k, v);
  }
  overrideStore.clear();
  rolloutStore.clear();
}

/**
 * Deterministic rollout check using a SHA-256 hash of the contextId.
 * This ensures the same contextId always gets the same result for a
 * given flag, preventing flicker across restarts.
 *
 * @param flagName Flag name (used in hash to vary distribution per flag)
 * @param contextId Agent id, session id, or user id
 * @param percentage 0-100
 * @returns true if this context falls within the rollout bucket
 */
function isInRollout(flagName: string, contextId: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;

  const hash = createHash("sha256").update(`${flagName}:${contextId}`).digest();
  // Use first 4 bytes as a uint32
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < percentage;
}
