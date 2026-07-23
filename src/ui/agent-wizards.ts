import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import { reloadCustomAgents } from "../agent-registry.js";
import { BUILTIN_TOOL_NAMES } from "../agent-types.js";
import type { SubagentScheduler } from "../schedule.js";
import {
  buildAgentSystemPrompt,
  type AgentArchitectureMode,
  type AgentAutonomyProfile,
  type AgentSystemBlueprint,
  normalizeWizardName,
  parseAgentSystemBlueprint,
  type SkillGenerationPolicy,
} from "./agent-blueprint.js";
import { personalAgentsDir, projectAgentsDir } from "./agent-file-helpers.js";

const ARCHITECTURE_OPTIONS: Record<string, AgentArchitectureMode> = {
  "Claude decides — smallest correct architecture": "auto",
  "Single specialist agent": "single",
  "Agent + reusable skills": "skill",
  "Autonomous handoff chain": "chain",
  "Self-validating agentic loop": "loop",
  "Timed / scheduled agent": "scheduled",
  "Full autonomous system": "full",
};

const AUTONOMY_OPTIONS: Record<string, AgentAutonomyProfile> = {
  "Safe least-privilege defaults": "safe",
  "Strictly read-only": "read-only",
  "Implementation in isolated worktrees": "implementation",
  "Full autonomy with budgets and validation": "full",
};

const SKILL_OPTIONS: Record<string, SkillGenerationPolicy> = {
  "Claude decides when a reusable skill is justified": "auto",
  "Always create reusable skills": "always",
  "Do not create skills": "never",
};

const ACTIVATION_OPTIONS = [
  "On demand only",
  "Run once — ISO date/time or +duration",
  "Repeat on interval — e.g. 30m, 2h",
  "Cron schedule — e.g. 0 9 * * 1-5",
  "Let Claude propose timing when the goal requires it",
] as const;

function mapChoice<T>(choice: string | undefined, options: Record<string, T>): T | undefined {
  return choice ? options[choice] : undefined;
}

function agentPath(targetDir: string, name: string): string {
  return join(targetDir, `${name}.md`);
}

function skillDir(targetDir: string, name: string): string {
  return join(targetDir, "..", "skills", name);
}

function skillPath(targetDir: string, name: string): string {
  return join(skillDir(targetDir, name), "SKILL.md");
}

function formatBlueprintSummary(blueprint: AgentSystemBlueprint): string {
  const agentNames = blueprint.agents
    .map((agent) => `${agent.name}${agent.primary ? " (primary)" : ""}`)
    .join(", ");
  const skillNames = blueprint.skills.length > 0
    ? blueprint.skills.map((skill) => skill.name).join(", ")
    : "none";
  const lines = [
    blueprint.summary,
    "",
    `Agents: ${agentNames}`,
    `Skills: ${skillNames}`,
    `Schedule: ${blueprint.schedule ? blueprint.schedule.schedule : "none"}`,
  ];
  if (blueprint.warnings.length > 0) {
    lines.push("", `Warnings: ${blueprint.warnings.join(" | ")}`);
  }
  return lines.join("\n");
}

async function collectScheduleHint(
  ctx: ExtensionCommandContext,
  architecture: AgentArchitectureMode,
): Promise<string | undefined | null> {
  const activation = await ctx.ui.select("Activation", [...ACTIVATION_OPTIONS]);
  if (!activation) return null;

  if (activation === "On demand only") {
    return architecture === "scheduled"
      ? "A concrete schedule is required. Infer the safest useful cadence from the user's goal."
      : undefined;
  }
  if (activation === "Let Claude propose timing when the goal requires it") {
    return architecture === "scheduled"
      ? "A concrete schedule is required. Choose the safest useful cadence from the user's goal."
      : "Propose a schedule only when timing or recurrence is materially required by the user's goal.";
  }

  const defaults: Record<string, string> = {
    "Run once — ISO date/time or +duration": "+10m",
    "Repeat on interval — e.g. 30m, 2h": "1h",
    "Cron schedule — e.g. 0 9 * * 1-5": "0 9 * * 1-5",
  };
  const schedule = await ctx.ui.input("Schedule expression", defaults[activation]);
  if (!schedule?.trim()) return null;

  if (activation.startsWith("Run once")) {
    return `Create a one-shot schedule using exactly "${schedule.trim()}".`;
  }
  if (activation.startsWith("Repeat")) {
    return `Create a recurring interval schedule using exactly "${schedule.trim()}".`;
  }
  return `Create a cron schedule using exactly "${schedule.trim()}".`;
}

