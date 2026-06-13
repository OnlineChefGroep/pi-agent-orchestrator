import { describe, expect, it } from "vitest";
import {
  buildDetails,
  buildNotificationDetails,
  createActivityTracker,
  escapeXml,
  formatLifetimeTokens,
  formatTaskNotification,
  getStatusLabel,
  getStatusNote,
  textResult,
} from "../src/tool-result-helpers.js";
import type { AgentRecord, LifetimeUsage } from "../src/types.js";
import type { AgentActivity } from "../src/ui/agent-ui-types.js";

describe("textResult", () => {
  it("returns a text content object", () => {
    const result = textResult("hello");
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("accepts optional details", () => {
    const result = textResult("hello", { displayName: "Test" } as any);
    expect(result.content[0].text).toBe("hello");
    expect(result.details).toBeDefined();
  });
});

describe("formatLifetimeTokens", () => {
  it("returns empty string for zero tokens", () => {
    const obj = { lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 } };
    expect(formatLifetimeTokens(obj)).toBe("");
  });

  it("returns formatted tokens for non-zero usage", () => {
    const obj = { lifetimeUsage: { input: 5000, output: 3000, cacheWrite: 1000 } };
    const result = formatLifetimeTokens(obj);
    expect(result).toMatch(/\d/);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("createActivityTracker", () => {
  it("initializes with default values", () => {
    const { state } = createActivityTracker();
    expect(state.turnCount).toBe(1);
    expect(state.toolUses).toBe(0);
    expect(state.responseText).toBe("");
    expect(state.maxTurns).toBeUndefined();
    expect(state.lifetimeUsage).toEqual({ input: 0, output: 0, cacheWrite: 0 });
    expect(state.lastSeenMs).toBeGreaterThan(0);
  });

  it("accepts maxTurns", () => {
    const { state } = createActivityTracker(5);
    expect(state.maxTurns).toBe(5);
  });

  it("callbacks track tool usage", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onToolActivity({ type: "start", toolName: "read" });
    expect(state.activeTools.size).toBe(1);

    callbacks.onToolActivity({ type: "end", toolName: "read" });
    expect(state.toolUses).toBe(1);
    expect(state.activeTools.size).toBe(0);
  });

  it("callbacks track text deltas", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onTextDelta("a", "hello world");
    expect(state.responseText).toBe("hello world");
  });

  it("callbacks track turn ends", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onTurnEnd(3);
    expect(state.turnCount).toBe(3);
  });

  it("callbacks track session creation", () => {
    const { state, callbacks } = createActivityTracker();
    const session = { id: "test-session" };
    callbacks.onSessionCreated(session);
    expect(state.session).toBe(session);
  });

  it("callbacks track assistant usage", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onAssistantUsage({ input: 100, output: 50, cacheWrite: 10 });
    expect(state.lifetimeUsage.input).toBe(100);
    expect(state.lifetimeUsage.output).toBe(50);
    expect(state.lifetimeUsage.cacheWrite).toBe(10);
  });

  it("callbacks update lastSeenMs", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onToolActivity({ type: "start", toolName: "read" });
    expect(state.lastSeenMs).toBeGreaterThan(0);
  });

  it("stream update callback fires on tool activity", () => {
    let fired = false;
    const { callbacks } = createActivityTracker(undefined, () => { fired = true; });
    callbacks.onToolActivity({ type: "start", toolName: "grep" });
    expect(fired).toBe(true);
  });

  it("stream update callback fires on text delta", () => {
    let fired = false;
    const { callbacks } = createActivityTracker(undefined, () => { fired = true; });
    callbacks.onTextDelta("x", "new text");
    expect(fired).toBe(true);
  });

  it("stream update callback fires on turn end", () => {
    let fired = false;
    const { callbacks } = createActivityTracker(undefined, () => { fired = true; });
    callbacks.onTurnEnd(2);
    expect(fired).toBe(true);
  });

  it("stream update callback fires on usage", () => {
    let fired = false;
    const { callbacks } = createActivityTracker(undefined, () => { fired = true; });
    callbacks.onAssistantUsage({ input: 1, output: 2, cacheWrite: 3 });
    expect(fired).toBe(true);
  });
});

