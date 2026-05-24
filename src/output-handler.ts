/**
 * output-handler.ts — Output file handling, conversation viewer, and agent management UI.
 *
 * Provides:
 * - Conversation viewing functionality
 * - Interactive /agents menu and all sub-menus
 * - Agent creation wizards
 * - Settings management UI
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { AgentManager } from "./agent-manager.js";
import { getAnimationStyle, getModelLabelFromConfig, getUiStyle, reloadCustomAgents, setAnimationStyle, setUiStyle } from "./agent-registry.js";
import { BUILTIN_TOOL_NAMES, getAgentConfig, getAllTypes } from "./agent-types.js";
import type { ModelRegistry } from "./model-resolver.js";
import { resolveModel } from "./model-resolver.js";
import type { SubagentScheduler } from "./schedule.js";
import { type SubagentsSettings, saveAndEmitChanged } from "./settings.js";
import type { AgentConfig, AgentRecord, JoinMode } from "./types.js";
import type { AgentActivity } from "./ui/agent-widget.js";
import { formatDuration, getDisplayName } from "./ui/agent-widget.js";
import { showSchedulesMenu } from "./ui/schedule-menu.js";
import { showAgentDashboard } from "./ui/agent-dashboard.js";

/** @internal Re-export for use from index.ts */
export type { AgentManager, ModelRegistry, SubagentScheduler };

// ---- Agent file helpers ----

const projectAgentsDir = () => join(process.cwd(), ".pi", "agents");
const personalAgentsDir = () => join(getAgentDir(), "agents");

/** Find the file path of a custom agent by name (project first, then global). */
export function findAgentFile(name: string): { path: string; location: "project" | "personal" } | undefined {
  const projectPath = join(projectAgentsDir(), `${name}.md`);
  if (existsSync(projectPath)) return { path: projectPath, location: "project" };
  const personalPath = join(personalAgentsDir(), `${name}.md`);
  if (existsSync(personalPath)) return { path: personalPath, location: "personal" };
  return undefined;
}

export function getModelLabel(type: string, registry?: ModelRegistry): string {
  const cfg = getAgentConfig(type);
  if (!cfg?.model) return "inherit";
  // If registry provided, check if the model actually resolves
  if (registry) {
    const resolved = resolveModel(cfg.model, registry);
    if (typeof resolved === "string") return "inherit"; // model not available
  }
  return getModelLabelFromConfig(cfg.model);
}

// ---- Conversation viewer ----

export async function viewAgentConversation(
  ctx: ExtensionCommandContext,
  record: AgentRecord,
  agentActivity: Map<string, AgentActivity>,
): Promise<void> {
  if (!record.session) {
    ctx.ui.notify(`Agent is ${record.status === "queued" ? "queued" : "expired"} — no session available.`, "info");
    return;
  }

  const { ConversationViewer, VIEWPORT_HEIGHT_PCT } = await import("./ui/conversation-viewer.js");
  const session = record.session;
  const activity = agentActivity.get(record.id);

  await ctx.ui.custom<undefined>(
    (tui, theme, _keybindings, done) => {
      return new ConversationViewer(tui, session, record, activity, theme, done);
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "90%", maxHeight: `${VIEWPORT_HEIGHT_PCT}%` },
    },
  );
}

// ---- Settings snapshot ----

export function buildSettingsSnapshot(
  manager: AgentManager,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
): SubagentsSettings {
  return {
    maxConcurrent: manager.getMaxConcurrent(),
    // 0 = unlimited — per SubagentsSettings.defaultMaxTurns docstring and
    // normalizeMaxTurns() in agent-runner.ts (which maps 0 → undefined).
    defaultMaxTurns: getDefaultMaxTurns() ?? 0,
    graceTurns: getGraceTurns(),
    defaultJoinMode: getDefaultJoinMode(),
    schedulingEnabled: isSchedulingEnabled(),
    animationStyle: getAnimationStyle(),
    uiStyle: getUiStyle(),
  };
}

// ---- Agent management menu ----

