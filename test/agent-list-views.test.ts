import { describe, expect, it, vi } from "vitest";

// Mock pi framework
vi.mock("@earendil-works/pi-coding-agent", () => ({}));

// Mock agent-types
vi.mock("../src/agent-types.js", () => ({
  getAgentConfig: vi.fn(),
  getAllTypes: vi.fn(() => []),
}));

// Mock agent-file-helpers
vi.mock("../src/ui/agent-file-helpers.js", () => ({
  getModelLabel: vi.fn(() => "claude-sonnet"),
}));

// Mock agent-format
vi.mock("../src/ui/agent-format.js", () => ({
  formatDuration: vi.fn(() => "5.0s"),
  getDisplayName: vi.fn((t: string) => t),
}));

// Mock agent-viewer
vi.mock("../src/ui/agent-viewer.js", () => ({
  viewAgentConversation: vi.fn(),
}));

// Mock agent-detail (dynamic import)
vi.mock("../src/ui/agent-detail.js", () => ({
  showAgentDetail: vi.fn(),
}));

const { getAllTypes, getAgentConfig } = await import("../src/agent-types.js");
const { showAllAgentsList, showRunningAgents } = await import("../src/ui/agent-list-views.js");

function makeCtx() {
  return {
    ui: {
      select: vi.fn(async () => undefined),
      notify: vi.fn(),
    },
    modelRegistry: undefined,
  };
}

describe("showAllAgentsList", () => {
  it("notifies when no agents exist", async () => {
    (getAllTypes as any).mockReturnValue([]);
    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No agents.", "info");
  });

  it("builds options from agent types", async () => {
    (getAllTypes as any).mockReturnValue(["explore", "plan", "analysis"]);
    (getAgentConfig as any).mockImplementation((name: string) => ({
      description: `${name} description`,
      source: "default",
      isDefault: true,
      enabled: true,
    }));

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    expect(ctx.ui.select).toHaveBeenCalledWith(
      "Agent types",
      expect.arrayContaining([
        expect.stringContaining("explore"),
        expect.stringContaining("plan"),
        expect.stringContaining("analysis"),
      ]),
    );
  });

  it("adds legend when custom agents present", async () => {
    (getAllTypes as any).mockReturnValue(["explore"]);
    (getAgentConfig as any).mockReturnValue({
      description: "desc",
      source: "project",
      isDefault: false,
      enabled: true,
    });

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    const options = ctx.ui.select.mock.calls[0][1];
    expect(options).toContain("\n• = project  ◦ = global");
  });

  it("adds legend when disabled agents present", async () => {
    (getAllTypes as any).mockReturnValue(["explore"]);
    (getAgentConfig as any).mockReturnValue({
      description: "desc",
      source: "default",
      isDefault: true,
      enabled: false,
    });

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    const options = ctx.ui.select.mock.calls[0][1];
    expect(options).toContain("\n✕ = disabled");
  });

  it("shows disabled prefix for disabled agents", async () => {
    (getAllTypes as any).mockReturnValue(["explore"]);
    (getAgentConfig as any).mockReturnValue({
      description: "desc",
      source: "default",
      isDefault: true,
      enabled: false,
    });

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    const options = ctx.ui.select.mock.calls[0][1];
    expect(options[0]).toContain("(disabled)");
  });

  it("shows custom indicator for project agents", async () => {
    (getAllTypes as any).mockReturnValue(["explore"]);
    (getAgentConfig as any).mockReturnValue({
      description: "desc",
      source: "project",
      isDefault: false,
      enabled: true,
    });

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    const options = ctx.ui.select.mock.calls[0][1];
    expect(options[0]).toContain("•");
  });

  it("shows custom indicator for global agents", async () => {
    (getAllTypes as any).mockReturnValue(["explore"]);
    (getAgentConfig as any).mockReturnValue({
      description: "desc",
      source: "global",
      isDefault: false,
      enabled: true,
    });

    const ctx = makeCtx();
    await showAllAgentsList(ctx as any);

    const options = ctx.ui.select.mock.calls[0][1];
    expect(options[0]).toContain("◦");
  });
});

describe("showRunningAgents", () => {
  it("notifies when no agents running", async () => {
    const ctx = makeCtx();
    const manager = { listAgents: vi.fn(() => []) };

    await showRunningAgents(ctx as any, manager as any, new Map());
    expect(ctx.ui.notify).toHaveBeenCalledWith("No agents.", "info");
  });

  it("builds options from running agents", async () => {
    const ctx = {
      ui: {
        select: vi.fn(async () => undefined),
        notify: vi.fn(),
      },
    };

    const agents = [
      {
        id: "a1",
        type: "Explore",
        description: "Searching",
        status: "running",
        toolUses: 3,
        startedAt: Date.now() - 5000,
        completedAt: undefined,
      },
      {
        id: "a2",
        type: "Plan",
        description: "Thinking",
        status: "running",
        toolUses: 0,
        startedAt: Date.now() - 2000,
        completedAt: undefined,
      },
    ];

    const manager = { listAgents: vi.fn(() => agents) };
    await showRunningAgents(ctx as any, manager as any, new Map());

    expect(ctx.ui.select).toHaveBeenCalledWith(
      "Running agents",
      expect.arrayContaining([
        expect.stringContaining("Explore"),
        expect.stringContaining("Plan"),
      ]),
    );
  });

  it("handles cancelled selection", async () => {
    const ctx = makeCtx();
    const agents = [
      { id: "a1", type: "Explore", description: "Testing", status: "completed", toolUses: 1, startedAt: 0, completedAt: undefined },
    ];
    const manager = { listAgents: vi.fn(() => agents) };

    await showRunningAgents(ctx as any, manager as any, new Map());
    // If no selection is made, should just return
    expect(ctx.ui.select).toHaveBeenCalled();
  });
});
