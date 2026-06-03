import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reloadCustomAgents } from "../src/agent-registry.js";
import { getAgentConfig } from "../src/agent-types.js";
import { showAgentDetail } from "../src/ui/agent-detail.js";
import { findAgentFile } from "../src/ui/agent-file-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => "original content"),
  writeFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
}));

vi.mock("../src/agent-registry.js", () => ({
  reloadCustomAgents: vi.fn(),
}));

vi.mock("../src/agent-types.js", () => ({
  getAgentConfig: vi.fn(),
}));

vi.mock("../src/ui/agent-file-helpers.js", () => ({
  findAgentFile: vi.fn(),
}));

vi.mock("../src/ui/agent-actions.js", () => ({
  disableAgent: vi.fn(async () => undefined),
  ejectAgent: vi.fn(async () => undefined),
  enableAgent: vi.fn(async () => undefined),
}));

const fsPromises = await import("node:fs/promises");

function mockContext(choice: string, editorValue?: string, confirmValue = true): ExtensionCommandContext {
  return {
    ui: {
      select: vi.fn(async () => choice),
      editor: vi.fn(async () => editorValue),
      confirm: vi.fn(async () => confirmValue),
      notify: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
}

describe("showAgentDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAgentConfig).mockReturnValue({
      name: "custom-agent",
      description: "Custom agent",
      builtinToolNames: ["read"],
      enabled: true,
    });
    vi.mocked(findAgentFile).mockReturnValue({ path: "/agents/custom-agent.md", location: "project" });
  });

  it("edits custom agent files with async file I/O", async () => {
    const ctx = mockContext("Edit", "updated content");

    await showAgentDetail(ctx, "custom-agent");

    expect(fsPromises.readFile).toHaveBeenCalledWith("/agents/custom-agent.md", "utf-8");
    expect(ctx.ui.editor).toHaveBeenCalledWith("Edit custom-agent", "original content");
    expect(fsPromises.writeFile).toHaveBeenCalledWith("/agents/custom-agent.md", "updated content", "utf-8");
    expect(reloadCustomAgents).toHaveBeenCalledTimes(1);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Updated /agents/custom-agent.md", "info");
  });

  it("deletes custom agent files with async file I/O", async () => {
    const ctx = mockContext("Delete");

    await showAgentDetail(ctx, "custom-agent");

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Delete agent",
      "Delete custom-agent from project (/agents/custom-agent.md)?",
    );
    expect(fsPromises.unlink).toHaveBeenCalledWith("/agents/custom-agent.md");
    expect(reloadCustomAgents).toHaveBeenCalledTimes(1);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Deleted /agents/custom-agent.md", "info");
  });

  it("resets default agent overrides with async file I/O", async () => {
    vi.mocked(getAgentConfig).mockReturnValue({
      name: "custom-agent",
      description: "Custom agent",
      builtinToolNames: ["read"],
      enabled: true,
      isDefault: true,
    });
    const ctx = mockContext("Reset to default");

    await showAgentDetail(ctx, "custom-agent");

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Reset to default",
      "Delete override /agents/custom-agent.md and restore embedded default?",
    );
    expect(fsPromises.unlink).toHaveBeenCalledWith("/agents/custom-agent.md");
    expect(reloadCustomAgents).toHaveBeenCalledTimes(1);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Restored default custom-agent", "info");
  });
});
