import { describe, expect, it, vi } from "vitest";
import {
  buildHandoffPrompt,
  type HandoffBranchArtifact,
  type HandoffFileArtifact,
  type HandoffNoteArtifact,
  type HandoffUrlArtifact,
  parseHandoff,
  renderHandoffForParent,
} from "../src/handoff.js";

describe("Handoff v2 \u2014 typed artifacts", () => {
  describe("parseHandoff \u2014 v2 file artifact", () => {
    it("parses a file artifact with required path", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Fixed",
  "findings": ["x"],
  "artifacts": [{"type": "file", "path": "/src/foo.ts"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r).not.toBeNull();
      expect(r!.artifacts).toEqual([{ type: "file", path: "/src/foo.ts" }]);
    });

    it("parses a file artifact with optional mimeType and title", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "file", "path": "/x.ts", "title": "Fix", "mimeType": "text/typescript"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "file", path: "/x.ts", title: "Fix", mimeType: "text/typescript" }]);
    });

    it("rejects a file artifact with empty path", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "file", "path": ""}]
}
\`\`\``;
      const r = parseHandoff(text);
      // Empty path is not coercible \u2192 handoff-level validation rejects
      expect(r).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("artifacts"));
      warnSpy.mockRestore();
    });
  });

  describe("parseHandoff \u2014 v2 branch artifact", () => {
    it("parses a branch artifact with required branch", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "branch", "branch": "fix/x", "base": "main", "commits": ["abc1234", "def5678"], "title": "Fix branch"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "branch", branch: "fix/x", base: "main", commits: ["abc1234", "def5678"], title: "Fix branch" }]);
    });

    it("rejects a branch artifact with empty branch name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "branch", "branch": ""}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("parseHandoff \u2014 v2 url artifact", () => {
    it("parses a url artifact with required url", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "url", "url": "https://example.com/spec", "title": "Spec", "description": "External reference"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "url", url: "https://example.com/spec", title: "Spec", description: "External reference" }]);
    });

    it("rejects a url artifact with empty url", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "url", "url": ""}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("parseHandoff \u2014 v2 note artifact", () => {
    it("parses a note artifact with required title + value", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "note", "title": "Follow-up", "value": "Investigate the backoff curve", "mimeType": "text/markdown"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "note", title: "Follow-up", value: "Investigate the backoff curve", mimeType: "text/markdown" }]);
    });

    it("rejects a note artifact with missing value", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "note", "title": "x"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("parseHandoff \u2014 legacy coercion", () => {
    it("coerces {type: <unknown>, path} into a file artifact", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "design", "path": "/path/b.md", "title": "old"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "file", path: "/path/b.md", mimeType: undefined, title: "old" }]);
    });

    it("coerces {type: <unknown>, branch} into a branch artifact", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "gitref", "branch": "feat/x", "base": "main", "title": "t"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "branch", branch: "feat/x", base: "main", title: "t" }]);
    });

    it("coerces {type: <unknown>, url} into a url artifact", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "link", "url": "https://x.com", "title": "x", "description": "d"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "url", url: "https://x.com", title: "x", description: "d" }]);
    });

    it("coerces {type: <unknown>, title+value} into a note artifact", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "memo", "title": "Reminder", "value": "Check the failing test", "mimeType": "text/plain"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toEqual([{ type: "note", title: "Reminder", value: "Check the failing test", mimeType: "text/plain" }]);
    });

    it("rejects handoffs with completely unrecognised artifacts (no path/branch/url/title+value)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "mystery", "x": 1}]
}
\`\`\``;
      const r = parseHandoff(text);
      // A fully-unrecognised artifact (no path/branch/url/title+value) is
      // rejected at the handoff level rather than silently dropped, since
      // v2 protocol is strict about artifact shape and silent drops would
      // hide agent-side bugs.
      expect(r).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("artifacts"));
      warnSpy.mockRestore();
    });

    it("mixes v2 strict and legacy artifacts in the same handoff", () => {
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [
    {"type": "file", "path": "/a.ts"},
    {"type": "design", "path": "/b.md", "title": "old"},
    {"type": "note", "title": "T", "value": "V"}
  ]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r!.artifacts).toHaveLength(3);
      expect(r!.artifacts![0]).toEqual({ type: "file", path: "/a.ts" });
      expect(r!.artifacts![1]).toEqual({ type: "file", path: "/b.md", mimeType: undefined, title: "old" });
      expect(r!.artifacts![2]).toEqual({ type: "note", title: "T", value: "V" });
    });
  });

  describe("parseHandoff \u2014 length limits", () => {
    it("keeps a legacy-coerced file artifact with an over-length path (graceful-degrade)", () => {
      // Legacy coercion (path->file) does NOT enforce v2 length limits; the
      // v2 length check only runs on strict v2-strict artifacts. The handoff
      // still parses successfully and the artifact is kept with its full
      // (over-length) path. v2-strict enforcement is covered by the
      // "rejects a file artifact with empty path" test above.
      const longPath = `/${"a".repeat(4096)}`;
      const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "x",
  "findings": ["x"],
  "artifacts": [{"type": "design", "path": "${longPath}"}]
}
\`\`\``;
      const r = parseHandoff(text);
      expect(r).not.toBeNull();
      expect(r!.artifacts).toHaveLength(1);
      expect(r!.artifacts![0].type).toBe("file");
      expect(r!.artifacts![0].path).toBe(longPath);
    });
  });

  describe("renderHandoffForParent \u2014 v2 types", () => {
    const baseHandoff = {
      type: "handoff" as const,
      status: "success" as const,
      summary: "s",
      findings: ["f"],
    };

    it("renders a file artifact with title + mimeType", () => {
      const a: HandoffFileArtifact = { type: "file", path: "/x.ts", title: "T", mimeType: "text/typescript" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [file] T: /x.ts (text/typescript)");
    });

    it("renders a file artifact without title", () => {
      const a: HandoffFileArtifact = { type: "file", path: "/x.ts" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [file] /x.ts");
      expect(out).not.toContain("undefined");
    });

    it("renders a branch artifact with base + commits", () => {
      const a: HandoffBranchArtifact = { type: "branch", branch: "fix/x", base: "main", commits: ["a", "b", "c"] };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [branch] fix/x (from main) +3 commits");
    });

    it("renders a branch artifact singular commit", () => {
      const a: HandoffBranchArtifact = { type: "branch", branch: "fix/x", commits: ["a"] };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("+1 commit");
      expect(out).not.toContain("+1 commits");
    });

    it("renders a branch artifact with no base and no commits", () => {
      const a: HandoffBranchArtifact = { type: "branch", branch: "fix/x" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [branch] fix/x");
      expect(out).not.toContain("from");
      expect(out).not.toContain("commit");
    });

    it("renders a url artifact with title + description", () => {
      const a: HandoffUrlArtifact = { type: "url", url: "https://x.com", title: "X", description: "the X site" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [url] X: https://x.com \u2014 the X site");
    });

    it("renders a note artifact single-line", () => {
      const a: HandoffNoteArtifact = { type: "note", title: "T", value: "short" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [note] T: short");
    });

    it("renders a note artifact multi-line with indentation", () => {
      const a: HandoffNoteArtifact = { type: "note", title: "T", value: "line1\nline2\nline3" };
      const out = renderHandoffForParent({ ...baseHandoff, artifacts: [a] });
      expect(out).toContain("  - [note] T:");
      expect(out).toContain("      line1");
      expect(out).toContain("      line2");
      expect(out).toContain("      line3");
    });
  });

  describe("buildHandoffPrompt \u2014 v2 references", () => {
    it("balanced template documents the v2 typed artifact types", () => {
      const prompt = buildHandoffPrompt("balanced");
      expect(prompt).toContain('"type": "file"');
      expect(prompt).toContain('"type": "branch"');
    });

    it("minimal template documents all four v2 types", () => {
      const prompt = buildHandoffPrompt("minimal");
      expect(prompt).toContain('"type": "file"');
      expect(prompt).toContain('"type": "branch"');
      expect(prompt).toContain('"type": "url"');
      expect(prompt).toContain('"type": "note"');
    });

    it("balanced template still has the schema fields list", () => {
      const prompt = buildHandoffPrompt("balanced");
      expect(prompt).toContain("Fields:");
      expect(prompt).toContain("findings");
      expect(prompt).toContain("summary");
    });
  });
});

// ── Benchmark: parseHandoff — parse time ──────────────────────────────

function benchmarkLog(
  label: string,
  measured: number,
  threshold: number,
  unit = "ms",
): void {
  const pct = threshold > 0 ? (measured / threshold) * 100 : 0;
  let status: string;
  if (measured > threshold) {
    status = "FAIL";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK FAIL: ${label} \u2014 ${measured} exceeds threshold ${threshold}`,
    );
  } else if (pct > 80) {
    status = "WARN";
    console.warn(
      `\u26a0\ufe0f  BENCHMARK WARN: ${label} \u2014 ${measured} approaching threshold ${threshold} (${pct.toFixed(0)}%)`,
    );
  } else {
    status = "OK";
  }
  const measuredStr = unit === "\u00b5s"
    ? `${(measured * 1000).toFixed(1)}\u00b5s`
    : `${measured.toFixed(3)}ms`;
  const thresholdStr = unit === "\u00b5s"
    ? `${(threshold * 1000).toFixed(1)}\u00b5s`
    : `${threshold.toFixed(3)}ms`;
  process.stdout.write(
    `[BENCHMARK] ${label} ${measuredStr}/${thresholdStr} ${pct.toFixed(0)}% ${status}\n`,
  );
}

function buildHandoffText(opts: {
  findingsCount: number;
  artifactCount: number;
  legacy?: boolean;
}): string {
  const findings = Array.from({ length: opts.findingsCount }, (_, i) => `Finding ${i + 1}: something noteworthy`);
  const artifacts = Array.from({ length: opts.artifactCount }, (_, i) => {
    if (opts.legacy) {
      // Legacy loose shape - unknown `type` string
      return `{"type": "old", "path": "/path/file-${i}.ts", "title": "File ${i}"}`;
    }
    return `{"type": "file", "path": "/path/file-${i}.ts", "title": "File ${i}"}`;
  });
  return `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Implemented the feature with findings and artifacts to share",
  "findings": [${findings.map(f => `"${f}"`).join(", ")}],
  "artifacts": [${artifacts.join(", ")}]
}
\`\`\``;
}

describe("Benchmark: parseHandoff — parse time", () => {
  it("small handoff (3 findings, 1 artifact) under 100\u00b5s", () => {
    const text = buildHandoffText({ findingsCount: 3, artifactCount: 1 });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      parseHandoff(text);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 1000;

    benchmarkLog("parseHandoff small", perCall, 0.1, "\u00b5s");
    expect(perCall).toBeLessThan(0.1);
  });

  it("medium handoff (10 findings, 5 v2 artifacts) under 200\u00b5s", () => {
    const text = buildHandoffText({ findingsCount: 10, artifactCount: 5 });

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      parseHandoff(text);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 500;

    benchmarkLog("parseHandoff medium v2", perCall, 0.2, "\u00b5s");
    expect(perCall).toBeLessThan(0.2);
  });

  // Large handoff regime (realistic bulk-spawn handoff).
  // 50 v2-strict artifacts is the upper bound (MAX_ARTIFACTS_COUNT).
  // This is the regime where any per-artifact duplicate work shows up.
  it("large handoff (50 findings, 50 v2 artifacts) under 2ms", () => {
    const text = buildHandoffText({ findingsCount: 50, artifactCount: 50 });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseHandoff(text);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("parseHandoff large 50 v2 artifacts", perCall, 2);
    expect(perCall).toBeLessThan(2);
  });

  it("large handoff (50 findings, 50 legacy artifacts) under 2ms (coercion path)", () => {
    const text = buildHandoffText({ findingsCount: 50, artifactCount: 50, legacy: true });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseHandoff(text);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("parseHandoff large 50 legacy artifacts", perCall, 2);
    expect(perCall).toBeLessThan(2);
  });

  // Over-limit string truncation (exercises truncateStrings tree walk + actual slice).
  // Summary > MAX_SUMMARY_LENGTH (10000) to force truncation, plus an artifact
  // value > MAX_STRING_LENGTH (50000) to force the inner truncation path.
  it("large handoff with over-limit strings (exercises truncateStrings slice) under 2.5ms", () => {
    const longSummary = "x".repeat(12000);
    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "${longSummary}",
  "findings": ["f1", "f2", "f3"],
  "artifacts": [{"type": "note", "title": "big", "value": "${"y".repeat(51000)}"}]
}
\`\`\``;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      parseHandoff(text);
    }
    const elapsed = performance.now() - start;
    const perCall = elapsed / 100;

    benchmarkLog("parseHandoff long summary", perCall, 2.5);
    expect(perCall).toBeLessThan(2.5);
  });
});
