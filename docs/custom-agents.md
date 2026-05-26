# Custom Agent Authoring Guide

> How to create, configure, and deploy custom sub-agents via `.pi/agents/*.md` files.

---

## Quick Start

Create `.pi/agents/typescript-reviewer.md` in your project root:

```markdown
---
display_name: "TypeScript Reviewer"
description: "Read-only reviewer for TypeScript changes"
tools: read, grep, find, ls, bash
disallowed_tools: write, edit
extensions: false
skills: true
max_turns: 20
prompt_mode: replace
---
You are a senior TypeScript code reviewer.

Focus on type safety, error handling, async control flow, and maintainability.
Report findings with severity, exact file paths, and actionable fixes.
Never modify files.
```

The file name is the agent type. In the example above, spawn it as `typescript-reviewer`.

Project agents are loaded from `.pi/agents/*.md`. Global agents are loaded from `$PI_CODING_AGENT_DIR/agents/*.md` or `~/.pi/agent/agents/*.md`. Project agents override global agents with the same file name.

---

## File Format

Custom agents use Markdown files with optional YAML frontmatter. The Markdown body after the closing `---` is the system prompt.

```markdown
---
description: "Short description shown in menus"
tools: read, grep, find
---
System prompt starts here.
```

Only files directly under the agents directory are loaded. Subdirectories are ignored. Symlinks are skipped.

---

## Frontmatter Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `display_name` | string | file name | Human-readable label shown in UIs. |
| `description` | string | file name | Short description shown in agent lists. |
| `tools` | CSV or `none` | all built-in tools | Built-in tools the agent can use. |
| `disallowed_tools` | CSV | none | Hard floor; these tools are removed even if otherwise available. |
| `extensions` | boolean, CSV, or `none` | `true` | Extension tool access. Use `false`/`none` for no extension tools. |
| `skills` | boolean, CSV, or `none` | `true` | Skill access or preload list. |
| `model` | string | host default | Model override, resolved by the host model registry. |
| `thinking` | string | none | Thinking level hint, passed through to the host. |
| `max_turns` | number | default setting | Maximum conversation turns. `0` means unlimited. |
| `prompt_mode` | `replace` or `append` | `replace` | Whether the body replaces or appends to the inherited prompt. |
| `inherit_context` | boolean | caller decides | Default for whether to inherit parent conversation context. |
| `run_in_background` | boolean | caller decides | Default for background execution. |
| `isolated` | boolean | caller decides | Default for isolated execution. |
| `memory` | `user`, `project`, or `local` | none | Persistent memory scope. |
| `isolation` | `worktree` | none | Run file edits in a temporary git worktree. |
| `enabled` | boolean | `true` | Set `false` to hide/disable the agent. |

Unsupported fields are ignored. The current loader does not read `name`, `systemPrompt`, `builtinToolNames`, `disallowedTools`, `validators`, or `handoff` frontmatter fields.

---

## Tool Values

Built-in tool names:

| Tool | Purpose |
|------|---------|
| `read` | Read file contents. |
| `write` | Create or overwrite files. |
| `edit` | Edit existing files. |
| `bash` | Execute shell commands. |
| `grep` | Search file contents. |
| `find` | Find files by name or pattern. |
| `ls` | List directories. |

Use CSV values:

```yaml
tools: read, grep, find, ls
disallowed_tools: write, edit
```

Use `tools: none` for a prompt-only agent.

---

## Security Practices

### Prefer Explicit Disallows

For read-only agents, set both an allowlist and a disallow floor:

```yaml
tools: read, grep, find, ls, bash
disallowed_tools: write, edit
```

### Disable Extension Tools Unless Needed

```yaml
extensions: false
```

Extension tools can expand the available surface area. Keep them disabled for narrow reviewer, planner, and explorer agents.

### Use Worktree Isolation For File-Editing Agents

```yaml
tools: read, write, edit, grep, find, ls, bash
isolation: worktree
```

Worktree isolation keeps parallel edits out of the main working tree until they are intentionally integrated.

### Avoid Built-In Wildcard Overrides

Custom agents may override built-in names by file name, but validation disables attempts to override a built-in agent with wildcard tools.

---

## Prompt Modes

### `replace`

The agent receives the custom prompt body as its role instructions. This is the safest default for specialized agents.

```yaml
prompt_mode: replace
```

### `append`

The custom prompt body is appended to the inherited prompt. Use this only when the agent should remain a variant of the parent behavior.

```yaml
prompt_mode: append
```

---

## Examples

Canonical examples live under `examples/agents/`:

| Example | Purpose |
|---------|---------|
| `adversarial-validator.md` | Read-only security review agent. |
| `handoff-chain-researcher.md` | Research agent that ends with structured handoff JSON. |
| `handoff-chain-implementer.md` | Worktree-isolated implementation agent for handoff follow-up. |
| `scheduled-explorer.md` | Read-only scheduled codebase scan agent. |
| `worktree-isolated-editor.md` | File-editing agent configured for worktree isolation. |

Copy an example into `.pi/agents/` to activate it in a project.

---

## Troubleshooting

### Agent Does Not Appear

Check that:

- The file extension is `.md`.
- The file is directly under `.pi/agents/`.
- Frontmatter starts and ends with `---`.
- `enabled` is not `false`.
- The file is not a symlink.

### Agent Has Too Many Tools

Remember that `tools` defaults to all built-in tools. For read-only agents, set `tools` explicitly and add `disallowed_tools`.

### Agent Prompt Looks Wrong

The body of the Markdown file is the system prompt. Do not put the prompt in a `systemPrompt` frontmatter field; that field is ignored by the current loader.
