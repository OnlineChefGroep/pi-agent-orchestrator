/**
 * posthog-bridge.ts — Optional PostHog product-analytics bridge for agent
 * lifecycle telemetry.
 *
 * Mirrors the opt-in pattern used elsewhere in this extension: the bridge is
 * **inert unless a project key is configured** (via the `posthog.key` setting
 * or the `POSTHOG_KEY` environment variable). No telemetry ever leaves the host
 * unless the user opts in with their own project. There is no hardcoded or
 * shared project key, so a default install ships zero outbound analytics.
 *
 * The SDK is imported dynamically so a missing or broken `posthog-node`
 * install degrades to "no bridge" instead of crashing extension activation.
 */
import { env } from "node:process";

import { logger } from "./logger.js";

export interface PostHogConfig {
  /** PostHog project key (e.g. `phc_...`). When absent, the bridge stays inert. */
  key?: string;
  /** PostHog ingestion host. Defaults to the cloud app, or a self-hosted URL. */
  host?: string;
  /** Distinct id recorded on every captured event. */
  distinctId?: string;
}

export interface PostHogBridge {
  /** Fire-and-forget event capture. Swallows SDK errors (fail-open). */
  capture(event: string, properties?: Record<string, unknown>): void;
  /** Flush pending events. Safe to call multiple times. */
  shutdown(): void;
}

/**
 * Resolve the effective project key, honoring the explicit setting over the
 * ambient environment. Exported for testability without touching process.env.
 */
export function resolvePostHogKey(
  configKey: string | undefined,
  envKey: string | undefined = env.POSTHOG_KEY,
): string | undefined {
  return configKey ?? envKey;
}

/**
 * Create a PostHog bridge, or `null` when no key is configured (the default,
 * inert state). The SDK is loaded lazily so the extension never hard-depends
 * on `posthog-node` being importable at activation time.
 */
export async function createPostHogBridge(config: PostHogConfig): Promise<PostHogBridge | null> {
  const key = resolvePostHogKey(config.key);
  if (!key) return null;

  const host = config.host ?? env.POSTHOG_HOST ?? "https://app.posthog.com";
  const distinctId = config.distinctId ?? env.POSTHOG_DISTINCT_ID ?? "pi-agent-orchestrator";

  try {
    const { PostHog } = await import("posthog-node");
    const client = new PostHog(key, { host });
    logger.debug("PostHog telemetry bridge enabled", { host, distinctId });
    return {
      capture(event, properties) {
        try {
          client.capture({
            distinctId,
            event,
            properties: { $lib: "pi-agent-orchestrator", ...properties },
          });
        } catch (err) {
          logger.debug(
            `PostHog capture failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
      shutdown() {
        try {
          client.shutdown();
        } catch {
          /* best-effort flush; ignore */
        }
      },
    };
  } catch (err) {
    logger.warn("PostHog bridge could not start; staying inert", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
