import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock pi framework
vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: vi.fn(() => ""),
}));

// Mock node:fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => "---\ndescription: test\n---\n\nhello\n"),
  unlink: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
}));

// Mock logger
vi.mock("../../src/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock agent-registry
vi.mock("../../src/agent-registry.js", () => ({
  reloadCustomAgents: vi.fn(async () => {}),
}));

// Mock agent-file-helpers
vi.mock("../src/ui/agent-file-helpers.js", () => ({
  findAgentFile: vi.fn(),
  personalAgentsDir: vi.fn(() => "/home/user/.pi/agents"),
  projectAgentsDir: vi.fn(() => "/project/.pi/agents"),
}));

const { findAgentFile } = await import("../src/ui/agent-file-helpers.js");
const { ejectAgent, disableAgent, enableAgent } = await import("../src/ui/agent-actions.js");
const { writeFile, readFile, unlink } = await import("node:fs/promises");

function makeCtx(selectVal?: string) {
  return {
    ui: {
      select: vi.fn(async () => selectVal),
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ejectAgent", () => {
  it("writes frontmatter with description, tools, and prompt_mode", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test agent",
      systemPrompt: "Be helpful",
      builtinToolNames: ["read", "bash"],
      promptMode: "replace",
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("description: Test agent");
    expect(content).toContain("tools: read, bash");
    expect(content).toContain("prompt_mode: replace");
    expect(content).toContain("Be helpful");
  });

  it("writes frontmatter with display_name when set", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      displayName: "My Agent",
      systemPrompt: "Hi",
      promptMode: "replace",
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("display_name: My Agent");
  });

  it("writes frontmatter with model when set", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      model: "anthropic/claude-sonnet-4-6",
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("model: anthropic/claude-sonnet-4-6");
  });

  it("writes frontmatter with extensions: false", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      extensions: false,
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("extensions: false");
  });

  it("writes frontmatter with extensions: array", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      extensions: ["ext1", "ext2"],
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("extensions: ext1, ext2");
  });

  it("writes frontmatter with inherit_context: true", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      inheritContext: true,
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("inherit_context: true");
  });

  it("writes frontmatter with memory field", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      memory: "project",
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("memory: project");
  });

  it("writes frontmatter with isolation field", async () => {
    const ctx = makeCtx("Project (.pi/agents/)");
    await ejectAgent(ctx as any, "test-agent", {
      description: "Test",
      systemPrompt: "Hi",
      promptMode: "replace",
      isolation: "worktree",
    });

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("isolation: worktree");
  });
});

describe("disableAgent", () => {
  it("notifies if already disabled in file", async () => {
    (readFile as any).mockResolvedValueOnce("---\nenabled: false\ndescription: test\n---\n\nhello\n");
    (findAgentFile as any).mockReturnValueOnce({ path: "/project/.pi/agents/test-agent.md" });

    const ctx = makeCtx();
    await disableAgent(ctx as any, "test-agent");

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already disabled"),
      "info",
    );
  });

  it("adds enabled: false to existing file", async () => {
    (readFile as any).mockResolvedValueOnce("---\ndescription: test\n---\n\nhello\n");
    (findAgentFile as any).mockReturnValueOnce({ path: "/project/.pi/agents/test-agent.md" });

    const ctx = makeCtx();
    await disableAgent(ctx as any, "test-agent");

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toContain("enabled: false");
  });

  it("creates stub when no existing file", async () => {
    (findAgentFile as any).mockReturnValueOnce(undefined);

    const ctx = makeCtx("Project (.pi/agents/)");
    await disableAgent(ctx as any, "test-agent");

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).toBe("---\nenabled: false\n---\n");
  });
});

describe("enableAgent", () => {
  it("removes enabled: false from frontmatter", async () => {
    (readFile as any).mockResolvedValueOnce("---\nenabled: false\ndescription: test\n---\n\nhello\n");
    (findAgentFile as any).mockReturnValueOnce({ path: "/project/.pi/agents/test-agent.md" });

    const ctx = makeCtx();
    await enableAgent(ctx as any, "test-agent");

    const content = (writeFile as any).mock.calls[0][1];
    expect(content).not.toContain("enabled: false");
  });

  it("deletes stub file when content is only frontmatter shell", async () => {
    (readFile as any).mockResolvedValueOnce("---\nenabled: false\n---\n");
    (findAgentFile as any).mockReturnValueOnce({ path: "/project/.pi/agents/test-agent.md" });

    const ctx = makeCtx();
    await enableAgent(ctx as any, "test-agent");

    expect(unlink).toHaveBeenCalled();
  });

  it("does nothing when agent file not found", async () => {
    (findAgentFile as any).mockReturnValueOnce(undefined);

    const ctx = makeCtx();
    await enableAgent(ctx as any, "test-agent");

    expect(writeFile).not.toHaveBeenCalled();
  });
});
