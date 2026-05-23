/**
 * default-agents.ts — Embedded default agent configurations.
 *
 * These are always available but can be overridden by user .md files with the same name.
 */

import type { AgentConfig } from "./types.js";

const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];

/**
 * Template system for agent prompts to reduce duplication.
 */
class AgentPromptTemplates {
  private static readonly READ_ONLY_WARNING = `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are {{ROLE}}.
Your role is EXCLUSIVELY to {{TASK}}.
You do NOT have access to file editing tools.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state`;

  private static readonly TOOL_USAGE = `# Tool Usage
- Use the find tool for file pattern matching (NOT the bash find command)
- Use the grep tool for content search (NOT bash grep/rg command)
- Use the read tool for reading files (NOT bash cat/head/tail)
- Use Bash ONLY for read-only operations
{{TOOL_INSTRUCTIONS}}`;

  private static readonly OUTPUT_FORMAT = `# Output
{{OUTPUT_INSTRUCTIONS}}`;

  /**
   * Generate a read-only prompt with custom role, task, and instructions.
   */
  static createReadOnlyPrompt(params: {
    role: string;
    task: string;
    toolInstructions?: string;
    outputInstructions?: string;
    additionalSections?: string[];
  }): string {
    const sections = [
      this.READ_ONLY_WARNING.replace('{{ROLE}}', params.role)
        .replace('{{TASK}}', params.task),
    ];

    if (params.toolInstructions || params.additionalSections) {
      sections.push(this.TOOL_USAGE
        .replace('{{TOOL_INSTRUCTIONS}}', params.toolInstructions || ""));
    }

    if (params.outputInstructions) {
      sections.push(this.OUTPUT_FORMAT
        .replace('{{OUTPUT_INSTRUCTIONS}}', params.outputInstructions));
    }

    if (params.additionalSections) {
      sections.push(...params.additionalSections);
    }

    return sections.join("\n\n");
  }
}

export const DEFAULT_AGENTS: Map<string, AgentConfig> = new Map([
  [
    "general-purpose",
    {
      name: "general-purpose",
      displayName: "Agent",
      description: "General-purpose agent for complex, multi-step tasks",
      // builtinToolNames omitted — means "all available tools" (resolved at lookup time)
      // inheritContext / runInBackground / isolated omitted — strategy fields, callers decide per-call.
      // Setting them to false would lock callsite intent (see resolveAgentInvocationConfig in invocation-config.ts).
      extensions: true,
      skills: true,
      systemPrompt: "",
      promptMode: "append",
      isDefault: true,
    },
  ],
  [
    "Explore",
    {
      name: "Explore",
      displayName: "Explore",
      description: "Fast codebase exploration agent (read-only)",
      builtinToolNames: READ_ONLY_TOOLS,
      disallowedTools: ["write", "edit"],
      extensions: true,
      skills: true,
      model: "anthropic/claude-haiku-4-5",
      systemPrompt: AgentPromptTemplates.createReadOnlyPrompt({
        role: "a file search specialist. You excel at thoroughly navigating and exploring codebases",
        task: "search and analyze existing code",
        toolInstructions: "Use Bash ONLY for read-only operations: ls, git status, git log, git diff, find, cat, head, tail.\n- Make independent tool calls in parallel for efficiency\n- Adapt search approach based on thoroughness level specified",
        outputInstructions: "- Use absolute file paths in all references\n- Report findings as regular messages\n- Do not use emojis\n- Be thorough and precise",
      }),
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "Plan",
    {
      name: "Plan",
      displayName: "Plan",
      description: "Software architect for implementation planning (read-only)",
      builtinToolNames: READ_ONLY_TOOLS,
      disallowedTools: ["write", "edit"],
      extensions: true,
      skills: true,
      systemPrompt: AgentPromptTemplates.createReadOnlyPrompt({
        role: "a software architect and planning specialist",
        task: "explore the codebase and design implementation plans",
        outputInstructions: "- Use absolute file paths\n- Do not use emojis",
        additionalSections: [
          `# Planning Process
1. Understand requirements
2. Explore thoroughly (read files, find patterns, understand architecture)
3. Design solution based on your assigned perspective
4. Detail the plan with step-by-step implementation strategy

# Requirements
- Consider trade-offs and architectural decisions
- Identify dependencies and sequencing
- Anticipate potential challenges
- Follow existing patterns where appropriate

# Output Format
End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- /absolute/path/to/file.ts - [Brief reason]`
        ]
      }),
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "Analysis",
    {
      name: "Analysis",
      displayName: "Analysis",
      description: "Data analysis sub-agent with sandboxed code execution",
      builtinToolNames: READ_ONLY_TOOLS,
      disallowedTools: ["write", "edit"],
      extensions: false,
      skills: false,
      model: "anthropic/claude-sonnet-4-5-20250901",
      systemPrompt: AgentPromptTemplates.createReadOnlyPrompt({
        role: "a data analysis specialist with sandboxed code execution capabilities",
        task: "analyze data, run computations, and produce insightful results",
        toolInstructions: "Prefer ctx_execute over manual computation — never do data processing in your own context window.\n- Use ctx_search to discover prior context before duplicating work.",
        outputInstructions: "- Present analysis results clearly with data, charts where helpful, and actionable insights.\n- Use absolute file paths in all references.\n- Do not use emojis.\n- Be thorough and precise.",
        additionalSections: [
          `# Core Workflow
1. Use ctx_search to find prior context and indexed results before beginning work.
2. Use ctx_execute for sandboxed code analysis — supports JavaScript, TypeScript, Python, Go, Rust, Shell, and 9+ other languages.
3. Use ctx_execute_file to load large files into the sandbox without flooding context.
4. Use ctx_index to persist important results for future ctx_search retrieval.
5. Use ctx_batch_execute for multi-step analysis pipelines with auto-indexing.
6. Use ctx_stats to monitor your token and cost usage.`
        ]
      }),
      promptMode: "replace",
      inheritContext: true,
      isDefault: true,
      useContextMode: true,
    },
  ],
]);
