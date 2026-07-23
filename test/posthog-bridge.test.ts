import { afterEach, describe, expect, it } from "vitest";

import { createPostHogBridge, resolvePostHogKey, type PostHogBridge } from "../src/posthog-bridge.js";

describe("resolvePostHogKey", () => {
  it("returns undefined when neither setting nor env is set", () => {
    expect(resolvePostHogKey(undefined, undefined)).toBeUndefined();
  });

  it("prefers the explicit setting over the ambient env", () => {
    expect(resolvePostHogKey("phc_setting", "phc_env")).toBe("phc_setting");
  });

  it("falls back to the env when the setting is absent", () => {
    expect(resolvePostHogKey(undefined, "phc_env")).toBe("phc_env");
  });
});

describe("createPostHogBridge", () => {
  let bridge: PostHogBridge | null = null;

  afterEach(() => {
    // Stop the SDK client so no background flush handles keep the test runner alive.
    try {
      bridge?.shutdown();
    } catch {
      /* best-effort */
    }
    bridge = null;
  });

  it("stays inert (null) when no key is configured", async () => {
    expect(await createPostHogBridge({})).toBeNull();
    expect(await createPostHogBridge({ host: "https://example.com" })).toBeNull();
    expect(await createPostHogBridge({ distinctId: "x" })).toBeNull();
  });

  it("creates a capture/shutdown bridge when a key is set", async () => {
    // Point at a closed local port so no real telemetry leaves the test runner.
    bridge = await createPostHogBridge({ key: "phc_test", host: "http://127.0.0.1:1" });
    expect(bridge).not.toBeNull();
    expect(typeof bridge?.capture).toBe("function");
    expect(typeof bridge?.shutdown).toBe("function");
  });

  it("capture is fail-open (never throws) against a dead endpoint", async () => {
    bridge = await createPostHogBridge({ key: "phc_test", host: "http://127.0.0.1:1" });
    expect(() => bridge?.capture("agent_spawned", { type: "Explore" })).not.toThrow();
    expect(() => bridge?.capture("agent_completed", { type: "general-purpose", duration: 12 })).not.toThrow();
  });
});
