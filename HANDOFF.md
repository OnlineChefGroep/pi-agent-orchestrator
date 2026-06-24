# Session Handoff — Open-Source Release (v0.15.0)

**Date:** 2026-06-24  
**Package:** `@onlinechefgroep/pi-agent-orchestrator@0.15.0`  
**Canonical destination:** https://github.com/OnlineChefGroep/pi-agent-orchestrator (public repo)

---

## Workflow

The repo is public — direct push, PR, and CI are available from any authenticated context.

---

## Quick start

```bash
git clone https://github.com/OnlineChefGroep/pi-agent-orchestrator.git
cd pi-agent-orchestrator
npm install
npm run typecheck && npm run lint && npm test
```

---

## Release

```bash
git tag v0.15.0
git push origin v0.15.0
```

Tag push triggers:
- `publish-npm.yml` → npmjs.org (public)
- `publish.yml` → GitHub Packages (mirror)

---

## Current state

| Item | Value |
|------|-------|
| Version | 0.15.0 |
| Verification | typecheck ✅ lint ✅ test ✅ (1667/1667) |
| Registry | npmjs.org + GitHub Packages |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## Open items

| P | Task |
|---|------|
| ✅ | Repo public gezet |
| ✅ | Versie consistentie (0.15.0) |
| ✅ | Test counts geüpdatet (1667/93) |
| P0 | Tag `v0.15.0` en publish naar npmjs.org + GitHub Packages |

---

## Pitfalls

1. `package.json` metadata moet naar `OnlineChefGroep/pi-agent-orchestrator` wijzen.
2. README defaults moeten matchen met code: `agent-manager.ts` (4), `agent-runner.ts` (5).
3. Biocheck: geen Prettier of ESLint — alleen Biome.