describe("getStatusLabel", () => {
  it("returns Error for error status", () => {
    expect(getStatusLabel("error", "something broke")).toBe("Error: something broke");
  });

  it("returns fallback for error without message", () => {
    expect(getStatusLabel("error")).toBe("Error: unknown");
  });

  it("returns Aborted for aborted status", () => {
    expect(getStatusLabel("aborted")).toBe("Aborted (max turns exceeded)");
  });

  it("returns Wrapped up for steered status", () => {
    expect(getStatusLabel("steered")).toBe("Wrapped up (turn limit)");
  });

  it("returns Stopped for stopped status", () => {
    expect(getStatusLabel("stopped")).toBe("Stopped");
  });

  it("returns Done for unknown status", () => {
    expect(getStatusLabel("completed")).toBe("Done");
    expect(getStatusLabel("running")).toBe("Done");
  });
});

describe("getStatusNote", () => {
  it("returns aborted note", () => {
    expect(getStatusNote("aborted")).toContain("aborted");
  });

  it("returns steered note", () => {
    expect(getStatusNote("steered")).toContain("wrapped up");
  });

  it("returns stopped note", () => {
    expect(getStatusNote("stopped")).toContain("stopped by user");
  });

  it("returns empty for other statuses", () => {
    expect(getStatusNote("completed")).toBe("");
    expect(getStatusNote("running")).toBe("");
  });
});

describe("escapeXml", () => {
  it("escapes ampersands", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than", () => {
    expect(escapeXml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes all together", () => {
    expect(escapeXml("<tag attr=\"val\">&amp;</tag>")).toBe(
      "&lt;tag attr=\"val\"&gt;&amp;amp;&lt;/tag&gt;"
    );
  });

  it("leaves normal text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("formatTaskNotification", () => {
  const baseRecord: AgentRecord = {
    id: "agent-1",
    type: "Explore",
    description: "Test agent",
    status: "completed",
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    toolUses: 5,
    level: 0,
    lifetimeUsage: { input: 1000, output: 500, cacheWrite: 0 },
    result: "Task completed successfully",
    compactionCount: 1,
    invocation: {
      type: "Explore",
      description: "Test agent",
      model: "claude",
      toolAllowList: ["read"],
      level: 0,
    },
  } as any;

  it("produces valid task notification XML", () => {
    const xml = formatTaskNotification(baseRecord, 200);
    expect(xml).toContain("<task-notification>");
    expect(xml).toContain("<task-id>agent-1</task-id>");
    expect(xml).toContain("<status>Done</status>");
  });

  it("truncates long results", () => {
    const record = { ...baseRecord, result: "a".repeat(300) };
    const xml = formatTaskNotification(record, 10);
    expect(xml).toContain("truncated");
    expect(xml.split("a").length - 1).toBeLessThan(300);
  });

  it("handles missing result", () => {
    const record = { ...baseRecord, result: undefined };
    const xml = formatTaskNotification(record, 200);
    expect(xml).toContain("No output");
  });
});

describe("buildDetails", () => {
  const base = {
    displayName: "Explore",
    description: "Test",
    subagentType: "Explore" as const,
    modelName: "claude",
    tags: [],
  };

  const record = {
    toolUses: 3,
    startedAt: 1000,
    completedAt: 5000,
    status: "completed",
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 } as LifetimeUsage,
    validated: true,
  };

  it("builds details with record fields", () => {
    const details = buildDetails(base, record);
    expect(details.displayName).toBe("Explore");
    expect(details.toolUses).toBe(3);
    expect(details.durationMs).toBe(4000);
    expect(details.status).toBe("completed");
  });

  it("merges overrides", () => {
    const details = buildDetails(base, record, undefined, { toolUses: 99 });
    expect(details.toolUses).toBe(99);
  });

  it("includes activity when provided", () => {
    const activity: AgentActivity = {
      turnCount: 5,
      maxTurns: 10,
      activeTools: new Map(),
      toolUses: 10,
      responseText: "",
      session: undefined,
      lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
      lastSeenMs: Date.now(),
    };
    const details = buildDetails(base, record, activity);
    expect(details.turnCount).toBe(5);
    expect(details.maxTurns).toBe(10);
  });

  it("uses current time when completedAt is missing", () => {
    const incomplete = { ...record, completedAt: undefined };
    const details = buildDetails(base, incomplete as any);
    expect(details.durationMs).toBeGreaterThan(0);
  });
});

