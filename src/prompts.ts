/**
 * prompts.ts — System prompt builder for agents.
 */

import { createReadOnlyPrompt, READONLY_PROMPT_PARAMS } from "./default-agents.js";
import { buildHandoffPrompt } from "./handoff.js";
import type { PromptCompressionLevel } from "./settings.js";
import type { AgentConfig, EnvInfo } from "./types.js";

/** Extra sections to inject into the system prompt (memory, skills, etc.). */
export interface PromptExtras {
  /** Persistent memory content to inject (first 200 lines of MEMORY.md + instructions). */
  memoryBlock?: string;
  /** Preloaded skill contents to inject. */
  skillBlocks?: { name: string; content: string }[];
}

/**
 * Build the system prompt for an agent from its config.
 *
 * - "replace" mode: env header + config.systemPrompt (full control, no parent identity)
 * - "append" mode: env header + parent system prompt + sub-agent context + config.systemPrompt
 * - "append" with empty systemPrompt: pure parent clone
 *
 * Both modes prepend an `<active_agent name="${config.name}"/>` tag so downstream
 * extensions (e.g. permission/policy systems) can resolve per-agent policy
 * inside the child session by parsing the system prompt.
 *
 * @param parentSystemPrompt  The parent agent's effective system prompt (for append mode).
 * @param extras  Optional extra sections to inject (memory, preloaded skills).
 */
export function buildAgentPrompt(
  config: AgentConfig,
  cwd: string,
  env: EnvInfo,
  parentSystemPrompt?: string,
  extras?: PromptExtras,
  compressionLevel?: PromptCompressionLevel,
): string {
  const activeAgentTag = `<active_agent name="${config.name}"/>\n\n`;

  const envBlock = `# Environment
Working directory: ${cwd}
${env.isGitRepo ? `Git repository: yes\nBranch: ${env.branch}` : "Not a git repository"}
Platform: ${env.platform}`;

  // Build optional extras suffix
  const extraSections: string[] = [];
  if (extras?.memoryBlock) {
    extraSections.push(extras.memoryBlock);
  }
  if (extras?.skillBlocks?.length) {
    for (const skill of extras.skillBlocks) {
      extraSections.push(`\n# Preloaded Skill: ${skill.name}\n${skill.content}`);
    }
  }
  const extrasSuffix = extraSections.length > 0 ? `\n\n${extraSections.join("\n")}` : "";

  // Build handoff block — injected after tool description, before custom instructions
  const level = compressionLevel ?? "balanced";
  const handoffBlock = config.handoff ? `\n\n${buildHandoffPrompt(level)}` : "";

  if (config.promptMode === "append") {
    const identity = parentSystemPrompt || genericBase;

    const bridge = `<sub_agent_context>
You are operating as a sub-agent invoked to handle a specific task.
- Use the read tool instead of cat/head/tail
- Use the edit tool instead of sed/awk
- Use the write tool instead of echo/heredoc
- Use the find tool instead of bash find/ls for file search
- Use the grep tool instead of bash grep/rg for content search
- Make independent tool calls in parallel
- Use absolute file paths
- Do not use emojis
- Be concise but complete
</sub_agent_context>`;

    const customSection = config.systemPrompt?.trim()
      ? `\n\n<agent_instructions>\n${config.systemPrompt}\n</agent_instructions>`
      : "";

    return `${activeAgentTag + envBlock}\n\n<inherited_system_prompt>\n${identity}\n</inherited_system_prompt>\n\n${bridge}${handoffBlock}${customSection}${extrasSuffix}`;
  }

  // "replace" mode — env header + the config's full system prompt
  // For read-only default agents, regenerate systemPrompt at runtime with
  // the active compression level so the setting actually takes effect.
  const roParams = READONLY_PROMPT_PARAMS.get(config.name);
  const effectiveSystemPrompt = roParams && config.isDefault && level !== "balanced"
    ? createReadOnlyPrompt({ ...roParams, compressionLevel: level })
    : config.systemPrompt;

  const replaceHeader = `You are a pi coding agent sub-agent.
You have been invoked to handle a specific task autonomously.

${envBlock}`;

  return `${activeAgentTag + replaceHeader + handoffBlock}\n\n${effectiveSystemPrompt}${extrasSuffix}`;
}

/** Fallback base prompt when parent system prompt is unavailable in append mode. */
const genericBase = `# Role
You are a general-purpose coding agent for complex, multi-step tasks.
You have full access to read, write, edit files, and execute commands.
Do what has been asked; nothing more, nothing less.`;
