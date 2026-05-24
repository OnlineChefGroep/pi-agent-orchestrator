# pi-subagents Extension — Analysis, Review & Future

**Date:** 2026 (current branch: `chore/adopt-pr-workflow`)  
**Focus:** Strictly the `@onlinechef/pi-subagents` pi-extension itself. No scope creep into the broader pi host, Grok skills, or unrelated systems.  
**Branch context:** All work performed on a dedicated feature branch in PR form per CONTRIBUTING.md (conventional commits, pre-commit checks).

---

## 1. What This Extension Is (Condensed "How & What")

`@onlinechef/pi-subagents` is a **pi extension** that brings Claude Code-style autonomous sub-agents to the pi coding agent platform.

### Core Value
- Spawn specialized agents (`Explore`, `Plan`, `Analysis`, `general-purpose`, or custom `.md` agents) that run independently or in the foreground.
- Strong **permission inheritance** (directional parent→child restrictions + partition filtering + hard disallow floor).
- **Background execution** with smart grouping, nudges, steering, and full transcript capture to output files.
- **Structured handoff protocol** (machine-parseable JSON chains).
- Adversarial **validators** (sandboxed post-completion judges).
- **Scheduling** (cron/interval/one-shot, session-scoped).
- **Worktree isolation** for safe parallel file modifications.
- Optional high-fidelity **cinematic TUI sidecar** (separate Go package).
- Defensive security posture after multiple audit remediation cycles (limits + allowlists everywhere, no "security theater" regex blacklists).

It plugs into the host exclusively via the `ExtensionAPI` (tool registration, events, session management, message rendering). The entry point is `src/index.ts` (the extension function + the massive `Agent` tool implementation).

**Key architectural pillars** (see `docs/architecture.md` for the original diagram):
- `AgentRegistry` + `custom-agents.ts` / `default-agents.ts`
- `AgentManager` + `agent-runner.ts` (the execution heart)
- `agent-types.ts` (the permission model — arguably the most critical module)
- `handoff.ts`, `validators.ts`, `hooks.ts`, `compaction.ts`, `context.ts`
- `schedule.ts` + `schedule-store.ts`
- `group-join.ts` + batching logic in `index.ts` (the subtle UX for parallel background work)
- `worktree.ts` (git worktree + sanitized commits)
- UI: `ui/agent-widget.ts`, optional cinematic sidecar via peer package
- Cross-extension discovery via `globalThis` Symbols + `cross-extension-rpc.ts`

**Test investment is high**: 34 dedicated test files covering the hard parts (handoff, validators, partitioned state, deferred context, e2e chains, schedules, worktrees, hooks, etc.). ~593–602 tests, with known pre-existing Windows flakiness only in schedule-related tests.

---

## 2. Code Review Findings

### Strengths (Excellent)
- **Mature defensive engineering** — Dozens of "CVE-XXX FIX" comments show real remediation work using hard limits, allowlists, control-character stripping, safe JSON parsers with depth/size/count caps, symlink rejection, etc.
- No `TODO`/`FIXME`/`HACK` comments left in `src/` — the codebase is deliberately kept clean.
- Sophisticated async orchestration for background agents (debounce batching, `GroupJoinManager`, `resultConsumed` flags, straggler handling) that delivers a genuinely good UX.
- Strong separation between concerns once you look past the large `index.ts`.
- Excellent test coverage of the complex parts (deferred context, handoff parsing, partition filtering, validators, worktree lifecycle).
- Settings system is clear (project overrides global, schema-level feature gating for scheduling to avoid LLM context cost).
- The new custom agent I added (`.pi/agents/pi-subagents-extension-reviewer.md`) is a perfect self-hosting example of the extension's own custom agent feature.

### Issues & Debt (Categorized)

**🟡 Medium**
- **Documentation drift**: `docs/architecture.md` file overview table is incomplete. Missing modules that are now first-class: `group-join.ts`, `invocation-config.ts`, `output-file.ts`, `prompts.ts`, `skill-loader.ts`, `telemetry.ts`, `env.ts`. The original diagram is still mostly accurate but not exhaustive.
- **VERVOLG_PLAN.md is missing** from the tree, yet heavily referenced from the (now deprecated) security audit documents. This creates documentation debt.
- The 1,500+ line `src/index.ts` is a "god module" for orchestration, widget wiring, batch logic, nudge scheduling, and tool registration. It works, but increases cognitive load for reviewers.

**🟢 Low / Observations**
- Windows schedule flakiness is documented and tolerated in CI (`continue-on-error`), but the root cause (temp directory races in `ScheduleStore`) is not mitigated at source. Acceptable for now, but worth a targeted fix.
- Cross-extension discovery via `globalThis[Symbol.for("pi-subagents:...")]` is powerful for the ecosystem but is "magic" and lightly documented.
- The batch + group + nudge + `resultConsumed` state machine is subtle and spread across a few files. A small state diagram or more comments would help future maintainers.

**No critical (🔴) or high (🟠) issues found** in the current tree during this review. The post-audit remediation work appears to have been effective.

---

## 3. Security & Maintainability Audit Summary

The legacy `SECURITY_AUDIT_REPORT.md` (2025) and its verification (2026) contain **fabricated CVE numbers** and are explicitly marked deprecated. They should not be used for planning.

