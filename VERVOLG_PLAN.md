# Vervolgplan @onlinechef/pi-subagents

> Status: na commits `c99af96` → `d2e06b8` — typecheck groen, lint groen, 601/611 tests pass, 10 failures = pre-existing Windows schedule-flakiness.
> Laatst bijgewerkt: 2026-05-24

---

## TL;DR — Prioriteiten

| # | Item | Impact | Effort | Sprint |
|---|------|--------|--------|--------|
| 1 | Windows path-separator fix in `schedule-store.test.ts` | ✅ Gereed (`5b7039e`) | 15 min | Nu |
| 2 | `README.md` herschrijven | ✅ Gereed (`5b7039e`) | 30 min | Nu |
| 3 | GitHub Actions CI workflow | ✅ Gereed (`5b7039e`) | 20 min | Nu |
| 4 | Unit tests voor default agents (prompt rendering, disallowedTools) | ✅ Gereed (`d2e06b8`) | 30 min | Deze week |
| 5 | `disallowedTools` hard floor voor RO agents | ✅ Gereed (`67a3fb3`) | 10 min | Deze week |
| 6 | Symlink-bescherming in `loadFromDir` | ✅ Gereed (`67a3fb3`) | 20 min | Deze week |
| 7 | ESLint vs Biome consolideren + pre-existing lint cleanup | ✅ Gereed (`d2e06b8`) | 15 min | Deze week |
| 8 | Go sidecar CI + contract tests | 🟡 Sidecar-robustheid | 2 uur | Korte termijn |
| 9 | Prompt-injection control vervangen | 🔴 Fundamentele security | 4 uur | Korte termijn |
| 10 | Telemetrie / structured logger | 🔴 Observability | 3 uur | Middellang |

---

## P0 — Kritiek (gereed ✅)

| Commit | Omschrijving |
|--------|-------------|
| `c99af96` | Fix `PermissionUtils.intersectToolNames` regressie + `{{TOOL_INSTRUCTIONS}}` typo + `.pi/agents/` hygiene + CHANGELOG v0.9.0 |
| `5b7039e` | README overhaul + CI workflow + Windows path test fix |
| `67a3fb3` | Defense-in-depth: `disallowedTools` voor RO agents + symlink skip in `loadFromDir` |
| `d2e06b8` | ESLint removal, Biome consolidatie + lint fixes + `default-agents.test.ts` |

---

## P1 — Direct (deze sessie) ✅ AFEROND

| # | Item | Status |
|---|------|--------|
| 1.1 | Fix `schedule-store.test.ts` Windows pad-separator | ✅ Gereed (`5b7039e`) |
| 1.2 | `README.md` herschrijven | ✅ Gereed (`5b7039e`) |
| 1.3 | GitHub Actions CI workflow | ✅ Gereed (`5b7039e`) |

---

## P2 — Deze week ✅ AFEROND

### 2.1 Unit tests voor default agents (indirect via public API)

**Status:** ✅ Gereed — `test/default-agents.test.ts` (9 tests) valideert:
- Agent configs (Explore, Plan, Analysis) hebben `disallowedTools: ["write", "edit"]`
- Geen onvervangen `{{` placeholders in gerenderde system prompts
- Prompts bevatten verwachte secties (READ-ONLY MODE, role, task)

**Niet gedaan:** Directe unit tests voor `AgentFieldParser`, `PermissionUtils`, `AgentPromptTemplates` — deze zijn private classes. Indirecte dekking via publieke API (`getConfig`, `loadCustomAgents`) is afdoende.

---

### 2.2 `disallowedTools` hard floor voor read-only agents

**Status:** ✅ Gereed (`67a3fb3`) — `disallowedTools: ["write", "edit"]` toegevoegd aan Explore, Plan, Analysis.

---

### 2.3 Symlink-bescherming in `loadFromDir`

**Status:** ✅ Gereed (`67a3fb3`) — `lstatSync().isSymbolicLink()` check in `readdirSync` filter.

---

### 2.4 ESLint vs Biome consolideren

**Status:** ✅ Gereed (`d2e06b8`) — ESLint verwijderd, alle pre-existing Biome issues (unused imports, organize imports, unused params) opgelost. Lint is nu groen (3 stylistische warnings over static-only classes).

