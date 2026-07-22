# Pi TypeScript Review Checklist

Use this for implementation reviews, release-readiness passes, and regression sweeps.

## Scope and architecture

- [ ] The change is classified as extension shell, SDK host, pure core, TUI, or package surface.
- [ ] Pure domain logic remains independent of Pi runtime imports where practical.
- [ ] Repository-local `AGENTS.md`, package versions, and adjacent patterns were followed.
- [ ] No unrelated API migration or refactor was bundled into the change.

## TypeScript and ESM

- [ ] `strict` remains enabled; no compiler weakening was introduced.
- [ ] Relative imports use explicit `.js` specifiers.
- [ ] Type-only imports use `import type` or inline `type` modifiers.
- [ ] No incomplete object is forced through with `as any`.
- [ ] Discriminated unions and switches are exhaustive where state variants matter.
- [ ] Untrusted JSON, config, frontmatter, messages, and persisted state are parsed before use.

## Pi host compatibility

- [ ] Installed Pi package versions were identified.
- [ ] Pi host packages remain peer dependencies, with dev dependencies only as needed for build/tests.
- [ ] No internal or undocumented Pi import was added without a documented necessity.
- [ ] Required host APIs are not hidden behind inappropriate feature detection.
- [ ] Optional peers are gated explicitly and degrade safely.
- [ ] Exactly one TypeBox family is used and it matches the host ABI.

## Tool contract

- [ ] Tool name and argument shape preserve compatibility or include a migration adapter.
- [ ] TypeBox schema is explicit and fields affecting behavior have useful descriptions.
- [ ] Tool description states preconditions, side effects, failure cases, and output limits.
- [ ] `promptGuidelines` name the concrete tool.
- [ ] Expected domain failures return typed results instead of throwing.
- [ ] Unexpected failures preserve the useful cause without leaking excessive internals.
- [ ] `AbortSignal` reaches the actual I/O, subprocess, or model operation.
- [ ] User-visible latency emits bounded progress updates where useful.
- [ ] Result `content` is concise and `details` carries structured state/render data.
- [ ] Output is truncated appropriately and omission is disclosed.

## Concurrency and mutation

- [ ] File mutations queue the full read-modify-write window using the resolved target path.
- [ ] Shared non-file state has locking, transactions, or another explicit serialization strategy.
- [ ] Retries are idempotent and cannot duplicate mutations.
- [ ] Parallel tool calls cannot overwrite each other's updates silently.
- [ ] Writer agents do not overlap on the same file set without deliberate serialization.

## AgentSession lifecycle

- [ ] Every delegated session receives its explicit effective cwd and agent directory.
- [ ] Worktree-local settings and resources resolve from that cwd.
- [ ] Each subagent owns an independent session and bounded resources.
- [ ] Steering, follow-up, and abort semantics are used correctly.
- [ ] Prompt calls during streaming specify the queueing behavior.
- [ ] Parent cancellation reaches child sessions and active tool processes.
- [ ] Event subscriptions are installed before evidence-producing actions and removed during cleanup.
- [ ] Runtime session replacement refreshes references, bindings, and subscriptions.
- [ ] Every session, timer, watcher, lock, subprocess, and span has one cleanup owner.
- [ ] Compaction behavior is connected to the live Pi session; no dead shadow configuration was added.

## Persistence and settings

- [ ] The canonical persistence location is used.
- [ ] Persisted data has schema validation and a version or migration strategy when necessary.
- [ ] Defaults preserve older data and missing fields.
- [ ] Branch-aware session state reconstructs correctly from the active branch.
- [ ] Settings writes are flushed at durability boundaries and I/O errors are surfaced.
- [ ] New settings are wired through interface, defaults, validation, UI/snapshot, tests, and docs.

## TUI

- [ ] ANSI-aware width, wrapping, padding, and truncation helpers are used.
- [ ] Glyph widths and animation frames are stable.
- [ ] Rendering is deterministic across rerenders.
- [ ] Narrow and wide layouts are covered, including 60/80/100/140 columns where relevant.
- [ ] Keybinding hints use configured Pi keybinding helpers.
- [ ] Render functions do not mutate orchestration state.
- [ ] Partial/progress and final render states are both tested.

## Tests and evidence

- [ ] Tests live in the repository's canonical test location and use its framework.
- [ ] Complete typed fixtures are used.
- [ ] The accepted path is covered.
- [ ] At least one invalid, rejected, cancelled, compatibility, or cleanup path is covered.
- [ ] Concurrency-sensitive code has a deterministic race/serialization test.
- [ ] TUI changes have width and deterministic-render tests.
- [ ] Performance claims use assertions with explicit thresholds.
- [ ] Targeted tests pass before the full gate.

## Agent Orchestra authoritative gate

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run verify:package
```

For release or cloud-environment changes, also run the relevant release-policy and Cursor Cloud verification commands.

## Completion report

The final report states:

- exact files and symbols changed;
- the host/version assumptions used;
- commands and test results;
- compatibility or migration behavior;
- deliberate exclusions;
- remaining risks or blocked actions.
