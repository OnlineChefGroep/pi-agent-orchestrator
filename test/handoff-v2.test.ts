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
