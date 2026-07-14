---
description: Implement a bounded change after parallel evidence collection, with isolated writing and independent verification
argument-hint: "<goal>"
---

Implement this change end-to-end with Pi Agent Orchestrator: $ARGUMENTS

Execution contract:

1. Launch two read-only agents in parallel:
   - one maps the affected architecture, invariants, and exact edit surface;
   - one maps tests, compatibility risks, and release implications.
2. Synthesize their evidence into a minimal implementation plan before writing.
3. Launch one general-purpose implementation agent in an isolated worktree. Give it the approved plan, exact scope, non-goals, and validation commands.
4. Do not run parallel writers on overlapping files.
5. After implementation, independently inspect the diff and run the repository's authoritative lint, typecheck, tests, build, and package or deployment checks that apply.
6. Fix deterministic failures within scope. Report infrastructure flakes separately; do not relabel them as success.
7. Preserve dirty-worktree recovery information if commit, branch creation, or cleanup fails.

Do not merge, publish, tag, or deploy unless those actions are explicitly included in the requested goal.

Return the changed files, behavioral impact, exact validation results, remaining risks, and any follow-up that could not be completed safely.
