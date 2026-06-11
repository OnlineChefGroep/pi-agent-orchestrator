---
id: linear-issue-labeler
trigger: /linear-issue-labeler
purpose: Keep recently changed Linear issues labeled according to the team's current taxonomy.
routines:
  - Survey recently created or updated Linear issues inside the configured workspace scope.
  - Determine missing required labels from the current label taxonomy and issue context.
  - Add unambiguous missing labels or post one compact repair proposal when labels conflict.
deny:
  - Do not apply deprecated labels.
  - Do not auto-remove reserved/system labels or labels applied by humans.
  - Do not change issue status, priority, assignee, project, cycle, estimate, due date, or body.
  - Do not guess between two plausible labels in the same required label family.
  - Do not repeat the same repair proposal for an unchanged conflict.
schedule: '0 */4 * * *'
---

# Issue Label Hygiene Helper

## Label taxonomy

Read `references/label-taxonomy.md` before deciding labels.

If the taxonomy is missing, stale, contradictory, or does not mention a required label family, no-op and ask for taxonomy clarification.

## Scope

Default scope:

- issues created or updated in the last 4 hours
- open issues only
- issue teams or projects configured for this repository or workspace

Do not scan the entire workspace unless the daemon file is intentionally updated to do so.

## Auto-add and removal policy

- Auto-add families: `type`, `area`, `language`
- Human-owned family: `effort` (never auto-apply)
- Removal policy: add-only by default
- Replacement exception: replace bot-managed labels only within mutually-exclusive families when confidence is high
- Never auto-remove reserved/system labels or human-applied labels

## Decision policy

Add a missing label when:

- the label family is required by the taxonomy and included in the auto-add families
- exactly one label in that family is supported by issue evidence
- the label is current, not deprecated
- applying it does not conflict with existing labels

When a mutually-exclusive family already has a bot-managed label, replacement is allowed only when evidence strongly supports a different label in that same family.

Post a repair proposal instead of mutating when:

- multiple labels in one family could apply
- replacement would require removing a human-applied or reserved/system label
- an issue has deprecated labels
- existing labels conflict with the taxonomy
- the issue body or title does not provide enough context

## Repair proposal format

Use one concise issue comment:

```md
Label repair needed

Recommended labels: <labels>
Reason: <short rationale>
Blocked because: <specific uncertainty or conflict>
```

## Limits

- Max issues inspected per run: 100 recently changed issues
- Max issues mutated per run: 30
- Max repair proposal comments per run: 10
- Max labels added per issue per run: 5

## Idempotency

Never add duplicate labels. Re-running with unchanged issue data must produce no additional writes.

Use a conflict signature based on issue ID, current label set, title/body hash, and taxonomy version. Do not repeat the same repair proposal while that signature is unchanged.

## No-op when

- the label taxonomy cannot be read
- the taxonomy does not define required label families
- Linear issue data is incomplete
- no recently changed in-scope issues need labels
- the correct label cannot be selected with high confidence
