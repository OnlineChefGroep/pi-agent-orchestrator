import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { reloadCustomAgents } from "../agent-registry.js";
import type { AgentConfig } from "../types.js";
import { findAgentFile, personalAgentsDir, projectAgentsDir } from "./agent-file-helpers.js";

/** Eject a default agent: write its embedded config as a .md file. */
export async function ejectAgent(ctx: ExtensionCommandContext, name: string, cfg: AgentConfig): Promise<void> {
  const location = await ctx.ui.select("Choose location", [
    "Project (.pi/agents/)",
    `Personal (${personalAgentsDir()})`,
  ]);
  if (!location) return;

  const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
  await mkdir(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${name}.md`);
  if (existsSync(targetPath)) {
    const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
    if (!overwrite) return;
  }

  // Build the .md file content
  const fmFields: string[] = [];
  fmFields.push(`description: ${cfg.description}`);
  if (cfg.displayName) fmFields.push(`display_name: ${cfg.displayName}`);
  fmFields.push(`tools: ${cfg.builtinToolNames?.join(", ") || "all"}`);
  if (cfg.model) fmFields.push(`model: ${cfg.model}`);
  if (cfg.thinking) fmFields.push(`thinking: ${cfg.thinking}`);
  if (cfg.maxTurns) fmFields.push(`max_turns: ${cfg.maxTurns}`);
  fmFields.push(`prompt_mode: ${cfg.promptMode}`);
  if (cfg.extensions === false) fmFields.push("extensions: false");
  else if (Array.isArray(cfg.extensions)) fmFields.push(`extensions: ${cfg.extensions.join(", ")}`);
  if (cfg.skills === false) fmFields.push("skills: false");
  else if (Array.isArray(cfg.skills)) fmFields.push(`skills: ${cfg.skills.join(", ")}`);
  if (cfg.disallowedTools?.length) fmFields.push(`disallowed_tools: ${cfg.disallowedTools.join(", ")}`);
  if (cfg.inheritContext) fmFields.push("inherit_context: true");
  if (cfg.runInBackground) fmFields.push("run_in_background: true");
  if (cfg.isolated) fmFields.push("isolated: true");
  if (cfg.memory) fmFields.push(`memory: ${cfg.memory}`);
  if (cfg.isolation) fmFields.push(`isolation: ${cfg.isolation}`);

  const content = `---\n${fmFields.join("\n")}\n---\n\n${cfg.systemPrompt}\n`;

  await writeFile(targetPath, content, "utf-8");
  reloadCustomAgents();
  ctx.ui.notify(`Ejected ${name} to ${targetPath}`, "info");
}

/** Disable an agent: set enabled: false in its .md file, or create a stub for built-in defaults. */
export async function disableAgent(ctx: ExtensionCommandContext, name: string): Promise<void> {
  const file = findAgentFile(name);
  if (file) {
    // Existing file — set enabled: false in frontmatter (idempotent)
    const content = await readFile(file.path, "utf-8");
    if (content.includes("\nenabled: false\n")) {
      ctx.ui.notify(`${name} is already disabled.`, "info");
      return;
    }
    const updated = content.replace(/^---\n/, "---\nenabled: false\n");
    await writeFile(file.path, updated, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Disabled ${name} (${file.path})`, "info");
    return;
  }

  // No file (built-in default) — create a stub
  const location = await ctx.ui.select("Choose location", [
    "Project (.pi/agents/)",
    `Personal (${personalAgentsDir()})`,
  ]);
  if (!location) return;

  const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
  await mkdir(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${name}.md`);
  await writeFile(targetPath, "---\nenabled: false\n---\n", "utf-8");
  reloadCustomAgents();
  ctx.ui.notify(`Disabled ${name} (${targetPath})`, "info");
}

/** Enable a disabled agent by removing enabled: false from its frontmatter. */
export async function enableAgent(ctx: ExtensionCommandContext, name: string): Promise<void> {
  const file = findAgentFile(name);
  if (!file) return;

  const content = await readFile(file.path, "utf-8");
  const updated = content.replace(/^(---\n)enabled: false\n/, "$1");

  // If the file was just a stub ("---\n---\n"), delete it to restore the built-in default
  if (updated.trim() === "---\n---" || updated.trim() === "---\n---\n") {
    await unlink(file.path);
    reloadCustomAgents();
    ctx.ui.notify(`Enabled ${name} (removed ${file.path})`, "info");
  } else {
    await writeFile(file.path, updated, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Enabled ${name} (${file.path})`, "info");
  }
}
