import { readFile, unlink, writeFile } from "node:fs/promises";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { reloadCustomAgents } from "../agent-registry.js";
import { getAgentConfig } from "../agent-types.js";
import { disableAgent, ejectAgent, enableAgent } from "./agent-actions.js";
import { findAgentFile } from "./agent-file-helpers.js";
import { borderLine, framedRow, getBoxChars, getThemeColors } from "./theme.js";
import { matchesKey } from "./tui-shim.js";

export async function showAgentPermissions(
  ctx: ExtensionCommandContext,
  record: import("../types.js").AgentRecord,
): Promise<void> {
  const cfg = getAgentConfig(record.type);
  const tools = cfg?.builtinToolNames?.join(", ") || "(default)";

  const isolation = record.worktree ? `worktree (${record.worktree.branch})` : "shared";
  const validation = record.validated === false ? "FAILED" : record.validated === true ? "passed" : "n/a";

  await ctx.ui.custom(
    (tui, _theme, _kb, done) => {
      return {
        render() {
          const th = getThemeColors();
          const box = getBoxChars();

          // Use a default width if terminal is not accessible or too small
          const terminalWidth = tui?.terminal?.columns;
          const safeWidth = terminalWidth ? Math.min(terminalWidth, Math.max(20, Math.floor(terminalWidth * 0.7))) : 60;
          const innerW = Math.max(1, safeWidth - 4);

          const lines: string[] = [];
          lines.push(borderLine(safeWidth, th, box, "top"));
          lines.push(framedRow(`${th.title}PERMISSIONS & SCOPE${th.reset}`, innerW, th, box));
          lines.push(borderLine(safeWidth, th, box, "mid"));

          lines.push(
            framedRow(
              `${th.dim}Agent:${th.reset} ${record.description || record.type} (${record.id})`,
              innerW,
              th,
              box,
            ),
          );
          lines.push(framedRow(`${th.dim}Status:${th.reset} ${record.status}`, innerW, th, box));
          lines.push(framedRow(`${th.dim}Isolation:${th.reset} ${isolation}`, innerW, th, box));
          lines.push(framedRow(`${th.dim}Tools:${th.reset} ${tools}`, innerW, th, box));
          lines.push(
            framedRow(
              `${th.dim}Validation:${th.reset} ${record.validated === true ? th.success : record.validated === false ? th.error : th.dim}${validation}${th.reset}`,
              innerW,
              th,
              box,
            ),
          );

          if (record.outputFile) {
            lines.push(framedRow(`${th.dim}Output file:${th.reset} ${record.outputFile}`, innerW, th, box));
          }

          lines.push(framedRow("", innerW, th, box));
          lines.push(framedRow(`${th.dim}Press [Esc] or [q] or [Enter] to close.${th.reset}`, innerW, th, box));
          lines.push(borderLine(safeWidth, th, box, "bottom"));

          return lines;
        },
        invalidate() {},
        handleInput(data: string) {
          if (
            matchesKey(data, "escape") ||
            matchesKey(data, "q") ||
            matchesKey(data, "enter") ||
            matchesKey(data, "return")
          ) {
            done(undefined);
          }
        },
      };
    },
    { overlay: true, overlayOptions: { width: "70%" } },
  );
}

/** Determine the menu options offered for an agent based on its state. */
function agentDetailMenuOptions(
  disabled: boolean,
  isDefault: boolean,
  file: { path: string; location: string } | undefined,
): string[] {
  if (disabled && file) {
    // Disabled agent with a file — offer Enable
    return isDefault ? ["Enable", "Edit", "Reset to default", "Delete", "Back"] : ["Enable", "Edit", "Delete", "Back"];
  }
  if (isDefault && !file) {
    // Default agent with no .md override
    return ["Eject (export as .md)", "Disable", "Back"];
  }
  if (isDefault && file) {
    // Default agent with .md override (ejected)
    return ["Edit", "Disable", "Reset to default", "Delete", "Back"];
  }
  // User-defined agent
  return ["Edit", "Disable", "Delete", "Back"];
}

/** Handle the user's choice from the agent-detail menu. */
async function handleAgentDetailChoice(
  ctx: ExtensionCommandContext,
  choice: string,
  name: string,
  cfg: NonNullable<ReturnType<typeof getAgentConfig>>,
  file: ReturnType<typeof findAgentFile>,
): Promise<void> {
  if (choice === "Edit" && file) {
    const content = await readFile(file.path, "utf-8");
    const edited = await ctx.ui.editor(`Edit ${name}`, content);
    if (edited !== undefined && edited !== content) {
      await writeFile(file.path, edited, "utf-8");
      await reloadCustomAgents();
      ctx.ui.notify(`Updated ${file.path}`, "info");
    }
    return;
  }
  if (choice === "Delete") {
    if (file) {
      const confirmed = await ctx.ui.confirm("Delete agent", `Delete ${name} from ${file.location} (${file.path})?`);
      if (confirmed) {
        await unlink(file.path);
        await reloadCustomAgents();
        ctx.ui.notify(`Deleted ${file.path}`, "info");
      }
    }
    return;
  }
  if (choice === "Reset to default" && file) {
    const confirmed = await ctx.ui.confirm(
      "Reset to default",
      `Delete override ${file.path} and restore embedded default?`,
    );
    if (confirmed) {
      await unlink(file.path);
      await reloadCustomAgents();
      ctx.ui.notify(`Restored default ${name}`, "info");
    }
    return;
  }
  if (choice.startsWith("Eject")) {
    await ejectAgent(ctx, name, cfg);
    return;
  }
  if (choice === "Disable") {
    await disableAgent(ctx, name);
    return;
  }
  if (choice === "Enable") {
    await enableAgent(ctx, name);
  }
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

  const menuOptions = agentDetailMenuOptions(disabled, isDefault, file);

  const choice = await ctx.ui.select(name, menuOptions);
  if (!choice || choice === "Back") return;

  await handleAgentDetailChoice(ctx, choice, name, cfg, file);
}
