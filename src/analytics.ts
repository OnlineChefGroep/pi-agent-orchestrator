/**
 * analytics.ts — Optional product analytics bridge with PostHog support.
 *
 * Feature-detected: only activates when POSTHOG_KEY (or ANALYTICS_KEY) is set
 * in the environment. When no key is present, all methods are zero-cost no-ops.
 *
 * Architecture:
 *   - Lazy dynamic import of posthog-node (optional peer, never bundled).
 *   - Events are captured at agent lifecycle points (spawn, complete, error).
 *   - User identity (agent id, session id, pi version) is attached to every event.
 *   - Feature flag evaluation results can be tracked for A/B testing.
 *
 * This module also serves as the adapter layer for other analytics providers.
 * Set the `ANALYTICS_PROVIDER` env var to "posthog" (default), "amplitude",
 * or "custom" to select the backend. Only posthog has a built-in adapter;
 * other providers require the host to register a handler via `onAnalyticsEvent()`.
 *
 * Integration points:
 *   - index.ts → init on extension activation (if POSTHOG_KEY present)
 *   - agent-runner.ts → trackEvent on spawn, complete, error
 *   - feature-flags.ts → trackFlagDecision when flags are evaluated
 */

import { logger } from "./logger.js";

/** Analytics event names emitted by the extension. */
export type AnalyticsEvent =
  | "agent:spawned"
  | "agent:completed"
  | "agent:error"
  | "agent:handoff"
  | "swarm:joined"
  | "swarm:left"
  | "schedule:created"
  | "schedule:triggered"
  | "feature_flag:evaluated"
  | "session:start"
  | "session:end";

/** Properties attached to every analytics event. */
export interface AnalyticsUserProperties {
  piVersion?: string;
  extensionVersion?: string;
  platform?: string;
  nodeVersion?: string;
}

/** Event payload sent to the analytics provider. */
export interface AnalyticsEventPayload {
  event: AnalyticsEvent | string;
  distinctId: string;
  properties?: Record<string, unknown>;
  userProperties?: AnalyticsUserProperties;
}

/** Handler function type for custom analytics providers. */
export type AnalyticsHandler = (payload: AnalyticsEventPayload) => void;

/** Registered custom handlers (for non-posthog providers). */
const customHandlers = new Set<AnalyticsHandler>();

/** PostHog client after dynamic import. */
let posthogClient: {
  capture: (payload: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
} | null = null;

/** Whether analytics is enabled. */
let enabled = false;

/** Whether init has been attempted. */
let initAttempted = false;

/** Cached user properties for all events. */
let userProps: AnalyticsUserProperties = {};

/**
 * Initialize the analytics bridge.
 * Safe to call multiple times; only initializes once.
 *
 * @returns true if analytics is active, false otherwise.
 */
export async function initAnalytics(): Promise<boolean> {
  if (initAttempted) return enabled;
  initAttempted = true;

  const key = process.env.POSTHOG_KEY ?? process.env.ANALYTICS_KEY;
  if (!key) return false;

  const provider = process.env.ANALYTICS_PROVIDER ?? "posthog";

  // Capture user properties for all events
  userProps = {
    piVersion: process.env.PI_VERSION,
    extensionVersion: process.env.npm_package_version,
    platform: process.platform,
    nodeVersion: process.version,
  };

  if (provider === "custom") {
    // Custom mode: events are emitted to registered handlers only
    enabled = true;
    logger.debug("Analytics initialized (custom provider mode)");
    return true;
  }

  try {
    const moduleName = "posthog-node";
    const PostHog = await import(/* @vite-ignore */ moduleName);

    posthogClient = {
      capture: (payload) =>
        PostHog.capture({
          distinctId: payload.distinctId,
          event: payload.event,
          properties: payload.properties,
        }),
      identify: (distinctId, properties) => PostHog.identify({ distinctId, properties }),
      flush: () => PostHog.flush(),
      shutdown: () => PostHog.shutdown(),
    };

    enabled = true;
    logger.debug("Analytics initialized (PostHog provider)");
    return true;
  } catch {
    // posthog-node not installed — fall back to custom handler mode if any
    if (customHandlers.size > 0) {
      enabled = true;
      logger.debug("Analytics initialized (custom handlers, posthog-node not installed)");
    }
    return enabled;
  }
}

/** Whether analytics is currently active. */
export function isAnalyticsEnabled(): boolean {
  return enabled;
}

/**
 * Track an analytics event.
 * Safe to call when analytics is not configured — becomes a no-op.
 *
 * @param event Event name
 * @param distinctId User/session identifier
 * @param properties Optional event-specific properties
 */
export function trackEvent(
  event: AnalyticsEvent | string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!enabled) return;

  const payload: AnalyticsEventPayload = {
    event,
    distinctId,
    properties: { ...properties, ...userProps },
    userProperties: userProps,
  };

  // Send to PostHog if configured
  posthogClient?.capture({
    distinctId,
    event,
    properties: payload.properties,
  });

  // Emit to custom handlers
  for (const handler of customHandlers) {
    try {
      handler(payload);
    } catch (err) {
      logger.debug(`Analytics handler error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Identify a user/session with the analytics provider.
 * Call this on agent spawn to set user properties.
 */
export function identifyUser(distinctId: string, properties?: Record<string, unknown>): void {
  if (!enabled) return;
  posthogClient?.identify(distinctId, { ...properties, ...userProps });
}

/**
 * Register a custom analytics handler.
 * Use this to plug in Amplitude, Mixpanel, GA4, or any other provider
 * without installing posthog-node.
 *
 * @returns An unsubscribe function.
 */
export function onAnalyticsEvent(handler: AnalyticsHandler): () => void {
  customHandlers.add(handler);
  return () => customHandlers.delete(handler);
}

/**
 * Track a feature flag decision for A/B testing analytics.
 */
export function trackFlagDecision(flagName: string, enabled: boolean, distinctId: string, contextId?: string): void {
  trackEvent("feature_flag:evaluated", distinctId, {
    flagName,
    flagEnabled: enabled,
    contextId,
  });
}

/**
 * Flush pending events and shut down the analytics client.
 * Call in shutdown handlers to ensure no events are lost.
 */
export async function flushAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.flush();
  }
}

/**
 * Fully shut down the analytics client.
 */
export async function shutdownAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
  enabled = false;
  customHandlers.clear();
}
