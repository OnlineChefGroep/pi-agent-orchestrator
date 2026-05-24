# Custom Agent Authoring Guide

> How to create, configure, and deploy custom sub-agents via `.pi/agents/*.md` files.

---

## Quick Start

Create `.pi/agents/my-agent.md` in your project root:

```markdown
---
name: my-agent
description: A specialized agent for reviewing TypeScript PRs
systemPrompt: |
  You are a senior TypeScript code reviewer.
  Focus on: type safety, error handling, and async patterns.
  Never suggest changes without explaining the rationale.
builtinToolNames:
  - read
  - bash
  - grep
  - find
disallowedTools:
  - write
  - edit
contextMode: true
---

# My Agent

This agent helps review TypeScript code. It has read access to the
entire codebase but cannot modify files (defense-in-depth via
disallowedTools).
```

The extension auto-discovers this file. Run `/agents` → "Agent types" to see it listed.

---

## Frontmatter Reference

All fields are declared in YAML frontmatter between `---` delimiters.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique identifier. Alphanumeric + hyphens only. Must not conflict with built-in types. |
| `description` | `string` | Short human-readable summary (shown in agent lists). |
| `systemPrompt` | `string` | The system prompt sent to the LLM. Can be multi-line using `\|` YAML syntax. |
| `builtinToolNames` | `string[]` | Tools this agent can use. See tool table below. |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `disallowedTools` | `string[]` | `[]` | Hard floor — these tools are removed even if `builtinToolNames` includes them or parent allows them. |
| `extensions` | `boolean` | `false` | Whether the agent can use extension-provided tools. |
| `contextMode` | `boolean` | `false` | Enable `ctx_read`, `ctx_write`, `ctx_bash` sandbox tools. |
| `allowedTools` | `string[]` | — | If set, restricts to this exact allowlist (advanced). |
| `model` | `string` | — | Override model (e.g. `"claude-sonnet-4-20250514"`). |
| `temperature` | `number` | — | LLM temperature override (0–1). |
| `parentType` | `string` | — | Inherit settings from another agent type. |

---

## Available Tools

### Built-in Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| `read` | Read file contents | Read |
| `write` | Write/create files | Write |
| `edit` | Edit existing files | Write |
| `bash` | Execute shell commands | Write |
| `grep` | Search file contents | Read |
| `find` | Find files by name/pattern | Read |
| `ls` | List directory contents | Read |

### Context-Mode Tools (requires `contextMode: true`)

| Tool | Description |
|------|-------------|
| `ctx_read` | Read files within sandbox directory |
| `ctx_write` | Write files within sandbox directory |
| `ctx_bash` | Execute commands within sandbox directory |

### Memory Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a fact in memory |
| `recall` | Retrieve facts from memory |

---

## Security Best Practices

### 1. Prefer `disallowedTools` over `builtinToolNames` narrowing

```yaml
# GOOD: explicit defense-in-depth
disallowedTools:
  - write
  - edit

# BAD: relies on not listing tools (can be expanded by parent or hooks)
# builtinToolNames: [read, bash]  # missing disallowedTools floor
```

### 2. Use `contextMode` for untrusted tasks

When an agent processes user-provided input or external data, enable `contextMode: true` to sandbox file access.

### 3. Avoid `extensions: true` unless necessary

Extension tools bypass some permission checks. Only enable if the agent genuinely needs them.

### 4. Validate system prompts

The loader checks for common prompt-injection patterns (e.g., "ignore previous instructions"). However, this is not foolproof — review your prompts carefully.

---

## Inheritance

### Parent Type Inheritance

Set `parentType: Explore` to inherit `builtinToolNames`, `disallowedTools`, and defaults from another agent:

```yaml
---
name: deep-explore
description: Deep codebase exploration with extra search tools
parentType: Explore
systemPrompt: |
  You are an expert at navigating large codebases.
  Always report file paths with line numbers.
---
```

This agent gets all of Explore's tools plus can override specific fields.

### Permission Inheritance

When an agent spawns a child agent:

1. Child's `builtinToolNames` is intersected with parent's resolved tools
2. Child's `disallowedTools` is merged with parent's
3. Result: child can never have more permissions than parent

Example:
- Parent: `builtinToolNames: [read, write, bash]`, `disallowedTools: []`
- Child: `builtinToolNames: [read, write, grep]`, `disallowedTools: [write]`
- Child resolved: `[read, grep]` (write removed by disallow + not in child builtins)

---

## Template Placeholders

In `systemPrompt`, you can reference built-in template sections:

| Placeholder | Replaced With |
|-------------|---------------|
| `{{TOOL_INSTRUCTIONS}}` | Detailed tool usage instructions |
| `{{READ_ONLY_WARNING}}` | CRITICAL: READ-ONLY MODE warning |

These are automatically expanded when the agent runs. You do not need to include them manually unless you want custom placement.

---

## Debugging

### Agent not appearing in `/agents` list?

1. Check the file is in `.pi/agents/*.md` (not `.pi/agents/` subdirectories)
2. Verify frontmatter has `---` at start and end
3. Check the extension logs for parse errors
4. Run `/agents` → "Reload custom agents" to force refresh

### Invalid tool name errors?

Only tools from the **Built-in Tools** and **Context-Mode Tools** tables above are valid. Check `src/agent-types.ts` for the authoritative `BUILTIN_TOOL_NAMES` list.

### System prompt not working as expected?

The loader strips the frontmatter and passes everything after the second `---` as the system prompt. Make sure there is no extra whitespace before `---`.

---

## Examples

### Read-only codebase explorer

```markdown
---
name: code-explorer
description: Explore the codebase without making changes
systemPrompt: |
  You are a codebase explorer. Read files, search, and report findings.
  Never modify files under any circumstances.
builtinToolNames:
  - read
  - grep
  - find
  - ls
disallowedTools:
  - write
  - edit
  - bash
---
```

### Sandbox data processor

```markdown
---
name: data-processor
description: Process CSV/JSON data in a sandboxed directory
systemPrompt: |
  You process data files. Only access files in the provided sandbox.
builtinToolNames:
  - read
  - ctx_read
  - ctx_write
  - ctx_bash
contextMode: true
---
```

### Child task agent (inherits from parent)

```markdown
---
name: reviewer
description: Code review specialist
description: |
  Review code changes and provide structured feedback.
  Inherits tools from the spawning agent.
parentType: general-purpose
disallowedTools:
  - write
  - edit
---
```
