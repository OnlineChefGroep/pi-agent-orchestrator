import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAgentSession,
  defaultResourceLoaderCtor,
  getAgentDir,
  sessionManagerInMemory,
  settingsManagerCreate,
} = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  defaultResourceLoaderCtor: vi.fn(),
  getAgentDir: vi.fn(() => "/mock/agent-dir"),
  sessionManagerInMemory: vi.fn(() => ({ kind: "memory-session-manager" })),
  settingsManagerCreate: vi.fn(() => ({ kind: "settings-manager" })),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession,
  DefaultResourceLoader: class {
    constructor(options: any) {
      defaultResourceLoaderCtor(options);
    }

    async reload() {}
  },
  getAgentDir,
  SessionManager: { inMemory: sessionManagerInMemory },
  SettingsManager: { create: settingsManagerCreate },
}));

vi.mock("../src/agent-types.js", () => ({
  getConfig: vi.fn(() => ({
    displayName: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    promptMode: "replace",
  })),
  getAgentConfig: vi.fn(() => ({
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    systemPrompt: "You are Explore.",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
  })),
  getMemoryToolNames: vi.fn(() => []),
  getReadOnlyMemoryToolNames: vi.fn(() => []),
  getToolNamesForType: vi.fn(() => ["read"]),
}));

vi.mock("../src/env.js", () => ({
  detectEnv: vi.fn(async () => ({ isGitRepo: false, branch: "", platform: "linux" })),
}));

vi.mock("../src/prompts.js", () => ({
  buildAgentPrompt: vi.fn(() => "system prompt"),
}));

vi.mock("../src/memory.js", () => ({
  buildMemoryBlock: vi.fn(() => ""),
  buildReadOnlyMemoryBlock: vi.fn(() => ""),
}));

vi.mock("../src/skill-loader.js", () => ({
  preloadSkills: vi.fn(() => []),
}));

import { AgentRunnerError, getGraceTurns, getMaxEndHookRevisions, globalCircuitBreaker, resumeAgent, runAgent, setGraceTurns, setMaxEndHookRevisions } from "../src/agent-runner.js";
import { HookRegistry } from "../src/hooks.js";

function createSession(finalText: string) {
  const listeners: Array<(event: any) => void> = [];
  const session = {
    messages: [] as any[],
    subscribe: vi.fn((listener: (event: any) => void) => {
      listeners.push(listener);
      return () => {};
    }),
    prompt: vi.fn(async () => {
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: finalText }],
      });
    }),
    abort: vi.fn(),
    steer: vi.fn(),
    getActiveToolNames: vi.fn(() => ["read"]),
    setActiveToolsByName: vi.fn(),
    setSessionName: vi.fn(),
    bindExtensions: vi.fn(async () => {}),
  };
  return { session, listeners };
}

const ctx = {
  cwd: "/tmp",
  model: { provider: "test", id: "test-model" },
  modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
  getSystemPrompt: vi.fn(() => "parent prompt"),
  sessionManager: { getBranch: vi.fn(() => []) },
} as any;

const pi = {} as any;

beforeEach(() => {
  createAgentSession.mockReset();
  defaultResourceLoaderCtor.mockClear();
  getAgentDir.mockClear();
  sessionManagerInMemory.mockClear();
  settingsManagerCreate.mockClear();
});

