---
name: qa
description: >
  Run QA tests for pi-subagents extension. Analyzes git diff to determine affected areas,
  runs configured test flows with default configurations, and generates diff-targeted tests.
  Uses unit test verification and manual functional testing through a test pi host harness.
  Use when testing PRs, releases, or smoke testing the extension.
---

# QA Orchestrator

**SCOPE: This skill performs manual/functional QA only -- verifying that the extension actually works by interacting with it as a real user would (through a test pi host harness or API calls). Do NOT run or report on CI checks, linting, ESLint, typecheck, unit tests, or any static analysis. Those are handled by separate workflows.**

## Step 1: Load Configuration

Read `.factory/skills/qa/config.yaml` for environment URLs, credentials, personas, and app definitions.

## Step 2: Determine Target Environment

Use the default_target from config unless the user specifies a different environment.

**CRITICAL: This is a local development extension package.**
- Test against the local working directory (development environment)
- No deployed environments exist for this package
- The "published" environment reference exists only to compare against the latest npm version

## Step 3: Analyze Git Diff

Run `git diff` to determine what changed. Map changed files to apps using the path_patterns in config.yaml.

Files that don't match ANY app's path_patterns (e.g., `.factory/skills/**`, `docs/**`, `.github/**`, config files) are NOT associated with any app. Do NOT run app test flows for them.

For each affected app:

- Run ONLY that app's flows from its module file
- Generate ADDITIONAL targeted tests based on the specific changes in the diff

For apps NOT affected by the diff:

- Do NOT load or run their module. Do NOT run their flows. Do NOT run their pre-flight checks. They are completely out of scope.

If NO app is affected by the diff (e.g., docs-only, CI-only, or config-only changes), report as INCONCLUSIVE: "No app code changed -- QA not applicable for this diff." Do NOT run any app flows.

## Step 4: Pre-flight Checks (app-specific only)

Run pre-flight checks ONLY for the apps that are affected by the diff.

For the `cli` app (TypeScript extension):
- Verify Node.js is available (`node --version`)
- Verify dependencies are installed (`node_modules` exists or run `npm install`)
- Verify TypeScript compiles (`npm run typecheck` passes)
- Do NOT run `npm test` -- unit tests are not part of functional QA

If a pre-flight check fails for an affected app, report it as BLOCKED with the specific error and remediation steps -- but still proceed with other affected apps.

## Step 5: Execute Diff-Relevant Flows Only

For each app that IS affected by the diff, read its sub-skill from `.factory/skills/qa-cli/SKILL.md`.

The sub-skill contains a MENU of available test flows. You must:

1. Read the diff carefully and identify which flows are relevant to the change
2. Run those flows PLUS any adjacent flows that verify the change integrates correctly
3. Do NOT run completely unrelated flows (e.g., if the diff only adds a hook type, do NOT test agent scheduling or memory compaction)
4. If no existing flow covers the change, write a NEW ad-hoc test that directly verifies the changed behavior
5. Do NOT run unit tests, lint, typecheck, or any automated test suite. This is manual/functional QA -- interact with the app as a real user would.

## Step 6: Evidence Capture

After each significant test step, capture evidence. Use **text snapshots as primary evidence** -- they render inline in the PR comment with no image hosting issues.

For CLI/Extension testing:
- Capture terminal output as text evidence (fenced code blocks)
- Capture configuration state as JSON or text
- Log warnings and errors encountered

Evidence quality rules:
- Focus on the RELEVANT content. Trim snapshots to the meaningful part.
- Label each snapshot clearly: what it shows and why it matters for the test.
- NEVER embed broken image links. If you can't verify an image URL will resolve, use text evidence instead.

## Step 7: Test Quality Gate

TEST QUALITY REQUIREMENTS:

1. CHANGE-SPECIFIC FIRST. Prioritize tests that directly verify the behavioral change in the diff. At least half your tests should be testing the new/changed feature itself.
2. INTEGRATION TESTS ARE VALID. Tests that verify the change integrates correctly with existing features are good (e.g., new hook type appears in the hook registry, agent runner handles it correctly).
3. NO UNRELATED FLOWS. Do NOT test features completely unrelated to the diff.
4. NO AUTOMATED TEST SUITES. Do NOT run vitest, npm test, or any CI-style checks. This is manual/functional QA only.
5. NEGATIVE TESTS. Include at least 1 test verifying error handling or boundary conditions related to the change.
6. INTERACTIVE TESTING. Test by actually interacting with the extension as a real user would (via the test harness).
7. INCONCLUSIVE IF UNSURE. If you cannot articulate what the PR changes, mark as INCONCLUSIVE rather than PASS.

## Step 8: Handle Failures

**Never silently skip a flow.** If a flow cannot complete, report it as BLOCKED with what was tried and how the user can fix it. Then continue to the next flow -- never abort the entire run for a single failure.

## Step 9: Generate Report

Generate the report at `./qa-results/report.md` using `.factory/skills/qa/REPORT-TEMPLATE.md`.

The report MUST follow the template in `.factory/skills/qa/REPORT-TEMPLATE.md`. Key rules:

- Start with `## QA Report` heading followed by the test results table
- Result column MUST use emojis: :white_check_mark: PASS, :x: FAIL, :no_entry: BLOCKED, :warning: FLAKY, :grey_question: INCONCLUSIVE
- Keep it CONCISE. The table + a short "Action Required" section (if any) + collapsed screenshots = the entire report.
- Do NOT include: "Behavioral Change Summary", "Blocked Flows" prose, "Info" metadata table, or verbose explanations of what the diff does. The reviewer already knows that.
- Do NOT report setup/prerequisite steps (building, startup, launching) as test rows. Those are means to an end, not test cases.
- Put ALL evidence in a single collapsed `<details>` block
- For CLI evidence: embed text snapshots as labeled fenced code blocks.

## Step 10: Suggest Skill Updates (Failure Learning)

After generating the report, check if any BLOCKED or FAIL results revealed a **testing environment insight** that would help future QA runs succeed.

**Good suggestions** (environment/workflow knowledge):
- "The test harness requires `npm run build` before spawning agents"
- "Context-mode sandbox requires @onlinechef/context-mode to be installed as a peer dependency"
- "Custom agents require `.pi/agents/` directory to exist before loading"

**Bad suggestions** (skill bugs, not environment insights -- do NOT suggest these):
- "Selector data-testid=foo doesn't exist" -- that's a skill bug, fix it directly
- "The function name changed from X to Y" -- that's expected from the PR diff

Format as a table with severity, collapsible fix prompts, and a count in the heading:

## Suggested Skill Updates (N issues found)

| #   | Severity        | File     | Issue               | Fix Prompt                                                                           |
| --- | --------------- | -------- | ------------------- | ------------------------------------------------------------------------------------ |
| 1   | <emoji> <level> | `<file>` | <short description> | <details><summary>Copy</summary><br>`<full droid prompt to fix the issue>`</details> |

**Severity levels:**
- `🔴 Breaking` -- Causes test failures every run (wrong test harness setup, missing dependency)
- `🟡 Degraded` -- Causes intermittent failures or suboptimal behavior (timing issues, Node.js version mismatches)
- `🔵 Info` -- New knowledge that improves future runs but doesn't cause failures (new configuration option, new agent type)

Since `failure_learning` is `suggest_in_report`, include the table in the PR comment report only. Do NOT write `skill-updates.json`.