export async function showAgentsMenu(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  scheduler: SubagentScheduler,
  agentActivity: Map<string, AgentActivity>,
  isSchedulingEnabled: () => boolean,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  setDefaultMaxTurns: (n: number | undefined) => void,
  setGraceTurns: (n: number) => void,
  setDefaultJoinMode: (mode: JoinMode) => void,
  setSchedulingEnabled: (b: boolean) => void,
): Promise<void> {
  reloadCustomAgents();
  const allNames = getAllTypes();

  // Build select options
  const options: string[] = [];

  // Running agents entry (only if there are active agents)
  const agents = manager.listAgents();
  if (agents.length > 0) {
    const running = agents.filter(a => a.status === "running" || a.status === "queued").length;
    const done = agents.filter(a => a.status === "completed" || a.status === "steered").length;
    options.push(`Running agents (${agents.length}) — ${running} running, ${done} done`);
  }

  // NEW: Rich interactive dashboard (highest-impact entry point for the TUI work)
  if (agents.length > 0) {
    options.push("Interactive dashboard (hotkeys • live tree • steering)");
  }

  // Agent types list
  if (allNames.length > 0) {
    options.push(`Agent types (${allNames.length})`);
  }

  // Scheduled jobs entry (always present when scheduler is active)
  if (scheduler.isActive()) {
    const jobCount = scheduler.list().length;
    options.push(`Scheduled jobs (${jobCount})`);
  }

  // Actions
  options.push("Create new agent");
  options.push("Settings");

  const noAgentsMsg = allNames.length === 0 && agents.length === 0
    ? "No agents found. Create specialized subagents that can be delegated to.\n\n" +
      "Each subagent has its own context window, custom system prompt, and specific tools.\n\n" +
      "Try creating: Code Reviewer, Security Auditor, Test Writer, or Documentation Writer.\n\n"
    : "";

  if (noAgentsMsg) {
    ctx.ui.notify(noAgentsMsg, "info");
  }

  const choice = await ctx.ui.select("Agents", options);
  if (!choice) return;

  if (choice.startsWith("Running agents (")) {
    await showRunningAgents(ctx, manager, agentActivity);
    await showAgentsMenu(ctx, pi, manager, scheduler, agentActivity, isSchedulingEnabled, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled);
  } else if (choice === "Interactive dashboard (hotkeys • live tree • steering)") {
    // Launch the new rich TUI dashboard (additive, non-breaking)
    const viewConv = (rec: import("./types.js").AgentRecord) =>
      viewAgentConversation(ctx, rec, agentActivity);
    await showAgentDashboard(ctx, manager, agentActivity, viewConv);
    await showAgentsMenu(ctx, pi, manager, scheduler, agentActivity, isSchedulingEnabled, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled);
  } else if (choice.startsWith("Agent types (")) {
    await showAllAgentsList(ctx, ctx.modelRegistry);
    await showAgentsMenu(ctx, pi, manager, scheduler, agentActivity, isSchedulingEnabled, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled);
  } else if (choice.startsWith("Scheduled jobs (")) {
    await showSchedulesMenu(ctx, scheduler);
    await showAgentsMenu(ctx, pi, manager, scheduler, agentActivity, isSchedulingEnabled, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled);
  } else if (choice === "Create new agent") {
    await showCreateWizard(ctx, pi, manager);
  } else if (choice === "Settings") {
    await showSettings(ctx, manager, pi, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled, scheduler);
    await showAgentsMenu(ctx, pi, manager, scheduler, agentActivity, isSchedulingEnabled, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, setDefaultMaxTurns, setGraceTurns, setDefaultJoinMode, setSchedulingEnabled);
  }
}

