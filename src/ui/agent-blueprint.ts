/**
 * agent-blueprint.ts — deterministic parsing and validation for AI-generated
 * agent-system blueprints.
 *
 * The architect model is intentionally not allowed to write files directly.
 * It returns one strict JSON blueprint; the host validates every resource and
 * performs the writes itself. This removes the historical "generation
 * completed but file was not created" failure mode and makes multi-file agent
 * system creation deterministic.
 */

import type { ThinkingLevel } from "../types.js";

export type AgentArchitectureMode =
  | "auto"
  | "single"
  | "skill"
  | "chain"
  | "loop"
  | "scheduled"
  | "full";

export type AgentAutonomyProfile =
  | "safe"
  | "read-only"
  | "implementation"
  | "full";

export type SkillGenerationPolicy = "auto" | "always" | "never";

export interface AgentBlueprintFile {
  name: string;
  content: string;
  primary: boolean;
}

export interface SkillBlueprintFile {
  name: string;
  content: string;
}

export interface ScheduleBlueprint {
  name: string;
  description: string;
  schedule: string;
  prompt: string;
  model?: string;
  thinking?: ThinkingLevel;
  max_turns?: number;
  isolated?: boolean;
  isolation?: "worktree";
}

export interface AgentSystemBlueprint {
  summary: string;
  warnings: string[];
  agents: AgentBlueprintFile[];
  skills: SkillBlueprintFile[];
  schedule?: ScheduleBlueprint;
}

export interface GenerationPromptInput {
  requestedName: string;
  description: string;
  architecture: AgentArchitectureMode;
  autonomy: AgentAutonomyProfile;
  skillPolicy: SkillGenerationPolicy;
  scheduleHint?: string;
  targetAgentDir: string;
  targetSkillDir: string;
}

const SAFE_RESOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_AGENT_FILES = 6;
const MAX_SKILL_FILES = 8;
const MAX_FILE_CONTENT = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  field: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!options.allowEmpty && !trimmed) {
    throw new Error(`${field} must not be empty`);
  }
  const maxLength = options.maxLength ?? MAX_FILE_CONTENT;
  if (value.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }
  return value;
}

function requireSafeName(value: unknown, field: string): string {
  const name = requireString(value, field, { maxLength: 100 }).trim();
  if (!SAFE_RESOURCE_NAME.test(name) || name === "." || name === "..") {
    throw new Error(
      `${field} must use only letters, numbers, dot, underscore, and dash; no spaces or paths`,
    );
  }
  return name;
}

function requireDefinitionFile(content: unknown, field: string): string {
  const value = requireString(content, field);
  const normalized = value.trimStart();
  if (!normalized.startsWith("---")) {
    throw new Error(`${field} must start with YAML frontmatter`);
  }
  const closing = normalized.indexOf("\n---", 3);
  if (closing < 0) {
    throw new Error(`${field} is missing the closing YAML frontmatter delimiter`);
  }
  if (!normalized.slice(closing + 4).trim()) {
    throw new Error(`${field} must contain an instruction body after frontmatter`);
  }
  return value.endsWith("\n") ? value : `${value}\n`;
}

/**
 * Remove terminal control characters that can leak into a TUI input value
 * (notably DEL / 0x7f from backspace) and validate the resulting filename.
 */
export function normalizeWizardName(raw: string): string {
  const normalized = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return requireSafeName(normalized, "Agent name");
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Architect returned an empty response");

  const unfenced = trimmed
  .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Architect response did not contain a JSON object");
  }
  return unfenced.slice(start, end + 1);
}

function parseSchedule(value: unknown, requestedName: string): ScheduleBlueprint | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error("schedule must be an object or null");

  const schedule = requireString(value.schedule, "schedule.schedule", { maxLength: 200 }).trim();
  const prompt = requireString(value.prompt, "schedule.prompt", { maxLength: 50_000 });
  const name = value.name === undefined
    ? `${requestedName}-schedule`
    : requireSafeName(value.name, "schedule.name");
  const description = value.description === undefined
    ? `Scheduled execution for ${requestedName}`
    : requireString(value.description, "schedule.description", { maxLength: 500 }).trim();

  const result: ScheduleBlueprint = {
    name,
    description,
    schedule,
    prompt,
  };

  if (value.model !== undefined) {
    result.model = requireString(value.model, "schedule.model", { maxLength: 200 }).trim();
  }
  if (value.thinking !== undefined) {
    const thinking = requireString(value.thinking, "schedule.thinking", { maxLength: 20 }).trim();
    const allowedThinking = new Set([
      "off", "minimal", "low", "medium", "high", "xhigh", "max",
    ]);
    if (!allowedThinking.has(thinking)) {
      throw new Error("schedule.thinking is not a supported thinking level");
    }
    result.thinking = thinking as ThinkingLevel;
  }
  if (value.max_turns !== undefined) {
    if (
      typeof value.max_turns !== "number"
      || !Number.isInteger(value.max_turns)
      || value.max_turns < 0
    ) {
      throw new Error("schedule.max_turns must be a non-negative integer");
    }
    result.max_turns = value.max_turns;
  }
  if (value.isolated !== undefined) {
    if (typeof value.isolated !== "boolean") {
      throw new Error("schedule.isolated must be a boolean");
    }
    result.isolated = value.isolated;
  }
  if (value.isolation !== undefined) {
    if (value.isolation !== "worktree") {
      throw new Error('schedule.isolation must be "worktree" when provided');
    }
    result.isolation = "worktree";
  }

  return result;
}

