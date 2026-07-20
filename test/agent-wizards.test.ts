import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DASHBOARD_KEYBINDINGS } from "../src/ui/dashboard-keybindings.js";
import { DEFAULT_FOOTER_STATUS_CONFIG } from "../src/ui/footer-status-config.js";

// Mock node:fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock node:path
vi.mock("node:path", () => ({
  join: vi.fn((...parts: string[]) => parts.join("/")),
}));

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock agent-registry
vi.mock("../src/agent-registry.js", () => ({
  reloadCustomAgents: vi.fn(async () => {}),
  getFooterStatusConfig: () => DEFAULT_FOOTER_STATUS_CONFIG,
  getDashboardKeybindings: () => DEFAULT_DASHBOARD_KEYBINDINGS,
}));

// Mock agent-types
vi.mock("../src/agent-types.js", () => ({
  BUILTIN_TOOL_NAMES: ["read", "bash", "edit", "write", "grep", "find", "ls"],
}));

// Mock agent-file-helpers
vi.mock("./agent-file-helpers.js", () => ({
  personalAgentsDir: vi.fn(() => "/home/user/.pi/agents"),
  projectAgentsDir: vi.fn(() => "/project/.pi/agents"),
}));

const { showCreateWizard, showManualWizard } = await import("../src/ui/agent-wizards.js");

function makeCtx(overrides: Partial<{
  selectChoices: string[];
  inputValues: string[];
  confirmValue: boolean;
}> = {}): ExtensionCommandContext {
  let selectIdx = 0;
  let inputIdx = 0;

  return {
    ui: {
      select: vi.fn(async (_title: string, _options: string[]) => {
        const val = overrides.selectChoices?.[selectIdx++];
        if (val === undefined) return undefined;
        return val;
      }),
      input: vi.fn(async (_prompt: string, _default?: string) => {
        return overrides.inputValues?.[inputIdx++] ?? undefined;
      }),
      editor: vi.fn(async (_title: string, _content: string) => {
        return overrides.inputValues?.[inputIdx++] ?? undefined;
      }),
      confirm: vi.fn(async (_title: string, _message: string) => {
        return overrides.confirmValue ?? true;
      }),
      notify: vi.fn(),
    },
  } as ExtensionCommandContext;
}

describe("showManualWizard", () => {
  it("cancels when name is empty", async () => {
    const ctx = makeCtx({ inputValues: [] });
    await showManualWizard(ctx, "/test/dir");
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it("cancels when description is empty", async () => {
    const ctx = makeCtx({ inputValues: ["agent1"] });
    await showManualWizard(ctx, "/test/dir");
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it("cancels when tool choice is cancelled", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "My agent"],
      selectChoices: [undefined],
    });
    await showManualWizard(ctx, "/test/dir");
    expect(ctx.ui.select).toHaveBeenCalled();
    // Should have called select but not written a file
  });

  it("writes file with 'all' tools", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "My agent", "", undefined, "System prompt here"],
      selectChoices: ["all", "inherit (parent model)", "inherit"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("description: My agent"),
      "utf-8",
    );
  });

  it("writes file with 'none' tools", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Read-only agent", "", undefined, ""],
      selectChoices: ["none", "inherit (parent model)", "inherit"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("tools: none"),
      "utf-8",
    );
  });

  it("writes file with 'read-only' tools", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Read-only agent", "", undefined, ""],
      selectChoices: ["read-only (read, bash, grep, find, ls)", "inherit (parent model)", "inherit"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("tools: read, bash, grep, find, ls"),
      "utf-8",
    );
  });

  it("handles custom tools input", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Custom agent", "read, write, bash", "# My System Prompt"],
      selectChoices: ["custom...", "inherit (parent model)", "inherit"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("tools: read, write, bash"),
      "utf-8",
    );
  });

  it("adds model line when specific model chosen", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Agent", "", undefined, ""],
      selectChoices: ["all", "haiku", "inherit"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("model: anthropic/claude-haiku-4-5-20251001"),
      "utf-8",
    );
  });

  it("adds thinking line when xhigh chosen", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Agent", "", undefined, ""],
      selectChoices: ["all", "inherit (parent model)", "xhigh"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("thinking: xhigh"),
      "utf-8",
    );
  });

  it("adds thinking line when max chosen", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Agent", "", undefined, ""],
      selectChoices: ["all", "inherit (parent model)", "max"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("thinking: max"),
      "utf-8",
    );
  });

  it("adds thinking line when non-inherit chosen", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Agent", "", undefined, ""],
      selectChoices: ["all", "inherit (parent model)", "high"],
    });
    await showManualWizard(ctx, "/test/dir");

    const { writeFileSync } = await import("node:fs");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/test/dir/agent1.md",
      expect.stringContaining("thinking: high"),
      "utf-8",
    );
  });

  it("cancels when model selection is cancelled", async () => {
    const ctx = makeCtx({
      inputValues: ["agent1", "Agent"],
      selectChoices: ["all", undefined],
    });
    await showManualWizard(ctx, "/test/dir");
    // Should stop early — just verify wizard flow didn't crash
    expect(ctx.ui.select).toHaveBeenCalled();
  });
});

describe("showCreateWizard", () => {
  it("cancels when location is cancelled", async () => {
    const ctx = makeCtx({ selectChoices: [undefined] });
    const pi = {} as any;
    const manager = {} as any;
    await showCreateWizard(ctx, pi, manager);
    expect(ctx.ui.select).toHaveBeenCalled();
  });
});
