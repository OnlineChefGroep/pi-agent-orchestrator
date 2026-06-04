import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuditEntry,
  clearAuditLog,
  configureAuditLogger,
  getAuditLog,
  getAuditLogByExtension,
  getAuditLogByOperation,
  recordAudit,
  resetAuditLogger,
} from "../src/audit-logger.js";

/** Factory for a minimal valid AuditEntry. */
function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    extensionId: "ext-a",
    operation: "spawn",
    outcome: "success",
    durationMs: 5,
    ...overrides,
  };
}

describe("audit-logger", () => {
  beforeEach(() => {
    resetAuditLogger();
  });

  afterEach(() => {
    resetAuditLogger();
  });

  // --- basic recording ---

  it("records an entry and returns it from getAuditLog", () => {
    recordAudit(entry());
    const log = getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].extensionId).toBe("ext-a");
    expect(log[0].operation).toBe("spawn");
    expect(log[0].outcome).toBe("success");
  });

  it("preserves insertion order (oldest first)", () => {
    recordAudit(entry({ extensionId: "first" }));
    recordAudit(entry({ extensionId: "second" }));
    recordAudit(entry({ extensionId: "third" }));
    const log = getAuditLog();
    expect(log.map((e) => e.extensionId)).toEqual(["first", "second", "third"]);
  });

  it("stores optional metadata and extensionName", () => {
    recordAudit(entry({ extensionName: "My Ext", metadata: { agentType: "Explore" } }));
    const log = getAuditLog();
    expect(log[0].extensionName).toBe("My Ext");
    expect(log[0].metadata).toEqual({ agentType: "Explore" });
  });

  // --- ring buffer / maxEntries ---

  it("evicts oldest entries when buffer exceeds maxEntries", () => {
    configureAuditLogger({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      recordAudit(entry({ extensionId: `ext-${i}` }));
    }
    const log = getAuditLog();
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.extensionId)).toEqual(["ext-2", "ext-3", "ext-4"]);
  });

  it("trims the buffer when maxEntries is lowered", () => {
    for (let i = 0; i < 10; i++) {
      recordAudit(entry({ extensionId: `ext-${i}` }));
    }
    expect(getAuditLog()).toHaveLength(10);

    configureAuditLogger({ maxEntries: 4 });
    expect(getAuditLog()).toHaveLength(4);
    // Keeps the most recent entries.
    expect(getAuditLog().map((e) => e.extensionId)).toEqual(["ext-6", "ext-7", "ext-8", "ext-9"]);
  });

  // --- filtering helpers ---

  it("filters by operation", () => {
    recordAudit(entry({ operation: "ping" }));
    recordAudit(entry({ operation: "spawn" }));
    recordAudit(entry({ operation: "stop" }));
    recordAudit(entry({ operation: "spawn" }));

    expect(getAuditLogByOperation("spawn")).toHaveLength(2);
    expect(getAuditLogByOperation("ping")).toHaveLength(1);
    expect(getAuditLogByOperation("stop")).toHaveLength(1);
  });

  it("filters by extensionId", () => {
    recordAudit(entry({ extensionId: "alpha" }));
    recordAudit(entry({ extensionId: "beta" }));
    recordAudit(entry({ extensionId: "alpha" }));

    expect(getAuditLogByExtension("alpha")).toHaveLength(2);
    expect(getAuditLogByExtension("beta")).toHaveLength(1);
    expect(getAuditLogByExtension("gamma")).toHaveLength(0);
  });

  // --- clearAuditLog ---

  it("clears all entries", () => {
    recordAudit(entry());
    recordAudit(entry());
    expect(getAuditLog()).toHaveLength(2);

    clearAuditLog();
    expect(getAuditLog()).toHaveLength(0);
  });

  // --- silent mode ---

  it("suppresses logger output when silent is true", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    configureAuditLogger({ silent: true });
    recordAudit(entry({ outcome: "success" }));
    recordAudit(entry({ outcome: "error" }));

    // The logger writes to console.log / console.warn — neither should fire.
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // --- getAuditLog returns a copy ---

  it("returns a shallow copy — mutating the array does not affect internal state", () => {
    recordAudit(entry());
    const log = getAuditLog();
    // @ts-expect-error — readonly array, but we're testing the copy semantics
    log.length = 0;
    expect(getAuditLog()).toHaveLength(1);
  });

  // --- outcome classification ---

  it("records all four outcome types", () => {
    recordAudit(entry({ outcome: "success" }));
    recordAudit(entry({ outcome: "error" }));
    recordAudit(entry({ outcome: "rate_limited" }));
    recordAudit(entry({ outcome: "unauthorized" }));

    const outcomes = getAuditLog().map((e) => e.outcome);
    expect(outcomes).toEqual(["success", "error", "rate_limited", "unauthorized"]);
  });
});
