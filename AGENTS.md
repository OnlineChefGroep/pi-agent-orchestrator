# AGENTS.md — pi-agent-orchestrator

> Developer guide for the Pi agent orchestrator extension.

## Pre-context

This is a **Pi extension** that runs inside the Pi coding agent host. It orchestrates multiple autonomous sub-agents with spawn lifecycle, permission inheritance, handoff, swarm coordination, quotas, circuit breaker, and a rich TUI dashboard.

**Core principle (v2):** We are moving toward a cleaner separation between orchestration logic, model handling, and UI. The goal is maintainability + deep integration with Pi via high-quality skills.

## Key Architecture (v2 direction)

- `src/orchestration/` — AgentRunner, QuotaManager, CircuitBreaker, HandoffManager, SwarmCoordinator, ThinkingLevelManager
- `src/model/` — ModelResolver + ModelConfig (central place for model selection and fallbacks)
- `src/ui/dashboard/` — New architecture: `DashboardState`, `InputHandler`, and pure renderers
- `skills/orchestrator-master/` — The primary skill that teaches Pi how to effectively use multi-agent orchestration

## Thinking Levels

- `low` — Fast, simple tasks
- `medium` — Default for most work
- `high` — Complex analysis, architecture, difficult debugging

Always be explicit about thinking level when spawning agents. Default to `medium` unless the task clearly requires higher reasoning.

## orchestrator-master Skill

The most important way to make Pi deeply understand this extension is the `orchestrator-master` skill.

Location: `skills/orchestrator-master/SKILL.md`

This skill should be loaded automatically by Pi when the user asks for complex multi-agent work. It contains:
- When to use the orchestrator vs single agent
- Thinking level strategy
- Handoff and swarm patterns
- Quotas, circuit breaker and error handling guidance
- Concrete good/bad prompt examples

See `docs/handoff/v2-refactor/04-orchestrator-master-SKILL.md` in this repo for the full specification.

## Spawn & Configuration

**SSOT order:**
1. `src/default-agents.ts`
2. `.pi/agents/<name>.md` overrides
3. `src/custom-agents.ts` frontmatter
4. Settings (`.pi/subagent-settings.json`)

## Common Mistakes (still relevant)

- YAML booleans are strings → always use `parseBooleanWithDefault`
- Never import `@earendil-works/pi-tui` directly (use the local shim in `src/ui/tui-shim.ts`)
- Use `import type` for platform types where possible
- Map/Set preserve insertion order (important for dashboard rendering)
- Biome only (double quotes, no Prettier)

## Verification

Before committing:
```bash
npm run typecheck && npm run lint && npm test
```

Run the full suite. Performance benchmarks are important.