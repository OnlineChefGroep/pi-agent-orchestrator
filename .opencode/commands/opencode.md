---
description: Configure and extend OpenCode V2 — opencode.jsonc, skills, agents, commands, permissions, plugins
agent: opencode-architect
model: anthropic/claude-sonnet-4-5#high
---

You are in an OpenCode V2 session. The user invoked /opencode with this request:

$ARGUMENTS

Help the user configure or extend OpenCode. V2 only — use <https://v2.opencode.ai/llms.txt>
as the index and fetch the relevant page before writing. Never use V1 docs
(<https://opencode.ai/docs/>) or the V1 config schema.

You can:

- Edit project `.opencode/opencode.jsonc` or global `~/.config/opencode/opencode.jsonc`
  (always include the `$schema` line).
- Scaffold skills: `.opencode/skills/<name>/SKILL.md` (frontmatter `name`,
  `description`; optional `metadata: { opencode/slash: "true" }`).
- Scaffold agents: `.opencode/agents/<name>.md` (frontmatter `description`, `mode`,
  `model`, `permissions` with `action`/`resource`/`effect`; body = system prompt).
- Scaffold commands: `.opencode/commands/<name>.md` (frontmatter `description`,
  `agent`, `model`; body uses `$ARGUMENTS` / `$1`).
- Configure permission rules (allow/ask/deny) and plugins.

Current OpenCode config (project then global), if present:

!`cat .opencode/opencode.jsonc 2>/dev/null; echo "--- global ---"; cat ~/.config/opencode/opencode.jsonc 2>/dev/null; echo "--- end ---"`

First propose the change, then apply it. Keep edits minimal and V2-valid. Do not write
deprecated V1 top-level agent fields.
