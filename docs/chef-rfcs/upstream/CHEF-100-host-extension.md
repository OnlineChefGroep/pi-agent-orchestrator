# RFC: Expose `workspaceContext` on `@earendil-works/pi-coding-agent` `ExtensionAPI`

## Filing context

- **Filed by:** OnlineChefGroep/pi-agent-orchestrator maintainers (downstream consumer)
- **Filed against:** `earendil-works/pi-coding-agent` (this repo)
- **Downstream tracking ticket:** [OnlineChefGroep/pi-agent-orchestrator#213](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/213) (`CHEF-100: expose workspaceContext on ExtensionAPI and delete src/env.ts`)
- **Downstream tracking PR:** [OnlineChefGroep/pi-agent-orchestrator#214](https://github.com/OnlineChefGroep/pi-agent-orchestrator/pull/214) (branch `chore/CHEF-100-workspace-context-rfc`)
- **Linear mirror:** `CHEF-832` in the `ChefSheesh` team

## Summary

Extensions that today shell out to `git` (recomputing cwd, git-repo state, current branch) and read `process.platform` directly are duplicating state the host already knows. We propose exposing a single synchronous `workspaceContext` field on `ExtensionAPI` (or `ExtensionContext`) so downstream consumers can drop their own `git` shell-outs from the spawn hot path.

In our case (pi-agent-orchestrator), this eliminates **0-10s of sequential `pi.exec("git", ...)` shell-out per subagent spawn**, dominated by two 5000ms timeouts. The pattern generalises to other extensions that detect workspace context at spawn time.

## Proposed TypeScript shape

```ts
// In @earendil-works/pi-coding-agent
export interface WorkspaceContext {
  /** Host current working directory at extension load / cwd-change events. */
  readonly cwd: string;

  /**
   * Discriminated git state. `isRepo: false` is the only correct shape when
   * the cwd is not inside a git worktree or `.git` cannot be read.
   */
  readonly git:
    | { readonly isRepo: true; readonly branch: string }
    | { readonly isRepo: false };

  /** Matches `process.platform` on the host. */
  readonly platform: NodeJS.Platform;
}

export interface ExtensionAPI {
  // ... existing surface
  readonly workspaceContext: WorkspaceContext;
}
```

### Why this shape

- **Discriminated union** for `git`: today's consumer pattern uses `isGitRepo: boolean + branch: string` where `branch: ""` is a sentinel for both "not a repo" AND "detached HEAD". The discriminated union makes these cases distinct at the type level and lets consumers handle them without re-checking sentinels.
- **`NodeJS.Platform`** (not bare `string`): consumers actually branch on platform (e.g., skip Windows-only commands on darwin), so the enum is the right level of fidelity.
- **All fields `readonly`**: this is pure host state, not consumer-mutable.

## Behavior

- **`cwd`**: reflects the host's working directory. Updates live when the host's cwd changes (e.g., session switching).
- **`git`**: computed at host startup; recomputed on cwd change. Cheap to read repeatedly. (See Q3 — caching strategy.)
- **`branch`**: current branch name, or `""` on detached HEAD. Submodules: returns the worktree's branch, not the parent.
- **`platform`**: stable for the host process lifetime; matches `process.platform` for extensions that want to cross-check.

## Acceptance criteria (for `@earendil-works/pi-coding-agent`)

- `WorkspaceContext` exposed on `ExtensionAPI` (or `ExtensionContext` per Q1 below).
- `cwd` reflects host CWD live + on cwd-change events.
- `git.isRepo` returns `true` inside any git worktree, including submodules.
- `git.branch` returns the current branch name, or `""` on detached HEAD.
- `platform` matches `process.platform` on the host.
- Values are recomputed on cwd change / session-init events, **not** per extension call.

## Out of scope (re: this RFC)

These are downstream consumers' concerns; not blocking for the host API design:

- Reformatting any existing prompt block in extensions.
- Touching extensions' worktree-isolation paths.
- Exposing `process.env`, `os.userInfo()`, `node` version, or other env fields not in this RFC.

## Open questions (for host maintainers)

1. **Where does it live in the API surface?** `ExtensionAPI` (synchronous, eager) or `ExtensionContext` (per-session, possibly different per subagent session)? Downstream preference: `ExtensionAPI` for synchronous access from the spawn hot path.
2. **Additional git fields?** Should `git` expose `remoteUrl`, `HEAD` SHA, `isDirty`? Default: **no**: add only when a consumer needs them. Today's downstream needs are `isRepo + branch` (and `branch` as `""` on detached HEAD).
3. **Caching strategy.** Event-driven (recompute on cwd change) or lazy (recompute per extension call)? Default: **event-driven**, with `cwd`-change events invalidating the cache. This matches existing host patterns (`ctx.cwd` is recomputed on session init).
4. **Observability.** Should mutations be observable via `subscribe(() => WorkspaceContext)`? Default: **no**: document the host's update cadence instead. Subagents don't currently observe env changes; if they ever need to, a separate `change` signal would be a cleaner API surface.
5. **Worktree integration.** When an extension spawns a subagent in an isolated git worktree, does `workspaceContext.cwd` reflect the worktree path or the host cwd? Default: **worktree path**, since subagents should see the worktree's git state, not the parent's.

## Alternatives considered (downstream context)

- **Keep `pi.exec("git", ...)` long-term**: rejected. Per-extension maintenance burden + ongoing per-spawn latency tax.
- **Extensions read `process.cwd()` / `process.platform` directly**: rejected. Bypasses the host's extension sandbox and breaks the extension-state model. The host is the SSOT.

## Downstream impact (informational only)

If this RFC ships, downstream consumers can:

- Drop their own git shell-outs (in our case, eliminating `pi.exec("git", ...)` from the agent spawn hot path; reclaims 0-10s per spawn).
- Defer env detection to host lifetime (cached on cwd change vs per-call).
- Type-check env access: the discriminated union prevents the common bug where `branch: ""` is misinterpreted.

Downstream consumers would gate on a peer-dep bump once `workspaceContext` is available. **Recommendation: ship behind a minor version bump so consumers can feature-detect via TypeScript** and dual-read for at least one minor version before consumers migrate. This protects extensions in the wild from breakage.

## Cross-org tracking

| Surface | Identifier |
|---------|-----------|
| GitHub (downstream ticket) | [OnlineChefGroep/pi-agent-orchestrator#213](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues/213) |
| GitHub (downstream PR) | [OnlineChefGroep/pi-agent-orchestrator#214](https://github.com/OnlineChefGroep/pi-agent-orchestrator/pull/214) |
| Linear | `CHEF-832` (`ChefSheesh` team) |
| Downstream RFC doc (full) | `docs/chef-rfcs/CHEF-100-workspace-context.md` in `OnlineChefGroep/pi-agent-orchestrator` |

— Filed by OnlineChefGroep/pi-agent-orchestrator maintainers, May 2026.