describe("agent-runner final output capture", () => {
  it("returns the final assistant text even when no text_delta events were streamed", async () => {
    const { session } = createSession("LOCKED");
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "Say LOCKED", { pi });

    expect(result.responseText).toBe("LOCKED");
  });

  it("binds extensions before prompting", async () => {
    const { session } = createSession("BOUND");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "Say BOUND", { pi });

    expect(session.bindExtensions).toHaveBeenCalledTimes(1);
    expect(session.bindExtensions).toHaveBeenCalledWith(
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    const bindOrder = session.bindExtensions.mock.invocationCallOrder[0];
    const promptOrder = session.prompt.mock.invocationCallOrder[0];
    expect(bindOrder).toBeLessThan(promptOrder);
  });

  it("passes effective cwd and agentDir to the loader and settings manager", async () => {
    const { session } = createSession("CONFIGURED");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "Say CONFIGURED", { pi, cwd: "/tmp/worktree" });

    expect(getAgentDir).toHaveBeenCalledTimes(1);
    expect(defaultResourceLoaderCtor).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/tmp/worktree",
      agentDir: "/mock/agent-dir",
    }));
    expect(settingsManagerCreate).toHaveBeenCalledWith("/tmp/worktree", "/mock/agent-dir");
    expect(sessionManagerInMemory).toHaveBeenCalledWith("/tmp/worktree");
    expect(createAgentSession).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/tmp/worktree",
      agentDir: "/mock/agent-dir",
    }));
  });

  it("suppresses AGENTS.md/CLAUDE.md/APPEND_SYSTEM.md for subagents", async () => {
    const { session } = createSession("ISOLATED");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "Say ISOLATED", { pi });

    // noContextFiles skips AGENTS.md/CLAUDE.md at the loader source;
    // appendSystemPromptOverride suppresses APPEND_SYSTEM.md (no flag equivalent).
    expect(defaultResourceLoaderCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        noContextFiles: true,
        appendSystemPromptOverride: expect.any(Function),
      }),
    );
    // The override returns an empty list so any loaded sources are discarded.
    const ctorArgs = defaultResourceLoaderCtor.mock.calls[0][0];
    expect(ctorArgs.appendSystemPromptOverride(["would-be-loaded"])).toEqual([]);
  });

  it("resumeAgent also falls back to the final assistant message text", async () => {
    const { session } = createSession("RESUMED");

    const result = await resumeAgent(session as any, "Continue");

    expect(result).toBe("RESUMED");
  });

  it("sets the agent name as session name before binding extensions", async () => {
    const { session } = createSession("NAMED");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    expect(session.setSessionName).toHaveBeenCalledWith("Explore");
    const setOrder = session.setSessionName.mock.invocationCallOrder[0];
    const bindOrder = session.bindExtensions.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(bindOrder);
  });

  it("suffixes the session name with a short agentId so parallel spawns are distinguishable", async () => {
    const { session } = createSession("NAMED");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi, agentId: "a1b2c3d4e5f6" });

    expect(session.setSessionName).toHaveBeenCalledWith("Explore#a1b2c3d4");
  });
});