function preflightOverwrite(
  ctx: ExtensionCommandContext,
  targetDir: string,
  blueprint: AgentSystemBlueprint,
): Promise<boolean> {
  const existing = [
    ...blueprint.agents.map((agent) => agentPath(targetDir, agent.name)),
    ...blueprint.skills.map((skill) => skillPath(targetDir, skill.name)),
  ].filter(existsSync);

  if (existing.length === 0) return Promise.resolve(true);
  const preview = existing.length <= 8
    ? existing.join("\n")
    : `${existing.slice(0, 8).join("\n")}\n…and ${existing.length - 8} more`;
  return ctx.ui.confirm(
    `Overwrite ${existing.length} existing resource${existing.length === 1 ? "" : "s"}?`,
    preview,
  );
}

function writeBlueprint(targetDir: string, blueprint: AgentSystemBlueprint): void {
  mkdirSync(targetDir, { recursive: true });
  for (const agent of blueprint.agents) {
    writeFileSync(agentPath(targetDir, agent.name), agent.content, "utf-8");
  }

  for (const skill of blueprint.skills) {
    mkdirSync(skillDir(targetDir, skill.name), { recursive: true });
    writeFileSync(skillPath(targetDir, skill.name), skill.content, "utf-8");
  }
}

function validateBlueprintSelections(
  blueprint: AgentSystemBlueprint,
  architecture: AgentArchitectureMode,
  skillPolicy: SkillGenerationPolicy,
): string | undefined {
  if (architecture === "single" && blueprint.agents.length !== 1) {
    return "Single-agent mode must produce exactly one agent.";
  }
  if (architecture === "skill" && blueprint.skills.length === 0) {
    return "Agent + skills mode must produce at least one skill.";
  }
  if (architecture === "chain" && blueprint.agents.length < 2) {
    return "Handoff-chain mode must produce at least two agents.";
  }
  if (architecture === "scheduled" && !blueprint.schedule) {
    return "Scheduled-agent mode must produce a schedule.";
  }
  if (skillPolicy === "always" && blueprint.skills.length === 0) {
    return "The selected skill policy requires at least one generated skill.";
  }
  if (skillPolicy === "never" && blueprint.skills.length > 0) {
    return "The selected skill policy forbids generated skills.";
  }
  return undefined;
}

