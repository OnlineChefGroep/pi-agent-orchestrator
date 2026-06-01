---
id: pr-check-repair
purpose: Repair failing checks on non-draft pull requests by diagnosing the triggering check, pushing evidence-grounded fixes, and commenting only when action or human attention is needed.
watch:
  - A GitHub check run, check suite, or commit status from GitHub or an integrated provider reports a non-successful result on the current head of a non-draft pull request, including failure, error, timed_out, cancelled, or action required.
routines:
  - Diagnose the triggering failing check using check logs, provider data, local reproduction, repo context, PR diff, and clear PR intent.
  - Push a focused evidence-grounded fix to the PR branch when the correct repo change is clear.
  - Coordinate with concurrent `pr-check-repair` activations before editing and before pushing.
  - Rerun a clearly flaky check when flake evidence is strong and no repo change is needed.
deny:
  - Do not refresh PR branches from base or resolve merge conflicts; use base only as read-only evidence when branch staleness affects the failing check.
  - Do not fix unrelated failing checks; assume each other failing check has its own `pr-check-repair` activation.
  - Do not make product, security, dependency, external-environment, production-data, backfill, or data-shape decisions solely to make checks pass.
  - Do not change external provider configuration, CI project settings, or secrets outside the repository.
  - Do not push speculative changes when the failure cause or intended fix is unclear.
  - Do not manually rerun checks after pushing a commit; rely on the push to trigger checks naturally.
  - Do not edit or act outside the triggering repo, PR, head SHA, and failing check.
  - Do not open new pull requests or new issues.
  - Do not submit PR reviews, approve, or request changes on pull requests.
  - Do not force-push.
---

# PR Check Repair

## Repository CI context

This repository uses Node.js 25.9.0 and TypeScript 6.0. CI runs Biome lint (`npm run lint`), vitest tests (`npm test`), and TypeScript compilation (`npm run build`). Workflow files: `ci.yml`, `linter.yml`, `codeql.yml`, `qa.yml` in `.github/workflows/`. The org also has a reusable `workflow_call` CI in the `.github` repository.

## Triggering-check scope policy

Handle only the triggering failing check. If another failing check shares the same root cause, fix that root cause only when necessary for the triggering check. If another human or `pr-check-repair` activation already fixed the same root cause, stop/no-op without commenting unless human action is still needed.

Expect parallel `pr-check-repair` activations for other failing checks. When overlap is plausible, refresh and inspect the current remote PR head before editing or pushing. When tools expose task status or transcripts, also inspect active/recent daemon activity.

## Repair decision policy

Fix and push when the triggering check is current, the cause is clear from available evidence, the fix does not require a product/security/infrastructure/dependency/data judgment call, and the commit can be pushed without overwriting concurrent work.

Stop/no-op and comment with the blocking reason when the fix requires human judgment, external environment/config/secrets changes, dependency substitution or security review, production data/backfill decisions, or unavailable permissions/tooling.

## Repair categories

| Category                                                                                                    | Posture                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TypeScript type errors (tsc / `npm run build`)                                                              | Fix type errors, config mismatches, or generated typing drift, then push.                             |
| Biome lint failures (`npm run lint`)                                                                        | Apply the narrowest lint/format fix and push.                                                         |
| Vitest failures (`npm test`)                                                                                | Fix clear regressions and push. For known flakes (`schedule.test.ts`, `schedule-store.test.ts`), rerun first or apply the narrowest stabilizing fix. |
| Super-Linter / linter.yml failures                                                                          | Fix failing lint/doc/style checks scoped to reported files, then push.                                |
| CI/workflow syntax errors introduced by the PR                                                              | Fix and push.                                                                                         |
| Flaky checks with strong flake evidence outside known flaky tests                                           | Rerun once when no repo change is needed, or push the narrowest stabilizing fix when one is clear.    |
| Ambiguous product intent, conflicting requirements, or unclear PR direction                                 | Stop/no-op; comment if human action is needed.                                                        |
| Secrets, provider config, CI project settings, or external service failures outside the repo               | Stop/no-op; comment if human action is needed.                                                        |
| Dependency replacement or vulnerability/security choices                                                    | Stop/no-op; comment if human action is needed.                                                        |
| Production data migrations, backfills, or data-shape decisions                                              | Stop/no-op; comment if human action is needed.                                                        |

## Known flaky tests

- `schedule.test.ts` and `schedule-store.test.ts` are known flaky candidates.
- Prefer a rerun first when these are the only failing tests.
- If stabilization is required, keep the change minimal and directly tied to the observed flake.

## Branch and concurrency safety

- Re-fetch and verify the current remote PR head before starting edits.
- Re-fetch and verify the current remote PR head again before push.
- If remote PR head moved, re-evaluate before continuing. Continue after compatible human/daemon pushes, but never overwrite them.
- If branch staleness is the only failure cause, stop/no-op because branch refresh is outside `pr-check-repair` scope.
- If staleness is ambiguous, compare against current base when available. If base already fixes the issue and the PR branch is merely stale, do not push a repair commit.

## Comment policy

Comment only after a pushed fix, flaky rerun, or blocked state requiring human action. Include the triggering check, action taken or blocking reason, commit pushed or rerun performed, and next human action when blocked.

Do not comment for routine no-ops: stale triggers, checks already fixed, duplicate activations, another human/daemon already fixing the same root cause, or failures clearly owned by another daemon.
