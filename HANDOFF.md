# Session Handoff — OSS Release Readiness (v0.10.2)

**Date:** 2026-06-13  
**Canonical repo:** https://github.com/OnlineChefGroep/pi-agent-orchestrator (private, org)  
**Package:** `@onlinechefgroep/pi-agent-orchestrator@0.10.2`

---

## Goal

First public open-source release readiness: repo hygiene, accurate docs, community files, CI hardening, full test pass. No breaking runtime changes intended.

---

## Current state

| Item | Value |
|------|-------|
| **Branch** | `cursor/oss-release-readiness-6990` |
| **Commits ahead of `main`** | 7 |
| **Diff** | 29 files, +516 / −1628 lines |
| **Verification** | `typecheck` ✅ `lint` ✅ `test` ✅ (795/795) `build` ✅ |
| **Where branch is pushed** | `OnlineChef/pi-agent-orchestrator` (wrong host — cloud agent has no org access) |
| **Where it must land** | `OnlineChefGroep/pi-agent-orchestrator` (private) |
| **Stray PR** | https://github.com/OnlineChef/pi-agent-orchestrator/pull/1 — close after merge to org repo |

### Cloud agent limitation

The Cursor cloud-agent `gh` token is **not** a member of `OnlineChefGroep`. It cannot see or push to the private org repo (`404` / `Repository not found`). All pushes from cloud landed on `OnlineChef/pi-agent-orchestrator` via remote `onlinechef`.

---

## Commits (oldest → newest)

```
a6ece84 chore: remove internal/confidential docs and fix repo hygiene
0e02d55 chore: align package metadata and changelog for release
f1564ca docs: polish public release documentation and community files
7720f91 fix: harden publish workflow and schedule error handling
d1866be docs: add branding assets, OnlineChefGroep naming guide, enable CodeQL
20af886 docs: canonical repo is OnlineChefGroep/pi-agent-orchestrator only
3c32ebc fix: restore original docs images and correct README defaults
```

---

## What changed (summary)

### Removed (must stay removed)
- `docs/SECURITY_AUDIT_REPORT.md` — CONFIDENTIAL, fabricated CVE refs
- `docs/SECURITY_AUDIT_VERIFICATION_2026-05-23.md` — same
- `docs/REVIEW_AND_FUTURE.md` — internal AI session notes
- `.Jules/orchestra.md`, `.jules/overdrive.md` — internal notes, case collision

### Added
- `SECURITY.md`, `CODE_OF_CONDUCT.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`
- `docs/repository.md` — canonical naming + npm registry notes

### Fixed docs (were wrong on `main`)
- **README:** settings table matches `SubagentsSettings`; agent tools `read, grep`; live CI badge; `/hooks` command; `SECURITY.md` link
- **README defaults (verified in code):** `maxConcurrent=4`, `graceTurns=5`, `defaultJoinMode=smart`, `orchestrationMode=auto`, `dashboardRefreshInterval=750`
- **api-reference.md:** removed phantom APIs (`registerCommands`, `createSubagent`, `registerHook`); correct `JoinMode`, `AgentRecord.status`, signatures
- **architecture.md:** correct entry point, data flow, file overview

### Packaging
- `package.json`: `author: OnlineChefGroep`, `engines.node: >=22.19.0`, `publishConfig.access: public`
- `package-lock.json`: synced to `0.10.2`
- `LICENSE`: copyright `OnlineChefGroep`
- `CHANGELOG.md`: v0.10.2 entry; Dutch historical entries translated

### CI / code
- `publish.yml`: checkout/setup-node v6, npm cache, pre-publish typecheck/lint/test
- `codeql.yml`: re-enabled on push/PR + weekly schedule (`javascript-typescript`)
- `schedule.ts`: `console.warn` → `logger.warn`; one-shot cron errors emitted instead of swallowed
- `.codex/hooks.json`: portable `graphify hook-check` (was `C:\Users\joep\...`)
- `dependabot.yml`: removed spurious `pip` ecosystem

### Images
- **Do not replace** — originals from upstream `main` were restored in `3c32ebc`. AI-generated replacements were reverted.

---

## Import into OnlineChefGroep (run locally with org access)

```bash
gh auth login   # account with OnlineChefGroep org access

gh repo clone OnlineChefGroep/pi-agent-orchestrator
cd pi-agent-orchestrator

git remote add onlinechef https://github.com/OnlineChef/pi-agent-orchestrator.git
git fetch onlinechef cursor/oss-release-readiness-6990

# Review before merge
git log --oneline main..onlinechef/cursor/oss-release-readiness-6990
git diff main...onlinechef/cursor/oss-release-readiness-6990 --stat

# Merge (or cherry-pick the 7 commits if main diverged)
git checkout -b cursor/oss-release-readiness-6990
git merge onlinechef/cursor/oss-release-readiness-6990

npm run typecheck && npm run lint && npm test

git push -u origin cursor/oss-release-readiness-6990
gh pr create --base main --head cursor/oss-release-readiness-6990 \
  --title "chore: open-source release readiness (v0.10.2)" \
  --body "See HANDOFF.md for full context."
```

After merge to org `main`:
- Close https://github.com/OnlineChef/pi-agent-orchestrator/pull/1
- Optionally archive/delete public `OnlineChef/pi-agent-orchestrator` mirror
- Enable [Code Security](https://github.com/OnlineChefGroep/pi-agent-orchestrator/settings/security_analysis) if CodeQL should pass
- Tag `v0.10.2` to trigger `publish.yml` → GitHub Packages

---

## Remaining / open items

| Priority | Item |
|----------|------|
| P0 | Merge branch into **OnlineChefGroep** private repo (cloud agent cannot push) |
| P1 | Close stray PR on `OnlineChef/pi-agent-orchestrator` |
| P1 | Enable GitHub Code Security for CodeQL (or accept workflow failure) |
| P2 | Decide npmjs.org dual-publish vs GitHub Packages only — see `docs/repository.md` |
| P2 | Grant cloud-agent/org-app `contents:write` if future cloud sessions should push directly |

---

## Verification commands

```bash
npm run typecheck && npm run lint && npm test
npm run build
```

---

## Key files to review in PR

```
README.md
SECURITY.md
CHANGELOG.md
package.json
docs/api-reference.md
docs/architecture.md
.github/workflows/publish.yml
.github/workflows/codeql.yml
src/schedule.ts
```

---

## Agent mistakes to avoid next session

1. Do **not** push assuming `OnlineChefGroep` is reachable from cloud — verify `gh repo view OnlineChefGroep/pi-agent-orchestrator` first.
2. Do **not** replace `docs/images/*` — originals already exist on `main`.
3. Do **not** add transfer/deprecated-OnlineChef narrative — canonical URL is always `OnlineChefGroep/pi-agent-orchestrator`.
4. README setting defaults must match: `agent-manager.ts` (`maxConcurrent=4`), `agent-runner.ts` (`graceTurns=5`), `agent-registry.ts` (`defaultJoinMode=smart`, `orchestrationMode=auto`, `uiStyle=premium`, `animationStyle=braille`, `dashboardRefreshInterval=750`).