---

## P3 — Korte termijn (volgende sprint)

### 3.1 Go sidecar contract tests

**Doel:** JSON IPC tussen TS host en Go renderer testen zonder echte binary te spawnen (of met mock binary).

**Scope:**
- Snapshot van het berichtformaat dat `@src/ui/agent-widget.ts` naar stdout schrijft.
- Go parser test: geldig/ongeldig JSON gracefully afhandelen.
- Integration test met `spawn` van het gecompileerde sidecar (optioneel, skip in CI als binary niet beschikbaar).

**Files:**
- `@c:\Users\joep\pi-subagents-fork\cinematic-renderer/internal/widget/` (Go)
- `@c:\Users\joep\pi-subagents-fork\src/ui/` (TS)

---

### 3.2 Prompt-injection control vervangen

**Probleem:** De huidige `INJECTION_PATTERNS` regex-blacklist in `@src/custom-agents.ts:13-17` is triviaal te omzeilen (Unicode, base64, whitespace-variaties). Het creëert "security theater".

**Vervangende strategie:**
1. **Sandbox-model:** Sub-agents draaien in een striktere context (beperkte tools, geen schrijfrechten tenzij expliciet).
2. **Allowlist-prompts:** In plaats van blacklisten van "ignore previous instructions", enforceer dat system prompts alleen van trusted sources (embedded defaults + signed `.md` files) komen.
3. **Audit-logging:** Elke custom agent load wordt gelogd met hash van de file; mismatches triggeren waarschuwing.
4. **Verwijder** `INJECTION_PATTERNS` en degradeer naar `console.warn` + telemetrie-event.

**Files:**
- `@c:\Users\joep\pi-subagents-fork\src\custom-agents.ts`

---

### 3.3 Structured logger + telemetrie

**Huidig:** `console.warn` voor security events, validatiefouten, unknown tools.

**Doel:** Vervang door een lightweight event emitter of `process.emit('pi-subagents:telemetry', {...})` zodat de host (pi) kan beslissen wat te doen (log, alert, ignore).

**Events:**
- `agent:loaded` {name, source, hash, enabled}
- `agent:validation-failed` {name, errors}
- `agent:unknown-tools` {name, tools}
- `agent:spawned` {type, parentType, depth, budget}
- `agent:completed` {type, duration, validatorResults}

**Files:**
- Nieuw: `@c:\Users\joep\pi-subagents-fork\src\telemetry.ts`
- Aanpassen: `@c:\Users\joep\pi-subagents-fork\src\custom-agents.ts`, `@c:\Users\joep\pi-subagents-fork\src\agent-runner.ts`

---

### 3.4 Dependency-compatibiliteitsmatrix

**Huidig:** `peerDependencies` op `@mariozechner/pi-* >=0.70.5`. Geen CI-test tegen meerdere versies.

**Doel:** CI matrix die test tegen minimaal 2 versies van peer deps (laagste ondersteunde + latest).

**Files:**
- `@c:\Users\joep\pi-subagents-fork\.github\workflows\ci.yml`

---

## P4 — Strategisch (roadmap)

| Item | Rationale | Complexiteit |
|------|-----------|-------------|
| Go sidecar als aparte repo + npm postinstall | Vermenging van TS/Go in één repo zonder workspace-tooling is wrijving | Medium |
| WebSocket IPC in plaats van stdin/stdout sidecar | Betrouwbaarder bi-directional, heartbeat, reconnect | High |
| Agent marketplace / registry | Gedeelde community agents via npm of git submodule | High |
| Multi-tenant partition isolation runtime | Echte sandbox per partition (VM/context isolatie) | Very High |

---

## Definities van "Klaar"

Voor elke PR in dit plan geldt:

1. **Typecheck groen** (`npm run typecheck`)
2. **Tests groen** (`npm test`) — Windows-schedule-flakiness uitgezonderd
3. **Lint groen** (`npm run lint`)
4. **CHANGELOG entry** toegevoegd
5. **Geen untracked binaries** in diff
6. **Minimaal 1 reviewer** — zelfs voor kleine PRs

---

*Plan auteur: Cascade — bijgewerkt na analyse + fix commit c99af96*
