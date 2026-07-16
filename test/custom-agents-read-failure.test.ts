import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only readFile so a single agent file fails to read while the rest load
// normally. Every other fs/promises export delegates to the real module.
vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn((path: string, options: BufferEncoding) => {
      if (typeof path === "string" && path.endsWith("boom.md")) {
        const err: NodeJS.ErrnoException = new Error("simulated read failure");
        err.code = "EMFILE";
        return Promise.reject(err);
      }
      return actual.readFile(path, options);
    }),
  };
});

import { loadCustomAgents } from "../src/custom-agents.js";
import { onTelemetry } from "../src/telemetry.js";

describe("loadCustomAgents read failures", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-read-fail-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpDir;
    const dir = join(tmpDir, ".pi", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ok.md"), "---\ndescription: healthy\n---\nbody");
    writeFileSync(join(dir, "boom.md"), "---\ndescription: unreadable\n---\nbody");
  });

  afterEach(() => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits a telemetry signal on read failure instead of silently dropping the agent", async () => {
    const failures: { file: string; source: string; code: string }[] = [];
    const unsubscribe = onTelemetry("agent:file-read-failed", payload => {
      failures.push(payload);
    });

    try {
      const result = await loadCustomAgents(tmpDir);

      // The healthy agent still loads; the unreadable one is skipped but reported.
      expect(result.has("ok")).toBe(true);
      expect(result.has("boom")).toBe(false);
      expect(failures).toEqual([{ file: "boom.md", source: "project", code: "EMFILE" }]);
    } finally {
      unsubscribe();
    }
  });
});
