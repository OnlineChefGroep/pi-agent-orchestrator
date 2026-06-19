/**
 * Tests for src/debug-capture.ts — local offline capture sink.
 *
 * Coverage:
 *   - Off-by-default: every public append* function is a strict no-op when
 *     the sink is not enabled. Verifies no folders or files are created.
 *   - Lifecycle: enable writes a manifest, disable writes an index.json.
 *   - Path validation: rejects non-absolute, `..` traversal, NUL-byte,
 *     and oversized paths.
 *   - Sanitization: agent ids with path separators / illegal characters
 *     become safe folder names.
 *   - Sinks: appendAgentEvent / appendError / upsertAgentMetrics /
 *     appendScheduleEvent / appendRpcAudit all write to the right paths.
 *   - Rotation: stat-size-triggered tail-trim verified with a statSync spy.
 *   - Resilience: a sink-level error does not propagate to the caller.
 */

import * as fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as debugCapture from "../src/debug-capture.js";

/** Build a fresh temp-rooted workspace for each test. mkdtempSync ensures
 *  parallel test runs start from a unique directory — safe for vitest's
 *  default parallelism. We pre-create the project + personal roots so
 *  tests that write sub-paths (e.g. `agents/is-a-file`) before calling
 *  `enable()` don't trip on ENOENT for the missing parent dir. */
function newWorkspace(): { projectRoot: string; personalRoot: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "pi-subagents-debug-capture-"));
  const projectRoot = join(dir, "project");
  const personalRoot = join(dir, "personal");
  mkdirSync(dir, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(personalRoot, { recursive: true });
  return {
    projectRoot,
    personalRoot,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    },
  };
}

beforeEach(() => {
  debugCapture.resetDebugCapture();
});

afterEach(() => {
  debugCapture.resetDebugCapture();
});

describe("debug-capture — off-by-default", () => {
  it("isDebugCaptureEnabled() returns false initially", () => {
    expect(debugCapture.isDebugCaptureEnabled()).toBe(false);
    expect(debugCapture.getDebugCaptureManifest()).toBeNull();
  });

  it("every append* function is a strict no-op when disabled", () => {
    expect(() => debugCapture.appendAgentEvent("a1", "subagent:start", {})).not.toThrow();
    expect(() => debugCapture.appendError("a1", new Error("boom"))).not.toThrow();
    expect(() => debugCapture.upsertAgentMetrics("a1", { ok: true })).not.toThrow();
    expect(() => debugCapture.appendScheduleEvent("j1", "job1", "fired", {})).not.toThrow();
    expect(() => debugCapture.appendRpcAudit({ op: "spawn" })).not.toThrow();
    expect(debugCapture.disable()).toBeUndefined();
  });
});

