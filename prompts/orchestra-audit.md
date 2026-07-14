---
description: Run a parallel, evidence-first repository audit without editing files
argument-hint: "[scope]"
---

Audit ${1:-the current repository} with Pi Agent Orchestrator.

Use exactly three read-only agents in parallel with non-overlapping scopes:

1. Architecture and maintainability: map entry points, boundaries, coupling, long methods, duplicated logic, and broken abstractions.
2. Correctness and security: find concrete bugs, unsafe assumptions, permission failures, injection/path issues, concurrency hazards, and recovery gaps.
3. Tests and release readiness: inspect coverage, CI, packaging, compatibility, documentation drift, release automation, and rollback behavior.

Requirements:

- Do not edit files.
- Every finding must include exact file paths and relevant symbols or line evidence.
- Distinguish confirmed defects from hypotheses.
- Deduplicate overlapping findings before presenting them.
- Rank the final findings by severity and expected impact.
- Include the smallest reliable verification step for every high-severity finding.
- End with a scoped implementation sequence, but do not start implementation.