/**
 * Parse and strictly validate the architect response.
 *
 * The requested filename must be present and must be the only primary agent.
 * No paths are accepted in generated names, so writes remain inside the
 * selected agent/skill roots.
 */
export function parseAgentSystemBlueprint(
  raw: string,
  requestedName: string,
): AgentSystemBlueprint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(raw));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Architect")) throw error;
    throw new Error(`Architect returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) throw new Error("Blueprint root must be a JSON object");
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    throw new Error("Blueprint must contain at least one agent");
  }
  if (parsed.agents.length > MAX_AGENT_FILES) {
    throw new Error(`Blueprint may contain at most ${MAX_AGENT_FILES} agents`);
  }

  const seenAgents = new Set<string>();
  const agents: AgentBlueprintFile[] = parsed.agents.map((item, index) => {
    if (!isRecord(item)) throw new Error(`agents[${index}] must be an object`);
    const name = requireSafeName(item.name, `agents[${index}].name`);
    if (seenAgents.has(name)) throw new Error(`Duplicate agent name: ${name}`);
    seenAgents.add(name);

    return {
      name,
      content: requireDefinitionFile(item.content, `agents[${index}].content`),
      primary: item.primary === true,
    };
  });

  const requested = agents.find((agent) => agent.name === requestedName);
  if (!requested) {
    throw new Error(`Blueprint must contain the requested primary agent "${requestedName}"`);
  }

  const markedPrimary = agents.filter((agent) => agent.primary);
  if (markedPrimary.length === 0) {
    requested.primary = true;
  } else if (markedPrimary.length !== 1 || markedPrimary[0].name !== requestedName) {
    throw new Error(`"${requestedName}" must be the only primary agent`);
  }

  const rawSkills = parsed.skills ?? [];
  if (!Array.isArray(rawSkills)) throw new Error("skills must be an array");
  if (rawSkills.length > MAX_SKILL_FILES) {
    throw new Error(`Blueprint may contain at most ${MAX_SKILL_FILES} skills`);
  }

  const seenSkills = new Set<string>();
  const skills: SkillBlueprintFile[] = rawSkills.map((item, index) => {
    if (!isRecord(item)) throw new Error(`skills[${index}] must be an object`);
    const name = requireSafeName(item.name, `skills[${index}].name`);
    if (seenSkills.has(name)) throw new Error(`Duplicate skill name: ${name}`);
    seenSkills.add(name);
    return {
      name,
      content: requireDefinitionFile(item.content, `skills[${index}].content`),
    };
  });

  const warnings = parsed.warnings === undefined
    ? []
    : Array.isArray(parsed.warnings)
      ? parsed.warnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
        .slice(0, 20)
      : (() => { throw new Error("warnings must be an array of strings"); })();

  const summary = parsed.summary === undefined
    ? `Generated ${agents.length} agent(s) and ${skills.length} skill(s)`
    : requireString(parsed.summary, "summary", { maxLength: 2_000 }).trim();

  return {
    summary,
    warnings,
    agents,
    skills,
    schedule: parseSchedule(parsed.schedule, requestedName),
  };
}

const ARCHITECTURE_GUIDANCE: Record<AgentArchitectureMode, string> = {
  auto: "Choose the smallest architecture that fully satisfies the goal. Add supporting agents, skills, validation, or scheduling only when operationally justified.",
  single: "Create one specialist agent. Do not create companion agents. Add a skill only when it prevents a large system prompt from being reusable.",
  skill: "Create one primary agent plus one or more reusable Agent Skills. Keep stable methodology in skills and task-specific operating rules in the agent.",
  chain: "Create a bounded multi-agent handoff chain (for example planner -> executor -> reviewer). Every hop must have explicit inputs, outputs, stop conditions, and failure behavior.",
  loop: "Create a closed self-validating agentic loop with bounded retries, explicit success criteria, failure escalation, and a structured handoff. Never create an unbounded self-spawn loop.",
  scheduled: "Create an agent intended for autonomous timed execution and include a concrete schedule object. The scheduled prompt must be self-contained.",
  full: "Create a production-grade autonomous system: primary coordinator, only necessary companion agents, reusable skills, validation/retry behavior, structured handoffs, worktree isolation where writes occur, and a schedule when the goal implies recurrence.",
};

const AUTONOMY_GUIDANCE: Record<AgentAutonomyProfile, string> = {
  safe: "Use least privilege. Prefer read-only tools and isolated extensions unless writes or external tools are essential.",
  "read-only": "All agents must be read-only. Use tools: read, bash, grep and disallowed_tools: write, edit. Do not create implementation agents.",
  implementation: "Implementation agents may use read, bash, grep, edit, write. Use worktree isolation for mutation and add a read-only reviewer when useful.",
  full: "Allow autonomous implementation, delegation, validation, handoff, and persistent project memory where justified. Keep hard budgets, bounded retries, and worktree isolation for code changes.",
};

const SKILL_GUIDANCE: Record<SkillGenerationPolicy, string> = {
  auto: "Create skills only for stable, reusable procedures or domain knowledge that should be shared across agents.",
  always: "Create at least one reusable skill and preload it explicitly from the relevant agent frontmatter.",
  never: "Do not create skill files. Keep all required behavior in agent definitions.",
};

/**
 * Build the architect instruction. It describes only runtime features that the
 * repository actually supports; schedules are deliberately represented as a
 * separate object rather than unsupported agent frontmatter.
 */
export function buildAgentSystemPrompt(input: GenerationPromptInput): string {
  const scheduleInstruction = input.scheduleHint
    ? `Activation requirement: ${input.scheduleHint}`
    : "Activation requirement: on demand only; return schedule: null.";

  return `You are the agent-system architect for @onlinechefgroep/pi-agent-orchestrator.

Design a complete, executable custom-agent system for this request:

REQUESTED PRIMARY AGENT NAME: ${input.requestedName}
USER GOAL:
${input.description}

ARCHITECTURE MODE:
${ARCHITECTURE_GUIDANCE[input.architecture]}

AUTONOMY PROFILE:
${AUTONOMY_GUIDANCE[input.autonomy]}

SKILL POLICY:
${SKILL_GUIDANCE[input.skillPolicy]}

${scheduleInstruction}

TARGETS:
- Agent definitions will be written by the host to: ${input.targetAgentDir}/<name>.md
- Skills will be written by the host to: ${input.targetSkillDir}/<name>/SKILL.md
- You may use read, grep, and read-only bash commands to inspect existing agents and skills.
- You must NOT call write/edit or create files yourself.

SUPPORTED AGENT FRONTMATTER:
- display_name: string
- description: one line
- tools: CSV of read, bash, edit, write, grep; use "none" for no built-ins
- disallowed_tools: CSV hard denylist
- extensions: true, false, or CSV extension names
- skills: true, false, or CSV names of generated/existing skills
- model: optional provider/modelId
- thinking: off|minimal|low|medium|high|xhigh|max
- max_turns: non-negative integer, 0 means unlimited
- prompt_mode: replace|append
- inherit_context: boolean
- run_in_background: boolean
- isolated: boolean
- memory: user|project|local
- isolation: worktree
- handoff: boolean
- prompt_compression: minimal|balanced|aggressive
- validators: YAML array of { agentId, criteria[] }
- enabled: boolean

RUNTIME RULES:
1. The primary agent name must be exactly "${input.requestedName}".
2. Use only supported frontmatter. Scheduling is NOT frontmatter; put it in the separate schedule object.
3. Inspect existing agent and skill definitions when useful. Reuse existing skills by name instead of generating duplicates.
4. Every agent definition must start with YAML frontmatter and contain a substantial system-prompt body.
5. Write agents must use isolation: worktree unless the goal explicitly requires the live checkout.
6. Read-only agents must explicitly deny write and edit.
7. Chains and loops must be bounded: explicit completion criteria, retry ceiling, error handoff, and no recursive self-spawn without a hard level/task budget.
8. The agents array is execution order and the requested primary agent must be first. A handoff chain is run by the parent/wizard; custom agents cannot assume they can directly spawn the next agent.
9. Handoff agents must explain the structured artifact/summary they emit and what the next stage should consume.
10. Validators must be adversarial and objective; do not use the mutating agent as its own validator.
11. Scheduled prompts must be self-contained because they may run in a fresh future context.
12. A schedule launches only the primary agent. The primary must therefore complete the scheduled job independently; companion agents are for explicit chain runs unless validation is attached through validators.
13. Prefer 1-3 agents. Never exceed 6 agents or 8 skills.
14. Do not invent unavailable tools or external services.
15. Return strict JSON only. No markdown fence, commentary, or trailing text.

JSON SCHEMA:
{
  "summary": "short architecture summary",
  "warnings": ["only real operational caveats"],
  "agents": [
    {
      "name": "${input.requestedName}",
      "primary": true,
      "content": "---\\ndisplay_name: ...\\ndescription: ...\\ntools: ...\\nprompt_mode: replace\\n---\\n\\nComplete system prompt..."
    }
  ],
  "skills": [
    {
      "name": "safe-skill-name",
      "content": "---\\nname: safe-skill-name\\ndescription: ...\\n---\\n\\nComplete reusable skill instructions..."
    }
  ],
  "schedule": null
}

When scheduling is requested, replace schedule:null with:
{
  "name": "${input.requestedName}-schedule",
  "description": "one line",
  "schedule": "cron expression, interval such as 30m/2h, one-shot +10m, or ISO timestamp",
  "prompt": "self-contained execution prompt",
  "model": "optional provider/modelId",
  "thinking": "optional level",
  "max_turns": 20,
  "isolated": false,
  "isolation": "worktree"
}`;
}
