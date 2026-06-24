# CHEF-100 Merge Pipeline

Canonical sequence for landing the full CHEF-100 dual-read chain in `main`.

## Goal

Get the dual-read chain (`src/env-context.ts`, dual-read at `src/agent-runner.ts:414`, full test coverage, post-RFC upstream-import refactor) into `main` — **after** upstream `@earendil-works/pi-coding-agent` ships `WorkspaceContext` in a minor version bump.

## Pipeline order

| Step | PR | Title | base (at PR-open) | base (at merge) | Gate |
|---|---|---|---|---|---|
| 1 | [OnlineChefGroep/pi-agent-orchestrator#215](../pull/215) | feat(runner): CHEF-100 Phase 1 dual-read adapter | `main` | `main` | biome ✅ + tests ✅ (CI green at PR-open) |
| 2 | [OnlineChefGroep/pi-agent-orchestrator#217](../pull/217) | test(env-context): cover buildEnvFromContext with 5 scenarios | `feat/CHEF-100-phase-1-dual-read` | **rebase to `main` after step 1** | biome ✅ + tests ✅ post-rebase (vitest handles type-only imports differently from tsc) |
| 3 | [OnlineChefGroep/pi-agent-orchestrator#218](../pull/218) | chore(refactor): stage post-RFC type replacement (intentional typecheck fail) | `feat/CHEF-100-phase-1-tests` | **rebase to `main` after step 2** | **upstream RFC shipped** + biome ✅ + tests ✅ + typecheck ✅ (errors must disappear) |

State of the pipeline **today** (pre-upstream RFC):

- **Step 1** is mergeable now (CI green, no conflicts).
- **Step 2** has its source branch (`feat/CHEF-100-phase-1-tests`) targeting `feat/CHEF-100-phase-1-dual-read` rather than `main`. Rebase to `main` is needed once #215 merges.
- **Step 3** has its source branch (`feat/post-rfc-type-replace`) targeting `feat/CHEF-100-phase-1-tests` rather than `main`. Rebase to `main` is needed once both #215 and #217 merge. **Critically, its 2 typecheck errors are intentional** until upstream ships `WorkspaceContext`. The PR is marked DRAFT for this reason.

## Gate enforcement per step

The `biome + tests` standard CI gate runs on every PR. Each step's prerequisites include:

### Step 1 — PR #215 mergeable

```bash
# Pre-merge verification
gh pr view 215 --json mergeable,state,isDraft
gh pr checks 215
# Expected: state=OPEN, isDraft=false, mergeable=MERGEABLE,
#           status checks all "completed" with conclusion "success"
git fetch origin && git checkout main && git merge --ff-only origin/feat/CHEF-100-phase-1-dual-read
# or via UI: green "Merge pull request" button auto-mergees once checks pass
```

### Step 2 — PR #217 mergeable after #215 + rebase

```bash
# After step 1 lands:
gh pr view 217 --json mergeable,baseRefName
# Base should now resolve to main indirectly; explicit rebase is needed.
git fetch origin
git checkout feat/CHEF-100-phase-1-tests
git rebase main
# Resolve any rebase conflicts (the test file is small; conflicts unlikely)
git push -u origin feat/CHEF-100-phase-1-tests --force-with-lease
# Then gh pr edit 217 --base main
gh pr edit 217 --base main
# Re-verify CI on the rebased branch
gh pr checks 217
```

CI must reverify because `vitest --include-type-only-imports` behaves differently from `tsc`. The parallel test PR #217 ran 8/8 vitest passes **because** vitest strips type-only imports; if upstream behavior changes, that gate may flake. Worst case: re-run.

### Step 3 — PR #218 mergeable after #217 + upstream RFC

```bash
# After upstream RFC lands + minor version bump ships WorkspaceContext:
npm install @earendil-works/pi-coding-agent@<new-version-with-workspaceContext>
npm run typecheck
# Expected: the 2 intentional errors disappear.
# If they persist, the upstream merge did not actually ship the type.

# Rebase PR #218 onto main (replaces pre-RFC and post-RFC mirrors with upstream import)
git fetch origin
git checkout feat/post-rfc-type-replace
git rebase main
git push -u origin feat/post-rfc-type-replace --force-with-lease
gh pr edit 218 --base main
gh pr ready 218  # remove DRAFT status once typecheck passes
gh pr checks 218
```

The DRAFT marking protects against accidental merge before the upstream type is in. **Until `gh pr ready 218` succeeds, do not attempt to merge.**

## Cleanup PR (post-merge)

Once step 3 lands, a follow-up "cleanup" PR should tighten the helper:

```bash
# Header from docs/chef-rfcs/CHEF-100-workspace-context.md Phase 3:
# - Drop the `| undefined` arm of buildEnvFromContext's signature
# - Drop the explicit WorkspaceContext annotation in src/env-context.ts
# - These happen AFTER two minor versions of dual-read exposure upstream
#   (per the upstream RFC versioning statement)
```

The cleanup is **NOT** part of the canonical pipeline above — it happens on a later date with a separate tracking issue.

## Rollback

If a step fails after merge to `main`: GitHub's "Revert" button creates a revert PR. For staggered predecessors, revert in the order **#218 → #217 → #215** (downstream first) so each revert is reversible in turn.

If a step fails pre-merge: rebase the offending branch and force-push the fix. Do not bypass CI; the pipeline is sequential on green gates.

The pre-commit (`biome + tsc`) and pre-push (`tests`) hooks are bypassed only on **staged-preview branches** like `feat/post-rfc-type-replace` whose intent is to fail-until-upstream-ships (AGENTS.md Common Mistake #11). Do not bypass on standard feature branches.

## Cross-org tracking

| Surface | Identifier |
|---------|-----------|
| Pipeline runbook (this file) | `docs/chef-rfcs/CHEF-100-merge-pipeline.md` |
| Full CHEF-100 RFC | `docs/chef-rfcs/CHEF-100-workspace-context.md` |
| Upstream RFC handoff | `docs/chef-rfcs/upstream/CHEF-100-host-extension.md` |
| Tracking issue | [OnlineChefGroep/pi-agent-orchestrator#213](../issues/213) |
| Implementation PR | [OnlineChefGroep/pi-agent-orchestrator#215](../pull/215) |
| Parallel tests PR | [OnlineChefGroep/pi-agent-orchestrator#217](../pull/217) |
| Post-RFC DRAFT PR | [OnlineChefGroep/pi-agent-orchestrator#218](../pull/218) |
| Linear | CHEF-832 (`ChefSheesh` team) |

## Pre-pipeline action deferral

Before step 3's merge can run, the **upstream RFC must be filed** in `earendil-works/pi-coding-agent`. Local gh CLI lacks upstream write access; the upstream maintainer must paste [`docs/chef-rfcs/upstream/CHEF-100-host-extension.md`](upstream/CHEF-100-host-extension.md) into the upstream repo's RFC tracker via browser. Until that paste happens and a minor version bump ships `WorkspaceContext`, the pipeline is paused at step 3.