export async function showAllAgentsList(ctx: ExtensionCommandContext, modelRegistry?: ModelRegistry): Promise<void> {
  const allNames = getAllTypes();
  if (allNames.length === 0) {
    ctx.ui.notify("No agents.", "info");
    return;
  }

  // Source indicators: defaults unmarked, custom agents get • (project) or ◦ (global)
  // Disabled agents get ✕ prefix
  const sourceIndicator = (cfg: AgentConfig | undefined) => {
    const disabled = cfg?.enabled === false;
    if (cfg?.source === "project") return disabled ? "✕• " : "•  ";
    if (cfg?.source === "global") return disabled ? "✕◦ " : "◦  ";
    if (disabled) return "✕  ";
    return "   ";
  };

  const entries = allNames.map(name => {
    const cfg = getAgentConfig(name);
    const disabled = cfg?.enabled === false;
    const model = getModelLabel(name, modelRegistry);
    const indicator = sourceIndicator(cfg);
    const prefix = `${indicator}${name} · ${model}`;
    const desc = disabled ? "(disabled)" : (cfg?.description ?? name);
    return { name, prefix, desc };
  });
  const maxPrefix = Math.max(...entries.map(e => e.prefix.length));

  const hasCustom = allNames.some(n => { const c = getAgentConfig(n); return c && !c.isDefault && c.enabled !== false; });
  const hasDisabled = allNames.some(n => getAgentConfig(n)?.enabled === false);
  const legendParts: string[] = [];
  if (hasCustom) legendParts.push("• = project  ◦ = global");
  if (hasDisabled) legendParts.push("✕ = disabled");
  const legend = legendParts.length ? `\n${legendParts.join("  ")}` : "";

  const options = entries.map(({ prefix, desc }) =>
    `${prefix.padEnd(maxPrefix)} — ${desc}`,
  );
  if (legend) options.push(legend);

  const choice = await ctx.ui.select("Agent types", options);
  if (!choice) return;

  const agentName = choice.split(" · ")[0].replace(/^[•◦✕\s]+/, "").trim();
  if (getAgentConfig(agentName)) {
    await showAgentDetail(ctx, agentName);
    await showAllAgentsList(ctx, modelRegistry);
  }
}