describe("buildNotificationDetails", () => {
  const record: AgentRecord = {
    id: "agent-1",
    type: "Explore",
    description: "Test",
    status: "completed",
    toolUses: 3,
    startedAt: 0,
    completedAt: 1000,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    result: "All done!",
    level: 0,
    invocation: { type: "Explore", description: "Test", model: "claude", toolAllowList: [], level: 0 },
  } as any;

  it("builds notification details", () => {
    const details = buildNotificationDetails(record, 200);
    expect(details.id).toBe("agent-1");
    expect(details.status).toBe("completed");
    expect(details.toolUses).toBe(3);
    expect(details.durationMs).toBe(1000);
    expect(details.resultPreview).toBe("All done!");
  });

  it("truncates long results", () => {
    const longRecord = { ...record, result: "x".repeat(500) };
    const details = buildNotificationDetails(longRecord, 10);
    expect(details.resultPreview).toContain("…");
  });

  it("handles missing result", () => {
    const noResult = { ...record, result: undefined };
    const details = buildNotificationDetails(noResult, 200);
    expect(details.resultPreview).toBe("No output.");
  });
});

describe("additional coverage for createActivityTracker", () => {
  it("callbacks track tool usage end when tool is not found", () => {
    const { state, callbacks } = createActivityTracker();
    callbacks.onToolActivity({ type: "start", toolName: "read" });
    // This will hit the else case of `if (name === activity.toolName)` in the loop
    callbacks.onToolActivity({ type: "end", toolName: "write" });
    expect(state.toolUses).toBe(1);
    expect(state.activeTools.size).toBe(1);
  });
});

describe("additional coverage for formatTaskNotification", () => {
  const baseRecord: AgentRecord = {
    id: "agent-1",
    type: "Explore",
    description: "Test agent",
    status: "completed",
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    toolUses: 5,
    level: 0,
    lifetimeUsage: { input: 1000, output: 500, cacheWrite: 0 },
    result: "Task completed successfully",
    compactionCount: 0,
    invocation: {
      type: "Explore",
      description: "Test agent",
      model: "claude",
      toolAllowList: ["read"],
      level: 0,
    },
  } as any;

  it("handles missing startedAt", () => {
    const record = { ...baseRecord, startedAt: undefined };
    const xml = formatTaskNotification(record, 200);
    expect(xml).toContain("<duration_ms>");
  });

  it("handles missing completedAt", () => {
    const record = { ...baseRecord, completedAt: undefined };
    const xml = formatTaskNotification(record, 200);
    expect(xml).toContain("<duration_ms>0</duration_ms>");
  });

  it("handles contextPercent", () => {
    const record = { ...baseRecord, session: { getSessionStats: () => ({ contextUsage: { percent: 50.4 } }) } };
    const xml = formatTaskNotification(record, 200);
    expect(xml).toContain("<context_percent>50</context_percent>");
  });

  it("handles toolCallId and outputFile", () => {
    const record = { ...baseRecord, toolCallId: "call_123", outputFile: "out.txt" };
    const xml = formatTaskNotification(record, 200);
    expect(xml).toContain("<tool-use-id>call_123</tool-use-id>");
    expect(xml).toContain("<output-file>out.txt</output-file>");
  });
});

describe("additional coverage for buildDetails", () => {
  const base = {
    displayName: "Explore",
    description: "Test",
    subagentType: "Explore" as const,
    modelName: "claude",
    tags: [],
  };

  const record = {
    toolUses: 3,
    startedAt: undefined,
    completedAt: 5000,
    status: "completed",
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 } as LifetimeUsage,
    validated: true,
  };

  it("handles missing startedAt", () => {
    const details = buildDetails(base, record as any);
    expect(details.durationMs).toBe(5000);
  });
});


  it("handles completedAt but missing startedAt in buildNotificationDetails", () => {
    const recordWithCompleted = { id: "agent-1", description: "Test", status: "completed", toolUses: 3, lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 }, completedAt: 5000, startedAt: undefined };
    const details = buildNotificationDetails(recordWithCompleted as any, 200);
    expect(details.durationMs).toBe(5000);
  });

describe("additional coverage for buildNotificationDetails", () => {
  const record: AgentRecord = {
    id: "agent-1",
    type: "Explore",
    description: "Test",
    status: "completed",
    toolUses: 3,
    startedAt: undefined,
    completedAt: undefined,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    result: "All done!",
    level: 0,
    invocation: { type: "Explore", description: "Test", model: "claude", toolAllowList: [], level: 0 },
  } as any;

  it("handles missing startedAt and completedAt", () => {
    const details = buildNotificationDetails(record, 200);
    expect(details.durationMs).toBe(0);
  });

describe("more buildNotificationDetails coverage", () => {
  it("handles completedAt but missing startedAt in buildNotificationDetails", () => {
    const recordWithCompleted = { id: "agent-1", description: "Test", status: "completed", toolUses: 3, lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 }, completedAt: 5000, startedAt: undefined };
    const details = buildNotificationDetails(recordWithCompleted as any, 200);
    expect(details.durationMs).toBe(5000);
  });
});
});
