import { describe, expect, it, vi } from "vitest";
import { buildHandoffPrompt, parseHandoff, renderHandoffForParent } from "../src/handoff.js";

describe("parseHandoff", () => {
  it("extracts valid JSON from a ```json block", () => {
    const text = `Here is my analysis...

\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Found and fixed the rate-limiting bug",
  "findings": ["The interval was 0ms", "Fixed to 1000ms"]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("handoff");
    expect(result!.status).toBe("success");
    expect(result!.summary).toBe("Found and fixed the rate-limiting bug");
    expect(result!.findings).toEqual(["The interval was 0ms", "Fixed to 1000ms"]);
  });

  it("extracts valid JSON from raw text (no fence)", () => {
    const text = `Some text before
{
  "type": "handoff",
  "status": "partial",
  "summary": "Partially investigated the issue",
  "findings": ["Root cause is in the parser", "Need more time to fix"]
}`;

    const result = parseHandoff(text);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("handoff");
    expect(result!.status).toBe("partial");
    expect(result!.findings).toHaveLength(2);
  });

  it("returns null for malformed JSON and logs warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Broken JSON
  "findings": [missing comma]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("malformed JSON"),
    );

    warnSpy.mockRestore();
  });

  it("returns null when summary field is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "findings": ["Something"]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("summary"),
    );

    warnSpy.mockRestore();
  });

  it("returns null for empty string", () => {
    const result = parseHandoff("");
    expect(result).toBeNull();
  });

  it("handles truncated JSON gracefully (returns null)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Incomplete`;

    const result = parseHandoff(text);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("parses optional fields (nextSteps, confidence, evidence)", () => {
    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "failed",
  "summary": "Could not complete the task",
  "findings": ["The API is unreachable", "Authentication fails"],
  "nextSteps": ["Check network connectivity", "Verify credentials"],
  "confidence": 0.1,
  "evidence": ["/tmp/error.log", "/etc/config.yaml"]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.nextSteps).toEqual(["Check network connectivity", "Verify credentials"]);
    expect(result!.confidence).toBe(0.1);
    expect(result!.evidence).toEqual(["/tmp/error.log", "/etc/config.yaml"]);
  });

  it("parses v2 optional fields (files, artifacts)", () => {
    const text = `\`\`\`json
{
  "type": "handoff",
  "status": "success",
  "summary": "Completed",
  "findings": ["Something"],
  "files": ["/path/a.ts"],
  "artifacts": [{"type": "design", "path": "/path/b.md"}]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).not.toBeNull();
    expect(result!.files).toEqual(["/path/a.ts"]);
    expect(result!.artifacts).toEqual([{"type": "design", "path": "/path/b.md"}]);
  });

  it("returns null when type is not 'handoff'", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const text = `\`\`\`json
{
  "type": "report",
  "status": "success",
  "summary": "Some report",
  "findings": ["Thing"]
}
\`\`\``;

    const result = parseHandoff(text);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("type"),
    );

    warnSpy.mockRestore();
  });

  it("returns null for null input", () => {
    const result = parseHandoff(null as unknown as string);
    expect(result).toBeNull();
  });
});

describe("buildHandoffPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildHandoffPrompt();
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("contains expected field descriptions", () => {
    const prompt = buildHandoffPrompt();
    expect(prompt).toContain("type");
    expect(prompt).toContain("status");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("findings");
    expect(prompt).toContain("nextSteps");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("evidence");
    expect(prompt).toContain("files");
    expect(prompt).toContain("artifacts");
  });

  it("includes a JSON example", () => {
    const prompt = buildHandoffPrompt();
    expect(prompt).toContain("```json");
  });
});

describe("renderHandoffForParent", () => {
  it("produces readable text with all fields", () => {
    const handoff = {
      type: "handoff" as const,
      status: "success" as const,
      summary: "Completed the investigation and fixed the bug",
      findings: ["The interval was 0ms", "Fixed to 1000ms"],
      nextSteps: ["Write a test", "Deploy"],
      confidence: 0.85,
      evidence: ["/path/to/file.ts"],
      files: ["/path/to/new_file.ts"],
      artifacts: [{ type: "design", path: "/path/to/design.md" }],
    };

    const rendered = renderHandoffForParent(handoff);

    expect(rendered).toContain("[Handoff: completed successfully]");
    expect(rendered).toContain("Summary: Completed the investigation and fixed the bug");
    expect(rendered).toContain("Findings:");
    expect(rendered).toContain("  - The interval was 0ms");
    expect(rendered).toContain("  - Fixed to 1000ms");
    expect(rendered).toContain("Next Steps:");
    expect(rendered).toContain("  - Write a test");
    expect(rendered).toContain("  - Deploy");
    expect(rendered).toContain("Confidence: 85%");
    expect(rendered).toContain("Evidence:");
    expect(rendered).toContain("  - /path/to/file.ts");
    expect(rendered).toContain("Files:");
    expect(rendered).toContain("  - /path/to/new_file.ts");
    expect(rendered).toContain("Artifacts:");
    expect(rendered).toContain("  - [design] /path/to/design.md");
  });

  it("handles 'partial' and 'failed' statuses", () => {
    expect(renderHandoffForParent({
      type: "handoff",
      status: "partial",
      summary: "s",
      findings: ["f"],
    })).toContain("partially completed");

    expect(renderHandoffForParent({
      type: "handoff",
      status: "failed",
      summary: "s",
      findings: ["f"],
    })).toContain("failed");
  });

  it("omits optional sections when not provided", () => {
    const handoff = {
      type: "handoff" as const,
      status: "success" as const,
      summary: "Done",
      findings: ["Result"],
    };

    const rendered = renderHandoffForParent(handoff);
    expect(rendered).not.toContain("Next Steps:");
    expect(rendered).not.toContain("Confidence:");
    expect(rendered).not.toContain("Evidence:");
    expect(rendered).not.toContain("Files:");
    expect(rendered).not.toContain("Artifacts:");
  });
});
