import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../src/logger.js";

describe("logger", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.PI_SUBAGENTS_LOG_LEVEL;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00.000Z"));

    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PI_SUBAGENTS_LOG_LEVEL;
    } else {
      process.env.PI_SUBAGENTS_LOG_LEVEL = originalEnv;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should default to warn level in non-interactive processes", () => {
    delete process.env.PI_SUBAGENTS_LOG_LEVEL;

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
  });

  it("should default to warn level for invalid configuration in non-interactive processes", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "invalid-level";

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
  });

  it("should stay silent by default in an interactive terminal", () => {
    delete process.env.PI_SUBAGENTS_LOG_LEVEL;
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });

    try {
      logger.warn("warn message");
      logger.error("error message");

      expect(process.stdout.write).not.toHaveBeenCalled();
      expect(process.stderr.write).not.toHaveBeenCalled();
    } finally {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
  });

  it("should log all messages when set to debug", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "debug";

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).toHaveBeenCalledTimes(2); // debug and info
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
  });

  it("should log info, warn, and error messages when set to info", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "info";

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).toHaveBeenCalledTimes(1); // info only
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
  });

  it("should log warn and error messages when set to warn explicitly", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "warn";

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
  });

  it("should handle uppercase log level in PI_SUBAGENTS_LOG_LEVEL", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "DEBUG";

    logger.debug("debug message");

    expect(process.stdout.write).toHaveBeenCalledTimes(1);
  });

  it("should log only error messages when set to error", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "error";

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledTimes(1);
  });

  it("should format output as JSON with correct fields", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "info";

    logger.info("test message", { extra1: "value1", extra2: 123 });

    expect(process.stdout.write).toHaveBeenCalledTimes(1);
    const logCall = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    const parsedLog = JSON.parse(logCall.trim());

    expect(parsedLog).toEqual({
      ts: "2024-01-01T12:00:00.000Z",
      level: "info",
      component: "pi-subagents",
      message: "test message",
      extra1: "value1",
      extra2: 123
    });
  });

  it("should format output as JSON correctly without extra fields", () => {
    process.env.PI_SUBAGENTS_LOG_LEVEL = "info";

    logger.info("test message");

    expect(process.stdout.write).toHaveBeenCalledTimes(1);
    const logCall = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
    const parsedLog = JSON.parse(logCall.trim());

    expect(parsedLog).toEqual({
      ts: "2024-01-01T12:00:00.000Z",
      level: "info",
      component: "pi-subagents",
      message: "test message"
    });
  });
});
