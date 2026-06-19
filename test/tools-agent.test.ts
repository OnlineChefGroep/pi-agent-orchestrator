import { describe, expect, it, vi } from "vitest";

// Mock ../src/ui/tui-shim.js Text class
vi.mock("../src/ui/tui-shim.js", () => {
  class MockText {
    content: string;
    constructor(content: string, _x: number, _y: number) {
      this.content = content;
    }
  }
  return { Text: MockText };
});

import { buildSpawnOptions, renderAgentResult, setupSessionCallbacks } from "../src/tools/agent.js";
import type { Theme } from "../src/ui/theme.js";

const theme: Theme = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  title: "\x1b[1m",
  muted: "\x1b[2m",
  accent: "\x1b[36m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  warning: "\x1b[33m",
  highlight: "\x1b[1;35m",
  border: "\x1b[2m",
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

describe("buildSpawnOptions", () => {
  it("maps all fields correctly", () => {
    const input = {
      description: "Test agent",
      model: { id: "claude" } as any,
      maxTurns: 10,
      isolated: true,
      inheritContext: false,
      thinking: "high" as any,
      isolation: "worktree" as any,
      invocation: { type: "Explore", description: "", model: "", toolAllowList: [], level: 0 },
    };
    const result = buildSpawnOptions(input);
    expect(result.description).toBe("Test agent");
    expect(result.model).toBe(input.model);
    expect(result.maxTurns).toBe(10);
    expect(result.isolated).toBe(true);
    expect(result.inheritContext).toBe(false);
    expect(result.thinkingLevel).toBe("high");
    expect(result.isolation).toBe("worktree");
    expect(result.invocation).toBe(input.invocation);
  });

  it("passes undefined thinking and isolation when not set", () => {
    const input = {
      description: "simple",
      model: undefined as any,
      maxTurns: undefined,
      isolated: false,
      inheritContext: true,
      thinking: undefined as any,
      isolation: undefined as any,
      invocation: { type: "Explore", description: "", model: "", toolAllowList: [], level: 0 },
    };
    const result = buildSpawnOptions(input);
    expect(result.thinkingLevel).toBeUndefined();
    expect(result.isolation).toBeUndefined();
    expect(result.maxTurns).toBeUndefined();
  });
});

describe("setupSessionCallbacks", () => {
  it("sets onSessionCreated when none exists", () => {
    const target: { onSessionCreated?: (s: any) => void } = {};
    let called = false;
    setupSessionCallbacks(target, () => { called = true; });
    target.onSessionCreated?.("session");
    expect(called).toBe(true);
  });

  it("wraps existing onSessionCreated", () => {
    const calls: string[] = [];
    const target = {
      onSessionCreated: (s: any) => calls.push(`orig:${s}`),
    };
    setupSessionCallbacks(target, (s: any) => calls.push(`after:${s}`));
    target.onSessionCreated?.("session");
    expect(calls).toEqual(["orig:session", "after:session"]);
  });
});

describe("renderAgentResult", () => {
  it("handles missing details (text-only fallback)", () => {
    const result = { content: [{ type: "text" as const, text: "hello" }] };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toBe("hello");
  });

  it("shows spinner for running/partial state", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "running" as const,
      toolUses: 0,
    };
    const result = {
      content: [{ type: "text" as const, text: "..." }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: true }, theme) as any;
    expect(text.content).toMatch(/thinking/);
  });

  it("shows background launch message", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "background" as const,
      agentId: "agent-123",
      toolUses: 0,
    };
    const result = {
      content: [{ type: "text" as const, text: "ok" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/Running in background/);
    expect(text.content).toMatch(/agent-123/);
  });

  it("shows completed with success icon", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "completed" as const,
      toolUses: 1,
      durationMs: 5000,
    };
    const result = {
      content: [{ type: "text" as const, text: "all done" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/Done/);
  });

  it("shows steered with warning", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "steered" as const,
      toolUses: 2,
      durationMs: 3000,
    };
    const result = {
      content: [{ type: "text" as const, text: "done" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/Wrapped up/);
  });

  it("shows validation badge for completed", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "completed" as const,
      toolUses: 0,
      durationMs: 1000,
      validated: true,
    };
    const result = {
      content: [{ type: "text" as const, text: "x" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/[✅❌]/);
  });

  it("shows expanded output for completed", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "completed" as const,
      toolUses: 0,
      durationMs: 1000,
    };
    const result = {
      content: [{ type: "text" as const, text: "line1\nline2\nline3" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: true, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/line1/);
  });

  it("shows stopped status", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "stopped" as const,
      toolUses: 0,
    };
    const result = {
      content: [{ type: "text" as const, text: "" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/Stopped/);
  });

  it("shows error status", () => {
    const details = {
      displayName: "Explore",
      description: "test",
      status: "error" as const,
      error: "Something broke!",
      toolUses: 1,
    };
    const result = {
      content: [{ type: "text" as const, text: "" }],
      details,
    };
    const text = renderAgentResult(result, { expanded: false, isPartial: false }, theme) as any;
    expect(text.content).toMatch(/Error: Something broke!/);
  });
});