async function generateValidatedBlueprint(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  name: string,
  generatePrompt: string,
  architecture: AgentArchitectureMode,
  skillPolicy: SkillGenerationPolicy,
): Promise<AgentSystemBlueprint | undefined> {
  ctx.ui.notify("Architecting agent system...", "info");
  let record = await manager.spawnAndWait(pi, ctx, "Explore", generatePrompt, {
    description: `Architect ${name} agent system`,
    maxTurns: 10,
    isolated: true,
    inheritContext: false,
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (record.status === "error") {
      ctx.ui.notify(`Generation failed: ${record.error ?? "unknown error"}`, "warning");
      return undefined;
    }

    const output = record.result?.trim() ?? "";
    let rejection = "";
    if (!output) {
      rejection = "The response was empty.";
    } else {
      try {
        const blueprint = parseAgentSystemBlueprint(output, name);
        rejection = validateBlueprintSelections(blueprint, architecture, skillPolicy) ?? "";
        if (!rejection) return blueprint;
      } catch (error) {
        rejection = error instanceof Error ? error.message : String(error);
      }
    }

    if (attempt === 3) {
      ctx.ui.notify(`Claude could not produce a valid blueprint: ${rejection}`, "warning");
      if (output) await ctx.ui.editor("Rejected architect output", output);
      return undefined;
    }

    ctx.ui.notify(
      `Blueprint rejected (${attempt}/3): ${rejection} Asking Claude to repair it...`,
      "warning",
    );
    const repaired = await manager.resume(
      record.id,
      `Your previous blueprint was rejected by the host validator.

REJECTION:
${rejection}

Return a COMPLETE replacement blueprint as strict JSON only. Preserve the requested primary name "${name}", obey the selected architecture and skill policy, use no markdown fence, and do not call tools.`,
    );
    if (!repaired) {
      ctx.ui.notify("Claude session could not be resumed for blueprint repair.", "warning");
      return undefined;
    }
    record = repaired;
  }

  return undefined;
}

async function activateSchedule(
  ctx: ExtensionCommandContext,
  scheduler: SubagentScheduler | undefined,
  blueprint: AgentSystemBlueprint,
): Promise<boolean> {
  const schedule = blueprint.schedule;
  const primary = blueprint.agents.find((agent) => agent.primary)?.name;
  if (!schedule || !primary) return false;

  if (!scheduler?.isActive()) {
    ctx.ui.notify(
      `Schedule "${schedule.schedule}" was generated but the scheduler is not active in this session.`,
      "warning",
    );
    return false;
  }

  const activate = await ctx.ui.confirm(
    "Activate generated schedule?",
    `${schedule.name}\n${schedule.schedule}\nAgent: ${primary}\n\n${schedule.description}`,
  );
  if (!activate) return false;

  try {
    await scheduler.addJob({
      name: schedule.name,
      description: schedule.description,
      schedule: schedule.schedule,
      subagent_type: primary,
      prompt: schedule.prompt,
      model: schedule.model,
      thinking: schedule.thinking,
      max_turns: schedule.max_turns,
      isolated: schedule.isolated,
      isolation: schedule.isolation,
    });
    ctx.ui.notify(`Activated schedule "${schedule.name}".`, "info");
    return true;
  } catch (error) {
    ctx.ui.notify(
      `Agent files were created, but schedule activation failed: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
    return false;
  }
}

async function runPrimaryNow(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  blueprint: AgentSystemBlueprint,
  fallbackPrompt: string,
): Promise<void> {
  const primary = blueprint.agents.find((agent) => agent.primary)?.name;
  if (!primary) return;

  const initialPrompt = await ctx.ui.editor(
    `Initial task for ${primary}`,
    blueprint.schedule?.prompt ?? fallbackPrompt,
  );
  if (!initialPrompt?.trim()) return;

  ctx.ui.notify(`Starting ${primary}...`, "info");
  const record = await manager.spawnAndWait(pi, ctx, primary, initialPrompt.trim(), {
    description: `Run generated agent ${primary}`,
  });

  if (record.status === "error") {
    ctx.ui.notify(`Agent failed: ${record.error ?? "unknown error"}`, "warning");
  } else {
    ctx.ui.notify(`${primary} finished with status ${record.status}.`, "info");
  }
}

async function runCompleteChainNow(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  blueprint: AgentSystemBlueprint,
  fallbackPrompt: string,
): Promise<void> {
  const primary = blueprint.agents.find((agent) => agent.primary);
  if (!primary) return;

  const initialPrompt = await ctx.ui.editor(
    "Initial task for the generated chain",
    fallbackPrompt,
  );
  if (!initialPrompt?.trim()) return;

  const orderedAgents = [
    primary,
    ...blueprint.agents.filter((agent) => agent.name !== primary.name),
  ];
  let previousOutput = "";

  for (let index = 0; index < orderedAgents.length; index++) {
    const agent = orderedAgents[index];
    const stagePrompt = `Execute stage ${index + 1}/${orderedAgents.length} of this generated agent chain.

ORIGINAL TASK:
${initialPrompt.trim()}

${previousOutput
  ? `PREVIOUS STAGE OUTPUT / HANDOFF:
${previousOutput}`
  : "This is the first stage; there is no previous handoff."}

Complete your own role, verify its exit criteria, and return a concrete handoff for the next stage.`;

    ctx.ui.notify(`Running chain stage ${index + 1}/${orderedAgents.length}: ${agent.name}`, "info");
    const record = await manager.spawnAndWait(pi, ctx, agent.name, stagePrompt, {
      description: `Chain stage ${index + 1}: ${agent.name}`,
    });

    if (record.status === "error" || !record.result?.trim()) {
      ctx.ui.notify(
        `Chain stopped at ${agent.name}: ${record.error ?? "agent returned no output"}`,
        "warning",
      );
      return;
    }
    previousOutput = record.result;
  }

  await ctx.ui.editor("Chain result", previousOutput);
  ctx.ui.notify(`Completed ${orderedAgents.length}-stage agent chain.`, "info");
}

export async function showCreateWizard(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  scheduler?: SubagentScheduler,
): Promise<void> {
  const location = await ctx.ui.select("Choose location", [
    "Project (.pi/agents/)",
    `Personal (${personalAgentsDir()})`,
  ]);
  if (!location) return;

  const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();

  const method = await ctx.ui.select("Creation method", [
    "Generate complete agent system with Claude (recommended)",
    "Manual single-agent configuration",
  ]);
  if (!method) return;

  if (method.startsWith("Generate")) {
    await showGenerateWizard(ctx, targetDir, pi, manager, scheduler);
  } else {
    await showManualWizard(ctx, targetDir);
  }
}

export async function showGenerateWizard(
  ctx: ExtensionCommandContext,
  targetDir: string,
  pi: ExtensionAPI,
  manager: AgentManager,
  scheduler?: SubagentScheduler,
): Promise<void> {
  const description = await ctx.ui.editor(
    "Describe the outcome, inputs, tools, success criteria, constraints, and failure behavior",
    "",
  );
  if (!description?.trim()) return;

  const rawName = await ctx.ui.input("Primary agent name (filename, no spaces)");
  if (!rawName) return;

  let name: string;
  try {
    name = normalizeWizardName(rawName);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    return;
  }

  const architecture = mapChoice(
    await ctx.ui.select("Architecture", Object.keys(ARCHITECTURE_OPTIONS)),
    ARCHITECTURE_OPTIONS,
  );
  if (!architecture) return;

  const autonomy = mapChoice(
    await ctx.ui.select("Autonomy and permissions", Object.keys(AUTONOMY_OPTIONS)),
    AUTONOMY_OPTIONS,
  );
  if (!autonomy) return;

  const skillPolicy = mapChoice(
    await ctx.ui.select("Reusable skills", Object.keys(SKILL_OPTIONS)),
    SKILL_OPTIONS,
  );
  if (!skillPolicy) return;

  const scheduleHint = await collectScheduleHint(ctx, architecture);
  if (scheduleHint === null) return;

  const targetSkillDir = join(targetDir, "..", "skills");
  const generatePrompt = buildAgentSystemPrompt({
    requestedName: name,
    description: description.trim(),
    architecture,
    autonomy,
    skillPolicy,
    scheduleHint,
    targetAgentDir: targetDir,
    targetSkillDir,
  });

  const blueprint = await generateValidatedBlueprint(
    ctx,
    pi,
    manager,
    name,
    generatePrompt,
    architecture,
    skillPolicy,
  );
  if (!blueprint) return;

  const approved = await ctx.ui.confirm(
    "Create this agent system?",
    formatBlueprintSummary(blueprint),
  );
  if (!approved) return;

  if (!(await preflightOverwrite(ctx, targetDir, blueprint))) return;

  try {
    writeBlueprint(targetDir, blueprint);
    await reloadCustomAgents();
  } catch (error) {
    ctx.ui.notify(
      `Failed to create agent system: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
    return;
  }

  const scheduled = await activateSchedule(ctx, scheduler, blueprint);
  const warningText = blueprint.warnings.length > 0
    ? `\nWarnings: ${blueprint.warnings.join(" | ")}`
    : "";
  ctx.ui.notify(
    `Created ${blueprint.agents.length} agent(s) and ${blueprint.skills.length} skill(s)${scheduled ? " with an active schedule" : ""}.${warningText}`,
    blueprint.warnings.length > 0 ? "warning" : "info",
  );

  const postAction = await ctx.ui.select("Next action", [
    "Finish",
    "Run primary agent now",
    ...(blueprint.agents.length > 1 ? ["Run complete chain now"] : []),
    ...(blueprint.schedule && scheduler?.isActive() && !scheduled
      ? ["Activate generated schedule"]
      : []),
  ]);

  if (postAction === "Run primary agent now") {
    await runPrimaryNow(ctx, pi, manager, blueprint, description.trim());
  } else if (postAction === "Run complete chain now") {
    await runCompleteChainNow(ctx, pi, manager, blueprint, description.trim());
  } else if (postAction === "Activate generated schedule") {
    await activateSchedule(ctx, scheduler, blueprint);
  }
}

export async function showManualWizard(ctx: ExtensionCommandContext, targetDir: string): Promise<void> {
  // 1. Name
  const rawName = await ctx.ui.input("Agent name (filename, no spaces)");
  if (!rawName) return;

  let name: string;
  try {
    name = normalizeWizardName(rawName);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
    return;
  }

  // 2. Description
  const description = await ctx.ui.input("Description (one line)");
  if (!description) return;

  // 3. Tools
  const readOnlyTools = BUILTIN_TOOL_NAMES.filter((tool) => tool !== "edit" && tool !== "write");
  const readOnlyLabel = `read-only (${readOnlyTools.join(", ")})`;
  const toolChoice = await ctx.ui.select("Tools", ["all", "none", readOnlyLabel, "custom..."]);
  if (!toolChoice) return;

  let tools: string;
  if (toolChoice === "all") {
    tools = BUILTIN_TOOL_NAMES.join(", ");
  } else if (toolChoice === "none") {
    tools = "none";
  } else if (toolChoice === readOnlyLabel) {
    tools = readOnlyTools.join(", ");
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
    "max",
  ]);
  if (!thinkingChoice) return;
  if (thinkingChoice === "max") {
    const ok = await ctx.ui.confirm(
      "Thinking level: max",
      "max requires a supporting model (GPT-5.6 / adaptive Claude). Unsupported models will error or fall back to a lower level. Continue?",
    );
    if (!ok) return;
  }

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
  const targetPath = agentPath(targetDir, name);

  if (existsSync(targetPath)) {
    const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
    if (!overwrite) return;
  }

  writeFileSync(targetPath, content, "utf-8");
  await reloadCustomAgents();
  ctx.ui.notify(`Created ${targetPath}`, "info");
}