export async function showRunningAgents(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  agentActivity: Map<string, AgentActivity>,
): Promise<void> {
  const agents = manager.listAgents();
  if (agents.length === 0) {
    ctx.ui.notify("No agents.", "info");
    return;
  }

  const options = agents.map(a => {
    const dn = getDisplayName(a.type);
    const dur = formatDuration(a.startedAt, a.completedAt);
    return `${dn} (${a.description}) · ${a.toolUses} tools · ${a.status} · ${dur}`;
  });

  const choice = await ctx.ui.select("Running agents", options);
  if (!choice) return;

  // Find the selected agent by matching the option index
  const idx = options.indexOf(choice);
  if (idx < 0) return;
  const record = agents[idx];

  await viewAgentConversation(ctx, record, agentActivity);
  // Back-navigation: re-show the list
  await showRunningAgents(ctx, manager, agentActivity);
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

/** Eject a default agent: write its embedded config as a .md file. */
export async function ejectAgent(ctx: ExtensionCommandContext, name: string, cfg: AgentConfig): Promise<void> {
  const location = await ctx.ui.select("Choose location", [
    "Project (.pi/agents/)",
    `Personal (${personalAgentsDir()})`,
  ]);
  if (!location) return;

  const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
  mkdirSync(targetDir, { recursive: true });

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

  writeFileSync(targetPath, content, "utf-8");
  reloadCustomAgents();
  ctx.ui.notify(`Ejected ${name} to ${targetPath}`, "info");
}

/** Disable an agent: set enabled: false in its .md file, or create a stub for built-in defaults. */
export async function disableAgent(ctx: ExtensionCommandContext, name: string): Promise<void> {
  const file = findAgentFile(name);
  if (file) {
    // Existing file — set enabled: false in frontmatter (idempotent)
    const content = readFileSync(file.path, "utf-8");
    if (content.includes("\nenabled: false\n")) {
      ctx.ui.notify(`${name} is already disabled.`, "info");
      return;
    }
    const updated = content.replace(/^---\n/, "---\nenabled: false\n");
    writeFileSync(file.path, updated, "utf-8");
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
  mkdirSync(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${name}.md`);
  writeFileSync(targetPath, "---\nenabled: false\n---\n", "utf-8");
  reloadCustomAgents();
  ctx.ui.notify(`Disabled ${name} (${targetPath})`, "info");
}

/** Enable a disabled agent by removing enabled: false from its frontmatter. */
export async function enableAgent(ctx: ExtensionCommandContext, name: string): Promise<void> {
  const file = findAgentFile(name);
  if (!file) return;

  const content = readFileSync(file.path, "utf-8");
  const updated = content.replace(/^(---\n)enabled: false\n/, "$1");

  // If the file was just a stub ("---\n---\n"), delete it to restore the built-in default
  if (updated.trim() === "---\n---" || updated.trim() === "---\n---\n") {
    unlinkSync(file.path);
    reloadCustomAgents();
    ctx.ui.notify(`Enabled ${name} (removed ${file.path})`, "info");
  } else {
    writeFileSync(file.path, updated, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Enabled ${name} (${file.path})`, "info");
  }
}

export async function showCreateWizard(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
): Promise<void> {
  const location = await ctx.ui.select("Choose location", [
    "Project (.pi/agents/)",
    `Personal (${personalAgentsDir()})`,
  ]);
  if (!location) return;

  const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();

  const method = await ctx.ui.select("Creation method", [
    "Generate with Claude (recommended)",
    "Manual configuration",
  ]);
  if (!method) return;

  if (method.startsWith("Generate")) {
    await showGenerateWizard(ctx, targetDir, pi, manager);
  } else {
    await showManualWizard(ctx, targetDir);
  }
}

export async function showGenerateWizard(
  ctx: ExtensionCommandContext,
  targetDir: string,
  pi: ExtensionAPI,
  manager: AgentManager,
): Promise<void> {
  const description = await ctx.ui.input("Describe what this agent should do");
  if (!description) return;

  const name = await ctx.ui.input("Agent name (filename, no spaces)");
  if (!name) return;

  mkdirSync(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${name}.md`);
  if (existsSync(targetPath)) {
    const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
    if (!overwrite) return;
  }

  ctx.ui.notify("Generating agent definition...", "info");

  const generatePrompt = `Create a custom pi sub-agent definition file based on this description: "${description}"

Write a markdown file to: ${targetPath}

The file format is a markdown file with YAML frontmatter and a system prompt body:

\`\`\`markdown
---
description: <one-line description shown in UI>
tools: <comma-separated built-in tools: read, bash, edit, write, grep, find, ls. Use "none" for no tools. Omit for all tools>
model: <optional model as "provider/modelId", e.g. "anthropic/claude-haiku-4-5-20251001". Omit to inherit parent model>
thinking: <optional thinking level: off, minimal, low, medium, high, xhigh. Omit to inherit>
max_turns: <optional max agentic turns. 0 or omit for unlimited (default)>
prompt_mode: <"replace" (body IS the full system prompt) or "append" (body is appended to default prompt). Default: replace>
extensions: <true (inherit all MCP/extension tools), false (none), or comma-separated names. Default: true>
skills: <true (inherit all), false (none), or comma-separated skill names to preload into prompt. Default: true>
disallowed_tools: <comma-separated tool names to block, even if otherwise available. Omit for none>
inherit_context: <true to fork parent conversation into agent so it sees chat history. Default: false>
run_in_background: <true to run in background by default. Default: false>
isolated: <true for no extension/MCP tools, only built-in tools. Default: false>
memory: <"user" (global), "project" (per-project), or "local" (gitignored per-project) for persistent memory. Omit for none>
isolation: <"worktree" to run in isolated git worktree. Omit for normal>
---

<system prompt body — instructions for the agent>
\`\`\`

Guidelines for choosing settings:
- For read-only tasks (review, analysis): tools: read, bash, grep, find, ls
- For code modification tasks: include edit, write
- Use prompt_mode: append if the agent should keep the default system prompt and add specialization on top
- Use prompt_mode: replace for fully custom agents with their own personality/instructions
- Set inherit_context: true if the agent needs to know what was discussed in the parent conversation
- Set isolated: true if the agent should NOT have access to MCP servers or other extensions
- Only include frontmatter fields that differ from defaults — omit fields where the default is fine

Write the file using the write tool. Only write the file, nothing else.`;

  const record = await manager.spawnAndWait(pi, ctx, "general-purpose", generatePrompt, {
    description: `Generate ${name} agent`,
    maxTurns: 5,
  });

  if (record.status === "error") {
    ctx.ui.notify(`Generation failed: ${record.error}`, "warning");
    return;
  }

  reloadCustomAgents();

  if (existsSync(targetPath)) {
    ctx.ui.notify(`Created ${targetPath}`, "info");
  } else {
    ctx.ui.notify("Agent generation completed but file was not created. Check the agent output.", "warning");
  }
}

export async function showManualWizard(ctx: ExtensionCommandContext, targetDir: string): Promise<void> {
  // 1. Name
  const name = await ctx.ui.input("Agent name (filename, no spaces)");
  if (!name) return;

  // 2. Description
  const description = await ctx.ui.input("Description (one line)");
  if (!description) return;

  // 3. Tools
  const toolChoice = await ctx.ui.select("Tools", ["all", "none", "read-only (read, bash, grep, find, ls)", "custom..."]);
  if (!toolChoice) return;

  let tools: string;
  if (toolChoice === "all") {
    tools = BUILTIN_TOOL_NAMES.join(", ");
  } else if (toolChoice === "none") {
    tools = "none";
  } else if (toolChoice.startsWith("read-only")) {
    tools = "read, bash, grep, find, ls";
  } else {
    const customTools = await ctx.ui.input("Tools (comma-separated)", BUILTIN_TOOL_NAMES.join(", "));
    if (!customTools) return;
    tools = customTools;
  }

  // 4. Model
  const modelChoice = await ctx.ui.select("Model", [
    "inherit (parent model)",
    "haiku",
    "sonnet",
    "opus",
    "custom...",
  ]);
  if (!modelChoice) return;

  let modelLine = "";
  if (modelChoice === "haiku") modelLine = "\nmodel: anthropic/claude-haiku-4-5-20251001";
  else if (modelChoice === "sonnet") modelLine = "\nmodel: anthropic/claude-sonnet-4-6";
  else if (modelChoice === "opus") modelLine = "\nmodel: anthropic/claude-opus-4-6";
  else if (modelChoice === "custom...") {
    const customModel = await ctx.ui.input("Model (provider/modelId)");
    if (customModel) modelLine = `\nmodel: ${customModel}`;
  }

  // 5. Thinking
  const thinkingChoice = await ctx.ui.select("Thinking level", [
    "inherit",
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  if (!thinkingChoice) return;

  let thinkingLine = "";
  if (thinkingChoice !== "inherit") thinkingLine = `\nthinking: ${thinkingChoice}`;

  // 6. System prompt
  const systemPrompt = await ctx.ui.editor("System prompt", "");
  if (systemPrompt === undefined) return;

  // Build the file
  const content = `---
description: ${description}
tools: ${tools}${modelLine}${thinkingLine}
prompt_mode: replace
---

${systemPrompt}
`;

  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${name}.md`);

  if (existsSync(targetPath)) {
    const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
    if (!overwrite) return;
  }

  writeFileSync(targetPath, content, "utf-8");
  reloadCustomAgents();
  ctx.ui.notify(`Created ${targetPath}`, "info");
}

export async function showSettings(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  pi: ExtensionAPI,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
  setDefaultMaxTurns: (n: number | undefined) => void,
  setGraceTurns: (n: number) => void,
  setDefaultJoinMode: (mode: JoinMode) => void,
  setSchedulingEnabled: (b: boolean) => void,
  scheduler: SubagentScheduler,
): Promise<void> {
  const choice = await ctx.ui.select("Settings", [
    `Max concurrency (current: ${manager.getMaxConcurrent()})`,
    `Default max turns (current: ${getDefaultMaxTurns() ?? "unlimited"})`,
    `Grace turns (current: ${getGraceTurns()})`,
    `Join mode (current: ${getDefaultJoinMode()})`,
    `Scheduling (current: ${isSchedulingEnabled() ? "enabled" : "disabled"})`,
    `Animation Style (current: ${getAnimationStyle()})`,
    `UI/UX Style (current: ${getUiStyle()})`,
  ]);
  if (!choice) return;

  if (choice.startsWith("Max concurrency")) {
    const val = await ctx.ui.input("Max concurrent background agents", String(manager.getMaxConcurrent()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        manager.setMaxConcurrent(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Max concurrency set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Default max turns")) {
    const val = await ctx.ui.input("Default max turns before wrap-up (0 = unlimited)", String(getDefaultMaxTurns() ?? 0));
    if (val) {
      const n = parseInt(val, 10);
      if (n === 0) {
        setDefaultMaxTurns(undefined);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, "Default max turns set to unlimited");
      } else if (n >= 1) {
        setDefaultMaxTurns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Default max turns set to ${n}`);
      } else {
        ctx.ui.notify("Must be 0 (unlimited) or a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Grace turns")) {
    const val = await ctx.ui.input("Grace turns after wrap-up steer", String(getGraceTurns()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        setGraceTurns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Grace turns set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Join mode")) {
    const val = await ctx.ui.select("Default join mode for background agents", [
      "smart — auto-group 2+ agents in same turn (default)",
      "async — always notify individually",
      "group — always group background agents",
    ]);
    if (val) {
      const mode = val.split(" ")[0] as JoinMode;
      setDefaultJoinMode(mode);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Default join mode set to ${mode}`);
    }
  } else if (choice.startsWith("Scheduling")) {
    const val = await ctx.ui.select(
      "Schedule subagent feature",
      [
        "enabled — Agent tool accepts a `schedule` param; /agents → Scheduled jobs visible",
        "disabled — `schedule` removed from Agent tool spec (no LLM-context cost); menu hidden",
      ],
    );
    if (val) {
      const enabled = val.startsWith("enabled");
      if (enabled === isSchedulingEnabled()) {
        ctx.ui.notify(`Scheduling already ${enabled ? "enabled" : "disabled"}.`, "info");
      } else {
        setSchedulingEnabled(enabled);
        if (!enabled) scheduler.stop();  // immediate kill — outstanding fires stop ticking
        notifyApplied(
          ctx,
          pi,
          manager,
          getDefaultMaxTurns,
          getGraceTurns,
          getDefaultJoinMode,
          isSchedulingEnabled,
          `Scheduling ${enabled ? "enabled" : "disabled"}. Tool spec change takes effect on next pi session.`,
        );
      }
    }
  } else if (choice.startsWith("Animation Style")) {
    const val = await ctx.ui.select("Animation Style", [
      "braille — standard 10-frame spinner (default)",
      "dots — minimal 8-frame dots",
      "lines — classic 4-frame rotating lines",
      "classic — asterisk only (*)",
      "none — no spinner",
    ]);
    if (val) {
      const style = val.split(" ")[0] as "braille" | "dots" | "lines" | "classic" | "none";
      setAnimationStyle(style);
      const { setSpinnerStyle } = await import("./ui/agent-widget.js");
      setSpinnerStyle(style);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Animation style set to ${style}`);
    }
  } else if (choice.startsWith("UI/UX Style")) {
    const val = await ctx.ui.select("UI/UX Style", [
      "premium — truecolor gradients and rounded connectors (default)",
      "retro — 16-color fallback and straight box lines",
      "plain — minimal markers, plain text with no ANSI styles",
      "cinematic — ultra-rich fullscreen Go motion renderer via sidecar",
    ]);
    if (val) {
      const style = val.split(" ")[0] as "premium" | "retro" | "plain" | "cinematic";
      setUiStyle(style);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `UI/UX style set to ${style}`);
    }
  }
}

// Persist the current snapshot, emit `subagents:settings_changed`, and surface
// the right toast. Successful saves show info; persistence failures downgrade
// to warning so users aren't silently reverted on restart. Event fires regardless
// of outcome so listeners see the in-memory change.
export function notifyApplied(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
  successMsg: string,
): void {
  const snapshot = buildSettingsSnapshot(manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled);
  const { message, level } = saveAndEmitChanged(
    snapshot,
    successMsg,
    (event, payload) => pi.events.emit(event, payload),
  );
  ctx.ui.notify(message, level);
}