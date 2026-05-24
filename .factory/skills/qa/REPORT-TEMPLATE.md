## QA Report

| #   | Test Case | App | Persona | Result | Notes |
| --- | --------- | --- | ------- | ------ | ----- |

{{TEST_ROWS}}

Result values: :white_check_mark: PASS, :x: FAIL, :no_entry: BLOCKED, :warning: FLAKY, :grey_question: INCONCLUSIVE

{{#if ACTIONABLE_ITEMS}}

### Action Required

{{ACTIONABLE_ITEMS}}
{{/if}}

<details>
<summary>Screenshots & Evidence</summary>

{{EVIDENCE}}

</details>

{{#if SUGGESTED_UPDATES}}

## Suggested Skill Updates ({{UPDATE_COUNT}} issues found)

| #   | Severity        | File     | Issue               | Fix Prompt                                                                           |
| --- | --------------- | -------- | ------------------- | ------------------------------------------------------------------------------------ |
| 1   | {{SEVERITY}}   | {{FILE}} | {{DESCRIPTION}}     | <details><summary>Copy</summary><br>{{PROMPT}}</details> |

{{/if}}
