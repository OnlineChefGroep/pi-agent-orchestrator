import { describe, expect, it, vi } from "vitest";

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { registerHooksCommand } = await import("../src/commands/hooks.js");

describe("registerHooksCommand", () => {
  it("registers a /hooks command", () => {
    const pi = {
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
    };

    const registry = {
      getHandlers: vi.fn(() => new Map()),
    };

    registerHooksCommand(pi as any, registry as any);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "hooks",
      expect.objectContaining({
        description: "Manage hooks",
        handler: expect.any(Function),
      }),
    );
  });

  it("sends 'No hooks registered' when empty", async () => {
    const pi = {
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
    };

    const registry = {
      getHandlers: vi.fn(() => new Map()),
    };

    registerHooksCommand(pi as any, registry as any);
    const handler = pi.registerCommand.mock.calls[0][1].handler;
    await handler([], {});

    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "No hooks registered.",
      }),
    );
  });

  it("lists registered hooks sorted alphabetically", async () => {
    const pi = {
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
    };

    const handlerMap = new Map();
    handlerMap.set("subagent:end", [{ id: "h2" }, { id: "h3" }]);
    handlerMap.set("subagent:start", [{ id: "h1" }]);

    const registry = {
      getHandlers: vi.fn(() => handlerMap),
    };

    registerHooksCommand(pi as any, registry as any);
    const handler = pi.registerCommand.mock.calls[0][1].handler;
    await handler([], {});

    const calls = pi.sendMessage.mock.calls;
    const content = calls[0][0].content;
    expect(content).toContain("subagent:end");
    expect(content).toContain("2 handlers");
    expect(content).toContain("subagent:start");
    expect(content).toContain("1 handler");
    expect(content).toContain("Total: 3 handler");
  });

  it("shows '1 handler' singular for single handler", async () => {
    const pi = {
      registerCommand: vi.fn(),
      sendMessage: vi.fn(),
    };

    const handlerMap = new Map();
    handlerMap.set("tool:call", [{ id: "h1" }]);

    const registry = {
      getHandlers: vi.fn(() => handlerMap),
    };

    registerHooksCommand(pi as any, registry as any);
    const handler = pi.registerCommand.mock.calls[0][1].handler;
    await handler([], {});

    const content = pi.sendMessage.mock.calls[0][0].content;
    expect(content).toContain("1 handler");
    expect(content).not.toContain("1 handlers");
  });
});
