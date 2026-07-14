---
description: Produce an evidence-backed implementation plan with parallel discovery and one synthesis agent
argument-hint: "<goal>"
---

Create a complete implementation plan for: $ARGUMENTS

Use Pi Agent Orchestrator in two stages.

Stage 1 — parallel discovery:

- Launch one read-only Explore agent for architecture and affected code paths.
- Launch one read-only Explore agent for tests, compatibility, and release/deployment impact.
- Add a third read-only specialist only when security, data migration, or performance is materially involved.

Stage 2 — synthesis:

- Give one Plan agent a concise, deduplicated evidence digest from Stage 1.
- Require an ordered plan with exact files, symbols, interfaces, migration steps, validation commands, rollback or recovery behavior, and explicit non-goals.

Constraints:

- Do not edit files.
- Do not invent repository behavior that was not observed.
- Resolve contradictions between agents before finalizing the plan.
- Prefer the smallest coherent change over broad refactoring.
- Identify which steps can run in parallel and which must be serialized.
- End with acceptance criteria that can be mechanically verified.
