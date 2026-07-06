/**
 * commands/templates.ts — Register the /agents templates subcommand.
 *
 * Provides: /agents templates — interactive menu to browse, install,
 * update, and remove agent templates from the built-in registry.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { reloadCustomAgents } from "../agent-registry.js";
import {
  checkAllUpdates,
  installTemplate,
  listInstalledTemplates,
  listTemplates,
  removeTemplate,
} from "../agent-templates.js";

// ── Choice prefix markers (used for reverse-lookup) ──────────────────────

const INSTALLED_PREFIX = "INSTALLED:";
const AVAILABLE_PREFIX = "AVAILABLE:";

function installedChoice(name: string, version: string, updateAvailable?: string): string {
  const badge = updateAvailable ? ` [update: ${updateAvailable}]` : "";
  return `${INSTALLED_PREFIX}${name} (v${version})${badge} — remove`;
}

function availableChoice(name: string, category: string, displayName: string, description: string): string {
  return `${AVAILABLE_PREFIX}${name} [${category}] ${displayName} — ${description}`;
}

export function registerTemplatesCommand(pi: ExtensionAPI) {
  pi.registerCommand("agents templates", {
    description: "Browse and manage agent templates",
    handler: async (_args, ctx) => {
      await showTemplatesMenu(ctx);
    },
  });
}

export async function showTemplatesMenu(ctx: ExtensionCommandContext): Promise<void> {
  while (true) {
    const cwd = process.cwd();
    const [installed, allTemplates, allUpdates] = await Promise.all([
      listInstalledTemplates(cwd),
      listTemplates(),
      checkAllUpdates(cwd),
    ]);

    const installedNames = new Set(installed.map((t) => t.name));
    const updateMap = new Map(allUpdates.map((u) => [u.name, u.available]));

    const options: string[] = [];

    // Show installed templates
    for (const t of installed) {
      options.push(installedChoice(t.name, t.version, updateMap.get(t.name)));
    }

    // Show available (not installed) templates
    for (const t of allTemplates) {
      if (!installedNames.has(t.name)) {
        options.push(availableChoice(t.name, t.category, t.displayName, t.description));
      }
    }

    // Bulk actions
    if (allUpdates.length > 0) {
      options.push(`Update all templates (${allUpdates.length} available)`);
    }
    options.push("Rescan templates");

    if (options.length === 1 && options[0] === "Rescan templates") {
      options.unshift("No templates found. Install some from the list below:");
    }

    const choice = await ctx.ui.select("Agent Templates", options);
    if (!choice) return;

    if (choice.startsWith("Update all templates")) {
      let count = 0;
      for (const u of allUpdates) {
        const result = await installTemplate(u.name, cwd);
        if (result.ok) count++;
      }
      await reloadCustomAgents();
      ctx.ui.notify(`Updated ${count} of ${allUpdates.length} templates.`, "info");
    } else if (choice.startsWith(INSTALLED_PREFIX)) {
      const name = choice.slice(INSTALLED_PREFIX.length).split(" ")[0];
      const action = await ctx.ui.select(`Template: ${name}`, [
        "Update to latest version",
        "Remove template",
        "Cancel",
      ]);
      if (action === "Update to latest version") {
        const result = await installTemplate(name, cwd);
        if (result.ok) {
          await reloadCustomAgents();
          ctx.ui.notify(`Updated ${name} to latest version.`, "info");
        } else {
          ctx.ui.notify(result.error ?? "Update failed.", "warning");
        }
      } else if (action === "Remove template") {
        const result = await removeTemplate(name, cwd);
        if (result.ok) {
          await reloadCustomAgents();
          ctx.ui.notify(`Removed ${name}.`, "info");
        } else {
          ctx.ui.notify(result.error ?? "Remove failed.", "warning");
        }
      }
    } else if (choice.startsWith("Rescan templates")) {
      await reloadCustomAgents();
      ctx.ui.notify("Templates rescanned.", "info");
    } else if (choice.startsWith(AVAILABLE_PREFIX)) {
      // Format: "AVAILABLE:tpl-name [category] DisplayName — description"
      const afterPrefix = choice.slice(AVAILABLE_PREFIX.length);
      const name = afterPrefix.split(" ")[0];

      const template = allTemplates.find((t) => t.name === name);
      if (!template) continue;

      const result = await installTemplate(name, cwd);
      if (result.ok) {
        await reloadCustomAgents();
        ctx.ui.notify(`Installed ${template.displayName} (v${template.version}).`, "info");
      } else {
        ctx.ui.notify(result.error ?? "Install failed.", "warning");
      }
    }
  }
}
