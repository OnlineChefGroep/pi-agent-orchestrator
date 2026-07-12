# Prompt compression

Prompt compression selects between three pre-written variants of a small part of an agent's system prompt. It is not semantic compression, conversation summarization, context-window compaction, or automatic rewriting of user prompts.

The project default is `balanced`.

## What changes

The effective level is resolved when a sub-agent starts:

1. `prompt_compression` in that agent's frontmatter
2. global `promptCompressionLevel`
3. `balanced`

The selected level can change:

- the read-only warning and tool-usage guidance generated for the built-in `Explore`, `Plan`, and `Analysis` agents;
- the structured handoff instructions for agents configured with `handoff: true`.

## What does not change

Prompt compression does not modify:

- the task prompt sent to the agent;
- parent conversation history or inherited context;
- the inherited parent system prompt used by append-mode agents;
- custom-agent prompt bodies;
- memory blocks, preloaded skills, context-mode instructions, or environment metadata;
- tool definitions, tool results, or model output;
- runtime conversation compaction.

For a custom agent with `handoff: false`—the default—the `prompt_compression` frontmatter setting currently has no effect on its custom prompt body. For an append-mode agent, only an enabled handoff block varies.

## Levels

| Level | Meaning | Current behavior | Recommended use |
|---|---|---|---|
| `minimal` | Minimal compression | Most verbose read-only and handoff guidance | Smaller or less instruction-reliable models; debugging instruction-following failures; rich structured handoffs |
| `balanced` | Default | Concise guidance while retaining examples and field descriptions | General use |
| `aggressive` | Maximum compression | Short read-only guidance and a minimal handoff schema | Short, low-risk tasks with strong models where small prompt savings matter more than protocol detail |

The name `minimal` refers to minimal compression, not a minimal-sized prompt.

## Current template-size comparison

The settings UI currently derives its estimates from template character counts and divides by four to display approximate tokens. Those values are useful for comparing the static variants, but they are not tokenizer measurements and must not be presented as exact model input usage.

| Component | `minimal` chars | `balanced` chars | `aggressive` chars | Aggressive reduction vs balanced |
|---|---:|---:|---:|---:|
| Handoff instructions | 2,334 | 971 | 118 | 853 chars |
| Explore read-only prompt | 1,159 | 802 | 571 | 231 chars |
| Plan read-only prompt | 1,188 | 831 | 600 | 231 chars |
| Analysis read-only prompt | 1,244 | 887 | 656 | 231 chars |

Do not add these four rows together to describe one request. A sub-agent invocation uses one agent prompt, not the prompts for all three built-in agents simultaneously. The handoff row only applies when that agent has `handoff: true`.

## Actual cost and latency impact

The operational saving is the difference in the affected system-prompt fragment for the agent that actually runs. It is usually much smaller than the percentage shown for the isolated template because the complete request can also contain inherited context, task text, memory, skills, tool schemas, previous turns, and tool results.

Actual billed tokens and latency depend on:

- the selected agent and whether handoff is enabled;
- the model tokenizer;
- prompt caching behavior;
- the number of agent turns;
- the size of inherited context, memory, skills, and tool schemas.

Treat the current character table as a static implementation comparison only. Use provider-reported `input_tokens` or the runner's usage telemetry to measure real workloads.

## Quality and safety impact

`aggressive` removes explanatory redundancy and most of the structured handoff schema. This can reduce:

- compliance with optional handoff fields such as `evidence`, `files`, and typed `artifacts`;
- reliability on smaller or weaker models;
- adherence to read-only shell behavior.

The built-in read-only agents still deny the `write` and `edit` tools, but they allow `bash`. Prompt wording therefore remains relevant: shorter guidance is not equivalent to stronger enforcement against state-changing shell commands.

`minimal` does not guarantee higher quality; it provides more explicit guidance. More text can help instruction reliability, but it can also add noise. The correct level is workload- and model-dependent.

## Recommendation

Keep `balanced` as the global default. Use per-agent overrides only after measuring a specific failure mode or a repeatable token-cost benefit:

- set `minimal` for weaker/local models, strict read-only tasks, or agents that frequently produce invalid/incomplete handoffs;
- set `aggressive` for strong models running short, well-scoped tasks where rich handoff metadata is not required;
- leave custom agents on `balanced` unless `handoff: true`, because their custom body is not compressed by this feature.

## Configuration

Global project setting in `.pi/subagents.json`:

```json
{
  "promptCompressionLevel": "balanced"
}
```

Per-agent override:

```yaml
---
prompt_compression: minimal
handoff: true
---
```
