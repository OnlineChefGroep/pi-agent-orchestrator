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

/** Extract the template name from a prefixed choice string. */
function extractChoiceName(choice: string, prefix: string): string {
  return choice.slice(prefix.length).split(" ")[0];
}

/** Handle the "Update all templates" bulk action. */
async function handleUpdateAll(
  ctx: ExtensionCommandContext,
  allUpdates: { name: string }[],
  cwd: string,
): Promise<void> {
  let count = 0;
  for (const u of allUpdates) {
    const result = await installTemplate(u.name, cwd);
    if (result.ok) count++;
  }
  await reloadCustomAgents();
  ctx.ui.notify(`Updated ${count} of ${allUpdates.length} templates.`, "info");
}

/** Handle interactions on an already-installed template (update or remove). */
async function handleInstalledChoice(ctx: ExtensionCommandContext, choice: string, cwd: string): Promise<void> {
  const name = extractChoiceName(choice, INSTALLED_PREFIX);
  const action = await ctx.ui.select(`Template: ${name}`, ["Update to latest version", "Remove template", "Cancel"]);
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
}

/** Handle installing an available (not-yet-installed) template. */
async function handleAvailableChoice(
  ctx: ExtensionCommandContext,
  choice: string,
  allTemplates: { name: string; displayName: string; version: string }[],
  cwd: string,
): Promise<boolean> {
  const name = extractChoiceName(choice, AVAILABLE_PREFIX);
  const template = allTemplates.find((t) => t.name === name);
  if (!template) return false;

  const result = await installTemplate(name, cwd);
  if (result.ok) {
    await reloadCustomAgents();
    ctx.ui.notify(`Installed ${template.displayName} (v${template.version}).`, "info");
  } else {
    ctx.ui.notify(result.error ?? "Install failed.", "warning");
  }
  return true;
}

/** Build the menu options from installed, available, and update data. */
function buildTemplateOptions(
  installed: { name: string; version: string }[],
  allTemplates: { name: string; category: string; displayName: string; description: string }[],
  allUpdates: { name: string; available?: string }[],
): string[] {
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

  return options;
}

/** Dispatch a single menu choice. Returns false when the loop should `continue`. */
async function dispatchTemplateChoice(
  ctx: ExtensionCommandContext,
  choice: string,
  allTemplates: { name: string; displayName: string; version: string }[],
  allUpdates: { name: string }[],
  cwd: string,
): Promise<boolean> {
  if (choice.startsWith("Update all templates")) {
    await handleUpdateAll(ctx, allUpdates, cwd);
  } else if (choice.startsWith(INSTALLED_PREFIX)) {
    await handleInstalledChoice(ctx, choice, cwd);
  } else if (choice.startsWith("Rescan templates")) {
    await reloadCustomAgents();
    ctx.ui.notify("Templates rescanned.", "info");
  } else if (choice.startsWith(AVAILABLE_PREFIX)) {
    return await handleAvailableChoice(ctx, choice, allTemplates, cwd);
  }
  return true;
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

    const options = buildTemplateOptions(installed, allTemplates, allUpdates);

    const choice = await ctx.ui.select("Agent Templates", options);
    if (!choice) return;

    const handled = await dispatchTemplateChoice(ctx, choice, allTemplates, allUpdates, cwd);
    if (!handled) continue;
  }
}