// ─── message_end → onAssistantUsage wiring (issue #38) ─────────────────
// Both runAgent and resumeAgent dispatch usage to the caller via this
// callback. The callback feeds the AgentRecord lifetime accumulator, which
// is the source of truth for total tokens (survives compaction).
describe("agent-runner usage callback wiring", () => {
  function emitMessageEnd(listeners: Array<(e: any) => void>, usage: any) {
    const event = { type: "message_end", message: { role: "assistant", usage } };
    for (const l of listeners) l(event);
  }

  it("runAgent forwards full usage from message_end events", async () => {
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    const seen: Array<{ input: number; output: number; cacheWrite: number }> = [];
    session.prompt = vi.fn(async () => {
      // Two assistant messages over the run
      emitMessageEnd(listeners, { input: 100, output: 50, cacheWrite: 10 });
      emitMessageEnd(listeners, { input: 200, output: 80, cacheWrite: 20 });
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", {
      pi,
      onAssistantUsage: (u) => seen.push(u),
    });

    expect(seen).toEqual([
      { input: 100, output: 50, cacheWrite: 10 },
      { input: 200, output: 80, cacheWrite: 20 },
    ]);
  });

  it("runAgent normalizes partial usage objects to 0 for missing fields", async () => {
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    const seen: any[] = [];
    session.prompt = vi.fn(async () => {
      emitMessageEnd(listeners, { input: 50 }); // output, cacheWrite missing
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", {
      pi,
      onAssistantUsage: (u) => seen.push(u),
    });

    expect(seen).toEqual([{ input: 50, output: 0, cacheWrite: 0 }]);
  });

  it("runAgent skips the callback when message_end has no usage field", async () => {
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    const cb = vi.fn();
    session.prompt = vi.fn(async () => {
      emitMessageEnd(listeners, undefined);
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", { pi, onAssistantUsage: cb });

    expect(cb).not.toHaveBeenCalled();
  });

  it("resumeAgent forwards usage on message_end the same way", async () => {
    const { session, listeners } = createSession("RESUMED");
    const seen: any[] = [];

    session.prompt = vi.fn(async () => {
      emitMessageEnd(listeners, { input: 10, output: 20, cacheWrite: 5 });
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "RESUMED" }] });
    });

    await resumeAgent(session as any, "continue", {
      onAssistantUsage: (u) => seen.push(u),
    });

    expect(seen).toEqual([{ input: 10, output: 20, cacheWrite: 5 }]);
  });

  it("forwards compaction_end events to onCompaction (only when not aborted)", async () => {
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    const seen: any[] = [];
    session.prompt = vi.fn(async () => {
      // Successful compaction — should fire
      for (const l of listeners) l({
        type: "compaction_end",
        aborted: false,
        reason: "threshold",
        result: { tokensBefore: 12345 },
      });
      // Aborted compaction — should NOT fire
      for (const l of listeners) l({
        type: "compaction_end",
        aborted: true,
        reason: "manual",
        result: { tokensBefore: 99999 },
      });
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", {
      pi,
      onCompaction: (info) => seen.push(info),
    });

    expect(seen).toEqual([{ reason: "threshold", tokensBefore: 12345 }]);
  });
});


describe("getGraceTurns / setGraceTurns", () => {
  let originalTurns: number;
  beforeEach(() => {
    originalTurns = getGraceTurns();
  });
  afterEach(() => {
    setGraceTurns(originalTurns);
  });

  it("should get and set grace turns correctly", () => {
    setGraceTurns(10);
    expect(getGraceTurns()).toBe(10);

    setGraceTurns(2);
    expect(getGraceTurns()).toBe(2);
  });

  it("should enforce minimum of 1", () => {
    setGraceTurns(0);
    expect(getGraceTurns()).toBe(1);

    setGraceTurns(-5);
    expect(getGraceTurns()).toBe(1);
  });
});

describe("AgentRunnerError", () => {
  it("initializes correctly with message and code", () => {
    const error = new AgentRunnerError("test message", "timeout");
    expect(error.message).toBe("test message");
    expect(error.code).toBe("timeout");
    expect(error.name).toBe("AgentRunnerError");
    expect(error.context).toBeUndefined();
    expect(error).toBeInstanceOf(Error);
  });

  it("stores optional context", () => {
    const error = new AgentRunnerError("depth exceeded", "depth_exceeded", { level: 6 });
    expect(error.context).toEqual({ level: 6 });
  });
});

