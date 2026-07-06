import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import { reloadCustomAgents } from "../agent-registry.js";
import { BUILTIN_TOOL_NAMES } from "../agent-types.js";
import { personalAgentsDir, projectAgentsDir } from "./agent-file-helpers.js";

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

  const method = await ctx.ui.select("Creation method", ["Generate with Claude (recommended)", "Manual configuration"]);
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

  await reloadCustomAgents();

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
  const toolChoice = await ctx.ui.select("Tools", [
    "all",
    "none",
    "read-only (read, bash, grep, find, ls)",
    "custom...",
  ]);
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
  const modelChoice = await ctx.ui.select("Model", ["inherit (parent model)", "haiku", "sonnet", "opus", "custom..."]);
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
  await reloadCustomAgents();
  ctx.ui.notify(`Created ${targetPath}`, "info");
}
