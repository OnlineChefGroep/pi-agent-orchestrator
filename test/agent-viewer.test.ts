import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock pi framework
vi.mock("@earendil-works/pi-coding-agent", () => ({}));

// Mock conversation-viewer to avoid heavy import chain
vi.mock("../src/ui/conversation-viewer.js", () => ({
  ConversationViewer: vi.fn(),
  VIEWPORT_HEIGHT_PCT: 80,
}));

const { viewAgentConversation } = await import("../src/ui/agent-viewer.js");

function makeRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    type: "Explore",
    status: "completed",
    description: "Done",
    spawnedAt: Date.now(),
    swarmId: undefined,
    handoff: undefined,
    invocation: undefined,
    compactionCount: 0,
    toolUses: 0,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    ...overrides,
  } as AgentRecord;
}

describe("viewAgentConversation", () => {
  it("notifies when agent has no session and is queued", async () => {
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
    const rec = makeRecord({ status: "queued", session: undefined });
    await viewAgentConversation(ctx as any, rec, new Map());

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("queued"),
      "info",
    );
  });

  it("notifies when agent has no session and is not queued", async () => {
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
    const rec = makeRecord({ status: "completed", session: undefined });
    await viewAgentConversation(ctx as any, rec, new Map());

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("expired"),
      "info",
    );
  });

  it("opens conversation viewer when session exists", async () => {
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
    const mockSession = { messages: [] };
    const rec = makeRecord({ status: "completed", session: mockSession as any });
    await viewAgentConversation(ctx as any, rec, new Map());

    expect(ctx.ui.custom).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        overlay: true,
        overlayOptions: expect.objectContaining({ anchor: "center" }),
      }),
    );
  });

  it("passes activity data to the viewer", async () => {
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
    const mockSession = { messages: [] };
    const rec = makeRecord({ id: "agent-1", status: "running", session: mockSession as any });
    const activity = new Map();
    activity.set("agent-1", { turnCount: 3, tokenCount: 500 });

    await viewAgentConversation(ctx as any, rec, activity);

    expect(ctx.ui.custom).toHaveBeenCalled();
  });

  it("does not throw when agentActivity map is empty", async () => {
    const ctx = { ui: { notify: vi.fn(), custom: vi.fn() } };
    const mockSession = { messages: [] };
    const rec = makeRecord({ status: "completed", session: mockSession as any });

    await expect(
      viewAgentConversation(ctx as any, rec, new Map()),
    ).resolves.toBeUndefined();
  });
});