describe("ModelCircuitBreaker", () => {
  it("resets consecutive failures to 0 on a successful call in closed state", async () => {
    // Reset/ensure closed state and 0 failures
    const state = globalCircuitBreaker.getState();
    if (state.state !== "closed" || state.failures !== 0) {
      await globalCircuitBreaker.call(() => Promise.resolve("setup"));
    }

    // Trigger one failure
    await expect(globalCircuitBreaker.call(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(globalCircuitBreaker.getState().failures).toBe(1);

    // Trigger a success call
    const val = await globalCircuitBreaker.call(() => Promise.resolve("ok"));
    expect(val).toBe("ok");

    // Failures should be reset to 0
    expect(globalCircuitBreaker.getState().failures).toBe(0);
  });
});

describe("subagent:end revision gate", () => {
  afterEach(() => {
    setMaxEndHookRevisions(0);
  });

  it("awaits end hook and continues when allow", async () => {
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });
    const hooks = new HookRegistry();
    const end = vi.fn(async () => "allow" as const);
    hooks.register("subagent:end", end);

    const result = await runAgent(ctx, "Explore", "go", { pi, hooks, agentId: "agent-end-1" });

    expect(end).toHaveBeenCalledTimes(1);
    expect(end.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        status: "completed",
        responseText: "OK",
        attempt: 1,
        maxAttempts: 1,
      }),
    );
    expect(session.prompt).toHaveBeenCalledTimes(1);
    expect(result.responseText).toBe("OK");
  });

  it("fails closed on block when maxEndHookRevisions is 0", async () => {
    const { session } = createSession("DRAFT");
    createAgentSession.mockResolvedValue({ session });
    const hooks = new HookRegistry();
    hooks.register("subagent:end", async () => ({ action: "block", reason: "quality fail", feedback: "add tests" }));

    await expect(runAgent(ctx, "Explore", "go", { pi, hooks, agentId: "agent-end-2" })).rejects.toMatchObject({
      name: "AgentRunnerError",
      code: "aborted",
      message: "quality fail",
      context: expect.objectContaining({ hook: "subagent:end", feedback: "add tests" }),
    });
    expect(session.prompt).toHaveBeenCalledTimes(1);
  });

  it("treats NaN maxEndHookRevisions as fail-closed budget 0", async () => {
    const { session } = createSession("DRAFT");
    createAgentSession.mockResolvedValue({ session });
    const hooks = new HookRegistry();
    hooks.register("subagent:end", async () => "block");

    await expect(
      runAgent(ctx, "Explore", "go", {
        pi,
        hooks,
        agentId: "agent-end-nan",
        maxEndHookRevisions: Number.NaN,
      }),
    ).rejects.toMatchObject({
      name: "AgentRunnerError",
      code: "aborted",
      context: expect.objectContaining({ hook: "subagent:end", attempt: 1, maxAttempts: 1 }),
    });
    expect(session.prompt).toHaveBeenCalledTimes(1);
  });

  it("re-prompts once with feedback then allows", async () => {
    const { session } = createSession("DRAFT");
    createAgentSession.mockResolvedValue({ session });
    let call = 0;
    session.prompt = vi.fn(async (prompt: string) => {
      call++;
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: call === 1 ? "DRAFT" : "REVISED" }],
      });
      if (call === 2) expect(prompt).toContain("add tests");
    });

    const hooks = new HookRegistry();
    let endCalls = 0;
    hooks.register("subagent:end", async () => {
      endCalls++;
      if (endCalls === 1) return { action: "block" as const, feedback: "add tests" };
      return "allow";
    });

    const result = await runAgent(ctx, "Explore", "go", {
      pi,
      hooks,
      agentId: "agent-end-3",
      maxEndHookRevisions: 1,
    });

    expect(session.prompt).toHaveBeenCalledTimes(2);
    expect(endCalls).toBe(2);
    expect(result.responseText).toBe("REVISED");
  });

  it("stops after revision budget is exhausted", async () => {
    const { session } = createSession("DRAFT");
    createAgentSession.mockResolvedValue({ session });
    session.prompt = vi.fn(async () => {
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: "still bad" }],
      });
    });

    const hooks = new HookRegistry();
    hooks.register("subagent:end", async () => "block");

    await expect(
      runAgent(ctx, "Explore", "go", { pi, hooks, agentId: "agent-end-4", maxEndHookRevisions: 1 }),
    ).rejects.toMatchObject({
      name: "AgentRunnerError",
      code: "aborted",
      context: expect.objectContaining({ hook: "subagent:end", attempt: 2, maxAttempts: 2 }),
    });
    expect(session.prompt).toHaveBeenCalledTimes(2);
  });

  it("get/setMaxEndHookRevisions clamps to 0..10", () => {
    setMaxEndHookRevisions(99);
    expect(getMaxEndHookRevisions()).toBe(10);
    setMaxEndHookRevisions(-3);
    expect(getMaxEndHookRevisions()).toBe(0);
    setMaxEndHookRevisions(2);
    expect(getMaxEndHookRevisions()).toBe(2);
    setMaxEndHookRevisions(0);
  });
});
