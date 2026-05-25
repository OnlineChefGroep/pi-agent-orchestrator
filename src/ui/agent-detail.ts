import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { reloadCustomAgents } from "../agent-registry.js";
import { getAgentConfig } from "../agent-types.js";
import { disableAgent, ejectAgent, enableAgent } from "./agent-actions.js";
import { findAgentFile } from "./agent-file-helpers.js";

export async function showAgentPermissions(ctx: ExtensionCommandContext, record: import("../types.js").AgentRecord): Promise<void> {
  const cfg = getAgentConfig(record.type);
  const tools = cfg?.builtinToolNames?.join(", ") || "(default)";

  const isolation = record.worktree ? `worktree (${record.worktree.branch})` : "shared";
  const validation = record.validated === false ? "FAILED" : record.validated === true ? "passed" : "n/a";

  const content = [
    `Agent: ${record.description || record.type} (${record.id})`,
    `Status: ${record.status}`,
    `Isolation: ${isolation}`,
    `Tools: ${tools}`,
    `Validation: ${validation}`,
    record.outputFile ? `Output file: ${record.outputFile}` : "",
    "",
    "Press any key to close.",
  ].filter(Boolean).join("\n");

  await ctx.ui.custom((_tui, _theme, _kb, done) => {
    // Simple text renderer
    return {
      render() { return content.split("\n"); },
      invalidate() {},
      handleInput() { done(undefined); },
    };
  }, { overlay: true, overlayOptions: { width: "70%" } });
}

export async function showAgentDetail(ctx: ExtensionCommandContext, name: string): Promise<void> {
  const cfg = getAgentConfig(name);
  if (!cfg) {
    ctx.ui.notify(`Agent config not found for "${name}".`, "warning");
    return;
  }

  const file = findAgentFile(name);
  const isDefault = cfg.isDefault === true;
  const disabled = cfg.enabled === false;

  let menuOptions: string[];
  if (disabled && file) {
    // Disabled agent with a file — offer Enable
    menuOptions = isDefault
      ? ["Enable", "Edit", "Reset to default", "Delete", "Back"]
      : ["Enable", "Edit", "Delete", "Back"];
  } else if (isDefault && !file) {
    // Default agent with no .md override
    menuOptions = ["Eject (export as .md)", "Disable", "Back"];
  } else if (isDefault && file) {
    // Default agent with .md override (ejected)
    menuOptions = ["Edit", "Disable", "Reset to default", "Delete", "Back"];
  } else {
    // User-defined agent
    menuOptions = ["Edit", "Disable", "Delete", "Back"];
  }

  const choice = await ctx.ui.select(name, menuOptions);
  if (!choice || choice === "Back") return;

  if (choice === "Edit" && file) {
    const content = readFileSync(file.path, "utf-8");
    const edited = await ctx.ui.editor(`Edit ${name}`, content);
    if (edited !== undefined && edited !== content) {
      writeFileSync(file.path, edited, "utf-8");
      reloadCustomAgents();
      ctx.ui.notify(`Updated ${file.path}`, "info");
    }
  } else if (choice === "Delete") {
    if (file) {
      const confirmed = await ctx.ui.confirm("Delete agent", `Delete ${name} from ${file.location} (${file.path})?`);
      if (confirmed) {
        unlinkSync(file.path);
        reloadCustomAgents();
        ctx.ui.notify(`Deleted ${file.path}`, "info");
      }
    }
  } else if (choice === "Reset to default" && file) {
    const confirmed = await ctx.ui.confirm("Reset to default", `Delete override ${file.path} and restore embedded default?`);
    if (confirmed) {
      unlinkSync(file.path);
      reloadCustomAgents();
      ctx.ui.notify(`Restored default ${name}`, "info");
    }
  } else if (choice.startsWith("Eject")) {
    await ejectAgent(ctx, name, cfg);
  } else if (choice === "Disable") {
    await disableAgent(ctx, name);
  } else if (choice === "Enable") {
    await enableAgent(ctx, name);
  }
}