**Positive reality**:
- The codebase shows consistent application of the lessons from that exercise: size/depth/count limits on all untrusted inputs (JSON handoffs, schedules, validator criteria, agent configs, commit messages), allowlists instead of blacklists, control character stripping, strict validation in `custom-agents.ts`, sandboxing of validators (`isolated=true`, `levelLimit=0`, `skipValidators=true`).
- `execFileSync` usage is isolated to `worktree.ts`, always uses the safe array form + explicit timeouts + restricted `cwd`, and the CVE-001 commit message sanitization is present and reasonable.
- No regex-blacklist "security theater" remains.

**Remaining recommendation**: When the real `VERVOLG_PLAN.md` (P3 security items) is restored/created, the items should be tracked as normal GitHub issues or a living document rather than a one-off report.

---

## 4. Custom Subagent Created for Ongoing Work on This Extension

As part of this analysis I directly created (scoped only to this extension):

**`.pi/agents/pi-subagents-extension-reviewer.md`**

A strict, deeply specialized reviewer agent whose system prompt encodes:
- Exact knowledge of the permission model, EXCLUDED_TOOL_NAMES, partition filtering
- The async batch/group/nudge complexities
- All historical remediation patterns ("CVE FIX" style)
- Requirements for architecture alignment, testability, and self-consistency

This is both a **practical tool for future work on the extension** and a living demonstration of the custom agent feature. It can (and should) be iterated on as the codebase evolves.

---

## 5. Opportunities & Future Features (Strictly for This Extension)

All items below are scoped exclusively to improving the subagent system, its orchestration, permission model, scheduling, handoff/validators, UI, and custom agent experience.

### High-Value, Relatively Low-Risk
1. **Ship canonical example agents** — Add 4–6 high-quality `.pi/agents/` examples that demonstrate the extension's unique capabilities (handoff chains, adversarial validators + criteria, scheduled recurring explorer, worktree-isolated editor, context-mode + Analysis agent, steering + resume pattern). This dramatically increases discoverability and "wow" factor.
2. **Improve architecture documentation** — Update `docs/architecture.md` with the missing modules and a small state diagram for the batch/group/nudge lifecycle. Keep it as the single source of truth.
3. **Windows schedule reliability** — Targeted improvement to `ScheduleStore` temp directory handling and test isolation so the `continue-on-error` workaround is no longer needed.
4. **Public typed API surface** — Formalize (and document) the cross-extension contracts currently hidden behind Symbols and events. This makes the extension a better platform citizen.

### Medium-Term / Higher Impact
5. **Handoff protocol v2** — Add optional typed artifacts / file references to the `AgentHandoff` interface and renderer. Enables richer multi-agent workflows without losing backward compatibility.
6. **Agent execution tree visualization/export** — A `/agents tree` command or tool that renders (or exports as Mermaid/JSON) the full parent→child execution graph with token/turn counts. Extremely valuable for complex orchestrations.
7. **First-class "Agent Templates"** — Beyond raw `.md` files, support a small registry of versioned, updatable templates that users can instantiate and customize. Could live alongside or inside the custom agent loader.
8. **Cost & token estimation mode** — A dry-run flag on the `Agent` tool that estimates (via the host model registry) token usage before launching expensive background trees.
9. **Cinematic sidecar robustness** — Version handshake, auto-restart, and graceful degradation improvements between the TypeScript widget and the optional Go TUI package.

### Nice-to-Have / Future Exploration (Only If Demand Exists)
- OpenTelemetry span export for the full agent lifecycle (builds on existing `telemetry.ts`).
- Validator composition / chaining (multiple validators with different criteria, voting, etc.).
- "Steer from widget" or richer live conversation controls in the TUI.
- Per-agent persistent memory UI/inspection commands.

**Explicitly out of scope for this extension (per user request)**: Anything related to the broader pi host, other pi packages, Grok skills system, Azure, general agent frameworks, etc.

---

## 6. Recommendations & Next Steps (PR Form)

1. **This branch (`chore/adopt-pr-workflow`)** already contains:
   - The new canonical reviewer agent (`.pi/agents/pi-subagents-extension-reviewer.md`)
   - This review document (`docs/REVIEW_AND_FUTURE.md`)

2. **Immediate follow-up PRs** (small, focused, conventional commits):
   - `docs: complete architecture.md module table and add batch/group state notes`
   - `feat: ship 4–5 canonical example agents under .pi/agents/`
   - `fix: harden ScheduleStore temp handling on Windows (reduce flakiness)`
   - `chore: add living VERVOLG_PLAN.md (or link to GitHub project) replacing legacy audit references`

3. **Process**: Continue all future work on dedicated branches, run full `npm run typecheck && npm run lint && npm test` (Windows schedule tolerance excepted), then open PR with reference to items in this document or future VERVOLG_PLAN entries.

4. **Self-review tool**: The newly added `pi-subagents-extension-reviewer` agent should be used (when working inside a pi session with this extension loaded) for all non-trivial changes going forward.

---

## Appendix: Key Files for Future Reviewers

- Permission model: `src/agent-types.ts`
- Execution core: `src/agent-runner.ts`, `src/agent-manager.ts`
- The big orchestrator: `src/index.ts` (especially batching 525–579 and tool registration)
- Handoff & safety: `src/handoff.ts`, `src/validators.ts`
- Scheduling: `src/schedule*.ts`
- Isolation: `src/worktree.ts`
- Custom agents: `src/custom-agents.ts`
- New self-review agent: `.pi/agents/pi-subagents-extension-reviewer.md`

---

*This document was produced as part of the initial analysis on the PR branch. It is intended to be a living reference that future PRs can reference or update.*