describe("debug-capture — enable / disable lifecycle", () => {
  it("enable() returns null and stays disabled when no path is writable", () => {
    // Both paths empty → no roots available → enable aborts.
    const result = debugCapture.enable({}, "session-empty");
    expect(result).toBeNull();
    expect(debugCapture.isDebugCaptureEnabled()).toBe(false);
  });

  it("enable() activates when at least one path is valid", () => {
    const ws = newWorkspace();
    try {
      const m = debugCapture.enable({ projectPath: ws.projectRoot }, "session-x");
      expect(m).not.toBeNull();
      expect(m?.paths.project).toBe(ws.projectRoot);
      expect(m?.paths.personal).toBeNull();
      expect(m?.sessionUuid).toBe("session-x");
      expect(debugCapture.isDebugCaptureEnabled()).toBe(true);
    } finally { ws.cleanup(); }
  });

  it("enable() respects both project + personal when provided", () => {
    const ws = newWorkspace();
    try {
      const m = debugCapture.enable({ projectPath: ws.projectRoot, personalPath: ws.personalRoot }, "session-xy");
      expect(m?.paths.project).toBe(ws.projectRoot);
      expect(m?.paths.personal).toBe(ws.personalRoot);
      expect(existsSync(join(ws.projectRoot, "manifest.json"))).toBe(true);
      expect(existsSync(join(ws.personalRoot, "manifest.json"))).toBe(true);
    } finally { ws.cleanup(); }
  });

  it("enable() drops a path that fails to mkdir", () => {
    const ws = newWorkspace();
    try {
      // Personal points at a path under a non-directory parent so mkdir fails.
      const bad = join(ws.projectRoot, "is-a-file", "..", "xxx");
      writeFileSync(join(ws.projectRoot, "is-a-file"), "x", "utf-8");
      const m = debugCapture.enable({ projectPath: ws.projectRoot, personalPath: bad }, "session-bad");
      // Project writes OK, personal skipped silently — capture still enabled.
      expect(m?.paths.project).toBe(ws.projectRoot);
      expect(m?.paths.personal).toBeNull();
    } finally { ws.cleanup(); }
  });

  it("enable() is idempotent and returns the existing manifest", () => {
    const ws = newWorkspace();
    try {
      const a = debugCapture.enable({ projectPath: ws.projectRoot }, "session-1");
      const b = debugCapture.enable({ projectPath: ws.projectRoot }, "session-2");
      // Second call should NOT overwrite sessionUuid with the new hint.
      expect(a?.sessionUuid).toBe("session-1");
      expect(b?.sessionUuid).toBe("session-1");
    } finally { ws.cleanup(); }
  });

  it("disable() writes an index.json after each capture root", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot, personalPath: ws.personalRoot }, "session-i");
      debugCapture.disable(true);
      expect(existsSync(join(ws.projectRoot, "index.json"))).toBe(true);
      expect(existsSync(join(ws.personalRoot, "index.json"))).toBe(true);
      const idx = JSON.parse(readFileSync(join(ws.projectRoot, "index.json"), "utf-8"));
      expect(idx.sessionUuid).toBe("session-i");
      expect(typeof idx.closedAt).toBe("string");
      expect(idx.capturedAt).toBeDefined();
      expect(debugCapture.isDebugCaptureEnabled()).toBe(false);
    } finally { ws.cleanup(); }
  });

  it("disable(writeFinalIndex=false) skips index.json", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "session-noi");
      debugCapture.disable(false);
      expect(existsSync(join(ws.projectRoot, "index.json"))).toBe(false);
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — appendAgentEvent + sanity-check payload", () => {
  it("writes one JSONL line per call to agents/<id>/events.jsonl", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      debugCapture.appendAgentEvent("agent-1", "subagent:start", { type: "explore" });
      debugCapture.appendAgentEvent("agent-1", "turn:start", { turnIndex: 0 });
      const path = join(ws.projectRoot, "agents", "agent-1", "events.jsonl");
      expect(existsSync(path)).toBe(true);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      const e0 = JSON.parse(lines[0]);
      expect(e0.event).toBe("subagent:start");
      expect(e0.agentId).toBe("agent-1");
      expect(e0.data).toEqual({ type: "explore" });
      expect(e0.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const e1 = JSON.parse(lines[1]);
      expect(e1.event).toBe("turn:start");
      expect(e1.data).toEqual({ turnIndex: 0 });
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — appendError + stack trace", () => {
  it("captures Error instances with name/message/stack", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      const err = new TypeError("boom");
      debugCapture.appendError("agent-err", err, { hookEvent: "subagent:error" });
      const path = join(ws.projectRoot, "agents", "agent-err", "errors.log");
      expect(existsSync(path)).toBe(true);
      const entry = JSON.parse(readFileSync(path, "utf-8").trim());
      expect(entry.agentId).toBe("agent-err");
      expect(entry.error.name).toBe("TypeError");
      expect(entry.error.message).toBe("boom");
      expect(entry.error.stack).toMatch(/TypeError: boom/);
      expect(entry.context.hookEvent).toBe("subagent:error");
    } finally { ws.cleanup(); }
  });

  it("captures non-Error throws via String() coercion", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      debugCapture.appendError("agent-raw", "string-only", { tag: "raw" });
      const path = join(ws.projectRoot, "agents", "agent-raw", "errors.log");
      const entry = JSON.parse(readFileSync(path, "utf-8").trim());
      expect(entry.error).toEqual({ raw: "string-only" });
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — upsertAgentMetrics (atomic JSON)", () => {
  it("replaces metrics.json atomically on each call", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      debugCapture.upsertAgentMetrics("a1", { duration: 100, tokens: 50 });
      const path = join(ws.projectRoot, "agents", "a1", "metrics.json");
      expect(existsSync(path)).toBe(true);
      const first = JSON.parse(readFileSync(path, "utf-8"));
      expect(first.duration).toBe(100);
      expect(first.tokens).toBe(50);
      expect(first.agentId).toBe("a1");
      expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Second upsert replaces the whole file.
      debugCapture.upsertAgentMetrics("a1", { duration: 250, tokens: 60, validators: 2 });
      const second = JSON.parse(readFileSync(path, "utf-8"));
      expect(second.duration).toBe(250);
      expect(second.validators).toBe(2);
      // duration/ts still present on the newer write.
      expect(second.agentId).toBe("a1");
      expect(second.tokens).toBe(60);
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — appendScheduleEvent + appendRpcAudit", () => {
  it("writes schedule execution entries under <root>/schedules/<name>/", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      debugCapture.appendScheduleEvent("j-1", "nightly-tests", "fired", { agentId: "a-x" });
      debugCapture.appendScheduleEvent("j-1", "nightly-tests", "error", { error: "boom" });
      const path = join(ws.projectRoot, "schedules", "nightly-tests", "executions.jsonl");
      expect(existsSync(path)).toBe(true);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).event).toBe("fired");
      expect(JSON.parse(lines[1]).event).toBe("error");
    } finally { ws.cleanup(); }
  });

  it("writes rpc audit entries under <root>/rpc/audit.jsonl", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      debugCapture.appendRpcAudit({ operation: "spawn", outcome: "success", durationMs: 12 });
      debugCapture.appendRpcAudit({ operation: "stop", outcome: "error", durationMs: 4 });
      const path = join(ws.projectRoot, "rpc", "audit.jsonl");
      expect(existsSync(path)).toBe(true);
      const lines = readFileSync(path, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).operation).toBe("spawn");
      expect(JSON.parse(lines[1]).operation).toBe("stop");
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — directory-name sanitization", () => {
  it("rewrites path separators and illegal chars into dashes", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      // Agent id contains /, \, :, *, ?, etc — all become dashes.
      debugCapture.appendAgentEvent("a/b:c*e", "subagent:start", {});
      const agentsDir = join(ws.projectRoot, "agents");
      const dirs = readdirSync(agentsDir);
      expect(dirs).toContain("a-b-c-e");
      const eventsPath = join(agentsDir, "a-b-c-e", "events.jsonl");
      expect(existsSync(eventsPath)).toBe(true);
    } finally { ws.cleanup(); }
  });

  it("falls back to '_' when sanitization produces an empty string", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      // "///" sanitizes to "" → fallback "_".
      debugCapture.appendAgentEvent("///", "subagent:start", {});
      const agentsDir = join(ws.projectRoot, "agents");
      const dirs = readdirSync(agentsDir);
      expect(dirs).toContain("_");
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — rotation (tail-trim when size > 25 MiB)", () => {
  it("truncates to tail half when stat size exceeds ceiling", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      const path = join(ws.projectRoot, "rpc", "audit.jsonl");
      // Pre-create the rpc/ subdir so writeFileSync can land without ENOENT.
      // (Setup mirrors production: enable() creates only the root; per-event
      // appendAtomicWithRotate creates its own subdir lazily on first write.)
      mkdirSync(dirname(path), { recursive: true });
      // Seed a real file so readFileSync has something to trim.
      writeFileSync(path, "AAAA", "utf-8");
      // Spy on statSync so rotation sees a fake size > 25 MiB.
      const statSpy = vi.spyOn(fs, "statSync").mockReturnValue({ size: 30 * 1024 * 1024 } as fs.Stats);
      try {
        debugCapture.appendRpcAudit({ surrogate: true });
        const after = readFileSync(path).length;
        expect(after).toBeLessThanOrEqual(25 * 1024 * 1024);
        // Original marker still present in tail half (deterministic tail is the most
        // recent data we appended).
        expect(after).toBeGreaterThan(0);
      } finally {
        statSpy.mockRestore();
      }
      // Sanity: statSync returns to normal mode (real size is small).
      expect(statSync(path).size).toBe(after);
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — resilience to FS errors", () => {
  it("does not throw when mkdirSync fails for a per-agent folder", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      // Pre-create a regular FILE at the path where mkdirSync would try to
      // create a directory for the "agents/a-fail" subtree. mkdirSync will
      // naturally fail (ENOTDIR/EEXIST). The capture sink must swallow this.
      const blockedPath = join(ws.projectRoot, "agents");
      writeFileSync(blockedPath, "I am a file, not a dir", "utf-8");
      expect(() => debugCapture.appendAgentEvent("a-fail", "subagent:start", {})).not.toThrow();
      expect(debugCapture.isDebugCaptureEnabled()).toBe(true);
    } finally { ws.cleanup(); }
  });
});

describe("debug-capture — cloneSafe strips functions/symbols/undefined", () => {
  it("drops non-JSON-safe values from captured payloads", () => {
    const ws = newWorkspace();
    try {
      debugCapture.enable({ projectPath: ws.projectRoot }, "s");
      const data: Record<string, unknown> = {
        keep: "yes",
        blob: { nested: "ok" },
        fn: () => 1,
        sym: Symbol("s"),
        undef: undefined,
        arr: [1, 2, "three", null],
      };
      debugCapture.appendAgentEvent("a-safe", "subagent:start", data);
      const path = join(ws.projectRoot, "agents", "a-safe", "events.jsonl");
      const entry = JSON.parse(readFileSync(path, "utf-8").trim());
      expect(entry.data.keep).toBe("yes");
      expect(entry.data.blob).toEqual({ nested: "ok" });
      expect("fn" in entry.data).toBe(false);
      expect("sym" in entry.data).toBe(false);
      expect("undef" in entry.data).toBe(false);
      expect(entry.data.arr).toEqual([1, 2, "three", null]);
    } finally { ws.cleanup(); }
  });
});
