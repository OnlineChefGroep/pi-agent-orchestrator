# Session Handoff — OSS Release Readiness (v0.10.2)

**Date:** 2026-06-13  
**Package:** `@onlinechefgroep/pi-agent-orchestrator@0.10.2`  
**Canonical destination:** https://github.com/OnlineChefGroep/pi-agent-orchestrator (private org)  
**Work pushed to (pick up here):** https://github.com/OnlineChef/pi-agent-orchestrator

---

## Workflow

```
Cloud agent  →  pushed branch to OnlineChef/pi-agent-orchestrator
Local session  →  fetch from OnlineChef, verify, merge to OnlineChefGroep
```

Cloud agent **cannot** push to `OnlineChefGroep` (private org, no token access).  
All work lives on **`OnlineChef`** until local session imports it.

---

## Pick up (local session — start here)

```bash
# 1. Clone/fetch work from OnlineChef (staging remote)
git clone https://github.com/OnlineChef/pi-agent-orchestrator.git
cd pi-agent-orchestrator
git fetch origin cursor/oss-release-readiness-6990
git checkout cursor/oss-release-readiness-6990

# 2. Verify
npm install
npm run typecheck && npm run lint && npm test

# 3. Read this file
cat HANDOFF.md
```

**Branch:** `cursor/oss-release-readiness-6990`  
**PR (staging):** https://github.com/OnlineChef/pi-agent-orchestrator/pull/1  
**Latest commit:** `ec981a2` (includes this HANDOFF)

---

## Push to OnlineChefGroep (local session — next step)

```bash
gh auth login   # account with OnlineChefGroep org access

gh repo clone OnlineChefGroep/pi-agent-orchestrator ../pi-agent-orchestrator-org
cd ../pi-agent-orchestrator-org

git remote add staging https://github.com/OnlineChef/pi-agent-orchestrator.git
git fetch staging cursor/oss-release-readiness-6990

# Review diff against org main
git log --oneline main..staging/cursor/oss-release-readiness-6990
git diff main...staging/cursor/oss-release-readiness-6990 --stat

# Import
git checkout -b cursor/oss-release-readiness-6990
git merge staging/cursor/oss-release-readiness-6990

npm run typecheck && npm run lint && npm test

git push -u origin cursor/oss-release-readiness-6990
gh pr create --base main --title "chore: open-source release readiness (v0.10.2)" \
  --body "Imported from OnlineChef staging branch. See HANDOFF.md."
```

After merge to org `main`:
- Close staging PR: https://github.com/OnlineChef/pi-agent-orchestrator/pull/1
- Tag `v0.10.2` → triggers `publish.yml` → GitHub Packages

---

## Current state

| Item | Value |
|------|-------|
| Branch | `cursor/oss-release-readiness-6990` |
| Commits ahead of `main` | 8 |
| Diff | 30 files (incl. HANDOFF.md) |
| Verification | typecheck ✅ lint ✅ test ✅ (795/795) build ✅ |
| Staging remote | `OnlineChef/pi-agent-orchestrator` ← **source of truth until org merge** |
| Destination | `OnlineChefGroep/pi-agent-orchestrator` (private) |

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
ec981a2 docs: add session handoff for OnlineChefGroep repo import
```

---

## What changed (summary)

### Removed (keep removed)
- `docs/SECURITY_AUDIT_REPORT.md`, `docs/SECURITY_AUDIT_VERIFICATION_2026-05-23.md`
- `docs/REVIEW_AND_FUTURE.md`
- `.Jules/orchestra.md`, `.jules/overdrive.md`

### Added
- `SECURITY.md`, `CODE_OF_CONDUCT.md`, `HANDOFF.md`
- `.github/ISSUE_TEMPLATE/*`, `PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`
- `docs/repository.md`

### Fixed
- README settings table + defaults (`maxConcurrent=4`, `graceTurns=5`, `defaultJoinMode=smart`)
- `docs/api-reference.md`, `docs/architecture.md` synced to code
- `package.json` author `OnlineChefGroep`, engines `>=22.19.0`, lockfile `0.10.2`
- `publish.yml` pre-publish gate; `codeql.yml` manual-only (no Code Security on org)
- `schedule.ts` logger + error emit

### Do not touch
- `docs/images/*` — originals restored, no replacements

---

## Open items for local session

| P | Task |
|---|------|
| P0 | Merge branch from OnlineChef → OnlineChefGroep, open PR there |
| P1 | Close staging PR on OnlineChef after org merge |
| P2 | Tag `v0.10.2` and publish to GitHub Packages |

---

## Pitfalls

1. Don't push to `OnlineChefGroep` from cloud — no access.
2. Don't replace `docs/images/*`.
3. README defaults must match code: `agent-manager.ts` (4), `agent-runner.ts` (5), `agent-registry.ts` (smart/auto/premium/braille/750ms).
4. `package.json` metadata already points to `OnlineChefGroep/pi-agent-orchestrator` — that's correct for the org repo.
