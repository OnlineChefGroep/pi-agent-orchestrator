import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/logger.js";
import { emitTelemetry, hashContent, hashContentSync, onTelemetry } from "../src/telemetry.js";

vi.mock("../src/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("telemetry", () => {
  const TELEMETRY_REGISTRY_KEY = Symbol.for("pi-subagents:telemetry-handlers");
  const globalRegistry = globalThis as Record<symbol, unknown>;

  beforeEach(() => {
    // Reset the global registry before each test
    delete globalRegistry[TELEMETRY_REGISTRY_KEY];
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete globalRegistry[TELEMETRY_REGISTRY_KEY];
  });

  describe("pub/sub", () => {
    it("should successfully register a handler and receive events", () => {
      const handler = vi.fn();
      const unsubscribe = onTelemetry("agent:loaded", handler);

      const payload = { name: "test-agent", source: "project" as const, hash: "123", enabled: true };
      emitTelemetry("agent:loaded", payload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(payload);

      unsubscribe();
    });

    it("should allow multiple handlers for the same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      onTelemetry("agent:loaded", handler1);
      onTelemetry("agent:loaded", handler2);

      const payload = { name: "test-agent", source: "project" as const, hash: "123", enabled: true };
      emitTelemetry("agent:loaded", payload);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("should stop receiving events after unsubscribe", () => {
      const handler = vi.fn();
      const unsubscribe = onTelemetry("agent:loaded", handler);

      unsubscribe();

      const payload = { name: "test-agent", source: "project" as const, hash: "123", enabled: true };
      emitTelemetry("agent:loaded", payload);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should continue notifying other handlers if one throws an error", () => {
      const failingHandler = vi.fn(() => {
        throw new Error("Handler failed");
      });
      const successfulHandler = vi.fn();

      onTelemetry("agent:loaded", failingHandler);
      onTelemetry("agent:loaded", successfulHandler);

      const payload = { name: "test-agent", source: "project" as const, hash: "123", enabled: true };
      emitTelemetry("agent:loaded", payload);

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(successfulHandler).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Telemetry handler error"),
        expect.objectContaining({ error: "Handler failed" })
      );
    });
  });

  describe("fail-open logging", () => {
    it("should log to logger.warn for security events when no handlers are registered", () => {
      const payload = { name: "test-agent", errors: ["validation failed"] };
      emitTelemetry("agent:validation-failed", payload);

      expect(logger.warn).toHaveBeenCalledWith(
        "[telemetry] security event: agent:validation-failed",
        { payload }
      );
    });

    it("should not log to logger.warn for non-security events when no handlers are registered", () => {
      const payload = { type: "task", depth: 1 };
      emitTelemetry("agent:spawned", payload);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("should not log to logger.warn for security events when handlers are registered", () => {
      const handler = vi.fn();
      onTelemetry("agent:validation-failed", handler);

      const payload = { name: "test-agent", errors: ["validation failed"] };
      emitTelemetry("agent:validation-failed", payload);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("hashing functions", () => {
    it("hashContentSync should return a valid SHA-256 hash", () => {
      const content = "hello world";
      // echo -n "hello world" | sha256sum
      const expectedHash = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
      expect(hashContentSync(content)).toBe(expectedHash);
    });

    it("hashContent should return a valid SHA-256 hash asynchronously", async () => {
      const content = "hello world";
      const expectedHash = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
      expect(await hashContent(content)).toBe(expectedHash);
    });
  });
});
