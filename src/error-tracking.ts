/**
 * error-tracking.ts — Optional Sentry bridge with breadcrumbs and user context.
 *
 * Feature-detected: only activates when SENTRY_DSN is set in the environment.
 * When no DSN is present, all methods are zero-cost no-ops.
 *
 * Architecture:
 *   - Lazy dynamic import of @sentry/node (optional peer, never bundled).
 *   - Breadcrumbs are captured at logger call sites (see logger.ts).
 *   - User context (agent id, session id, pi version) is attached to every
 *     captured exception so production stack traces point back to the
 *     exact code path.
 *   - Source maps are uploaded during CI builds via the Sentry GitHub Action
 *     (see .github/workflows/coverage.yml) so production stack traces resolve
 *     to the original TypeScript source.
 *
 * Integration points:
 *   - logger.ts → captureBreadcrumb on every log line
 *   - agent-runner.ts → captureException on agent crash, setUser on spawn
 *   - index.ts → init on extension activation (if DSN present)
 */

/** Breadcrumb severity maps to Sentry's level enum. */
export type BreadcrumbLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** Breadcrumb category for grouping in the Sentry UI. */
export type BreadcrumbCategory = "logger" | "agent" | "tool" | "schedule" | "swarm" | "handoff" | "ui";

export interface BreadcrumbData {
  message: string;
  level: BreadcrumbLevel;
  category: BreadcrumbCategory;
  data?: Record<string, unknown>;
}

export interface ErrorTrackingUser {
  id: string;
  username?: string;
  agentType?: string;
  piVersion?: string;
}

export interface ErrorTrackingTags {
  agentType?: string;
  swarmId?: string;
  source?: string;
}

/** Cached Sentry client after first dynamic import (undefined if not loaded). */
let sentryClient: {
  captureMessage: (msg: string) => void;
  captureException: (err: unknown) => void;
  addBreadcrumb: (crumb: BreadcrumbData) => void;
  setUser: (user: ErrorTrackingUser | null) => void;
  setTags: (tags: ErrorTrackingTags) => void;
  flush: (timeoutMs: number) => Promise<boolean>;
} | null = null;

/** Whether we've already attempted to load Sentry (avoids repeated failed imports). */
let initAttempted = false;

/** Whether error tracking is enabled (SENTRY_DSN present and module loaded). */
let enabled = false;

/**
 * Initialize the error tracking bridge.
 * Safe to call multiple times; only initializes once.
 *
 * @returns true if Sentry is active, false otherwise.
 */
export async function initErrorTracking(): Promise<boolean> {
  if (initAttempted) return enabled;
  initAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  try {
    // Dynamic import — @sentry/node is an optional peer dependency.
    // We use a variable to prevent bundlers from resolving it at build time.
    const sentryModule = "@sentry/node";
    const Sentry = await import(/* @vite-ignore */ sentryModule);

    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? "production",
      release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
      tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      attachStacktrace: true,
      // Source maps are uploaded at build time via the CI workflow.
      // This flag tells Sentry to look for them.
      rewriteFrames: { root: process.cwd() },
    });

    sentryClient = {
      captureMessage: (msg: string) => Sentry.captureMessage(msg),
      captureException: (err: unknown) => Sentry.captureException(err),
      addBreadcrumb: (crumb: BreadcrumbData) => Sentry.addBreadcrumb(crumb),
      setUser: (user: ErrorTrackingUser | null) => Sentry.setUser(user),
      setTags: (tags: ErrorTrackingTags) => Sentry.setTags(tags as Record<string, string>),
      flush: (timeoutMs: number) => Sentry.flush(timeoutMs),
    };

    enabled = true;
    return true;
  } catch {
    // @sentry/node not installed — silently fall back to no-op.
    // This is the expected path when SENTRY_DSN is set but the package
    // hasn't been installed (e.g., local dev without Sentry).
    return false;
  }
}

/** Whether error tracking is currently active. */
export function isErrorTrackingEnabled(): boolean {
  return enabled;
}

/**
 * Add a breadcrumb to the Sentry event trail.
 * Breadcrumbs appear in the Sentry UI when an error is captured,
 * showing the sequence of log lines leading up to it.
 *
 * Safe to call when Sentry is not configured — becomes a no-op.
 */
export function captureBreadcrumb(breadcrumb: BreadcrumbData): void {
  sentryClient?.addBreadcrumb(breadcrumb);
}

/**
 * Capture an exception with full context.
 * The error is sent to Sentry with the current user/tags attached.
 */
export function captureException(error: unknown, tags?: ErrorTrackingTags): void {
  if (tags) sentryClient?.setTags(tags);
  sentryClient?.captureException(error);
}

/**
 * Capture a message as an error-level event.
 */
export function captureMessage(message: string, level: BreadcrumbLevel = "error"): void {
  if (level === "error" || level === "fatal") {
    sentryClient?.captureMessage(message);
  }
}

/**
 * Set the current user context for error attribution.
 * Call this on agent spawn so all subsequent errors are attributed correctly.
 */
export function setErrorTrackingUser(user: ErrorTrackingUser | null): void {
  sentryClient?.setUser(user);
}

/**
 * Set tags for the current Sentry scope.
 * Useful for tagging errors by agent type, swarm id, or source.
 */
export function setErrorTrackingTags(tags: ErrorTrackingTags): void {
  sentryClient?.setTags(tags);
}

/**
 * Flush pending events to Sentry before process exit.
 * Call in shutdown handlers to ensure no events are lost.
 */
export async function flushErrorTracking(timeoutMs = 2000): Promise<boolean> {
  if (!sentryClient) return true;
  return sentryClient.flush(timeoutMs);
}
