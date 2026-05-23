# Vervolgplan @onlinechef/pi-subagents

> Status: na commit `c99af96` — typecheck groen, 593/602 tests pass, 9 failures = pre-existing Windows schedule-flakiness.
> Laatst bijgewerkt: 2026-05-24

---

## TL;DR — Prioriteiten

| # | Item | Impact | Effort | Sprint |
|---|------|--------|--------|--------|
| 1 | Windows path-separator fix in `schedule-store.test.ts` | 🟢 Groen CI op Windows | 15 min | Nu |
| 2 | `README.md` herschrijven | 🟢 Gebruikersadoptie | 30 min | Nu |
| 3 | GitHub Actions CI workflow | 🟢 Blijvende kwaliteit | 20 min | Nu |
| 4 | Unit tests voor refactored classes | 🟢 Regressie-vertrouwen | 45 min | Deze week |
| 5 | `disallowedTools` hard floor voor RO agents | 🟡 Defense-in-depth | 10 min | Deze week |
| 6 | Symlink-bescherming in `loadFromDir` | 🟡 Security-hardening | 20 min | Deze week |
| 7 | ESLint vs Biome consolideren | 🟡 Onderhoud | 15 min | Deze week |
| 8 | Go sidecar CI + contract tests | 🟡 Sidecar-robustheid | 2 uur | Korte termijn |
| 9 | Prompt-injection control vervangen | 🔴 Fundamentele security | 4 uur | Korte termijn |
| 10 | Telemetrie / structured logger | 🔴 Observability | 3 uur | Middellang |

---

## P0 — Kritiek (gereed ✅)

| Commit | Omschrijving |
|--------|-------------|
| `c99af96` | Fix `PermissionUtils.intersectToolNames` regressie + `{{TOOL_INSTRUCTIONS}}` typo + `.pi/agents/` hygiene + CHANGELOG v0.9.0 |

---

## P1 — Direct (deze sessie)

### 1.1 Fix `schedule-store.test.ts` Windows pad-separator

**Probleem:** `@test/schedule-store.test.ts:45` asserteert hardcoded forward slashes:

```ts
expect(p).toBe("/repo/.pi/subagent-schedules/abc123.json");
```

Op Windows geeft `join()` backslashes (`\repo\.pi\subagent-schedules\abc123.json`).

**Fix:** Gebruik `path.posix.join` in de test, of assert met `expect(p).toMatch(/\.pi.subagent-schedules.abc123\.json$/)`.

**Files:**
- `@c:\Users\joep\pi-subagents-fork\test\schedule-store.test.ts:43-46`

---

### 1.2 `README.md` herschrijven

**Huidig:** 14 regels, geen feature-overzicht, geen voorbeelden, geen agent-types tabel.

**Doel:** Professionele, complete README met:

1. **Hero-sectie**: wat doet het, één install-commando.
2. **Feature-matrix** met badges:
   - Autonome sub-agents (spawn → run → handoff)
   - Task budget + depth limiting
   - Adversarial validators
   - Structured handoff protocol
   - Hook system (11 lifecycle events)
   - Permission inheritance (parent → child)
   - Partitioned agent state
   - Deferred context engine (15-48% token besparing)
   - Dual-phase compaction
   - Context-mode sandbox (`ctx_*` tools)
   - Cinematic dashboard (Go TUI sidecar)
3. **Agent Types tabel**:
   | Type | Beschrijving | Tools | Context-mode |
   |------|-------------|-------|-------------|
   | `general-purpose` | Alleskunner | alle | opt-in |
   | `Explore` | Read-only codebase verkenner | read, bash, grep, find, ls | nee |
   | `Plan` | Architect + planning | read, bash, grep, find, ls | nee |
   | `Analysis` | Data-analyse + sandbox | read, bash, grep, find, ls | ja |
4. **Configuratievoorbeeld** `.pi/agents/my-agent.md` met frontmatter.
5. **Cinematic sidecar** korte uitleg + build-instructie.
6. **Licentie + auteur**.

**Files:**
- `@c:\Users\joep\pi-subagents-fork\README.md`

---

### 1.3 GitHub Actions CI workflow

**Nieuw bestand:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  ts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
  go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      - run: cd cinematic-renderer && go vet ./... && go build ./... && go test ./...
```

**Files:**
- Nieuw: `@c:\Users\joep\pi-subagents-fork\.github\workflows\ci.yml`

---

## P2 — Deze week

### 2.1 Unit tests voor refactored classes

**AgentFieldParser** (`@src/custom-agents.ts:157-193`):
- `string()` met string, number, undefined, null
- `nonNegativeInt()` met -1, 0, 5, NaN, string
- `csvList()` met undefined, "none", "a, b", defaults
- `csvListOptional()` met undefined, "none", "a, b"
- `memory()` met "user", "project", "local", "invalid", undefined
- `inheritField()` met true, false, "none", "a,b", undefined, null

**PermissionUtils** (`@src/agent-types.ts:186-228`):
- `intersectPermission()` matrix: (false/true/[]/['a']) × (false/true/[]/['a'])
- `intersectToolNames()` empty, disjoint, overlap, subset, superset
- `applyParentRestrictions()` met en zonder `parentConfig`

**AgentPromptTemplates** (`@src/default-agents.ts:14-70`):
- `createReadOnlyPrompt()` — snapshot van output, geen `{{` placeholders
- Edge case: `toolInstructions` undefined maar `additionalSections` gezet
- Edge case: alle params empty → minimale output

**Nieuw testbestand:** `@c:\Users\joep\pi-subagents-fork\test\agent-field-parser.test.ts`
**Nieuw testbestand:** `@c:\Users\joep\pi-subagents-fork\test\permission-utils.test.ts`
**Uitbreiden:** `@c:\Users\joep\pi-subagents-fork\test\agent-types.test.ts`

---

### 2.2 `disallowedTools` hard floor voor read-only agents

**Probleem:** `Explore`, `Plan`, `Analysis` vertrouwen op `builtinToolNames` zonder `disallowedTools`. Hooks of user-overrides kunnen `write`/`edit` terugbrengen via `extensions: true`.

**Fix:** Voeg `disallowedTools: ["write", "edit"]` toe aan de 3 RO defaults in `@src/default-agents.ts`.

**Files:**
- `@c:\Users\joep\pi-subagents-fork\src\default-agents.ts`

---

### 2.3 Symlink-bescherming in `loadFromDir`

**Probleem:** `@src/custom-agents.ts:96-150` doet `existsSync` + `readdirSync` zonder symlink-check. Een symlink in `.pi/agents/` naar buiten de repo wordt gevolgd.

**Fix:** Na `readFileSync` doen we `realpath` en verifiëren dat het resolved pad binnen de originele `dir` ligt (of we negeren symlinks met `lstatSync().isSymbolicLink()` op directory-level).

**Files:**
- `@c:\Users\joep\pi-subagents-fork\src\custom-agents.ts:96-150`

---

### 2.4 ESLint vs Biome consolideren

**Situatie:** Beide configs actief:
- `@biome.json` — gebruikt in `npm run lint` (`biome check src/ test/`)
- `@eslint.config.js` — niet gebruikt in scripts, wel als dependency

**Aanbeveling:** Behoud Biome (sneller, één tool, formatter + linter). Verwijder ESLint deps en config.

**Files:**
- Verwijder: `@c:\Users\joep\pi-subagents-fork\eslint.config.js`
- Aanpassen: `@c:\Users\joep\pi-subagents-fork\package.json` devDependencies → verwijder `@eslint/js`, `eslint`, `globals`, `typescript-eslint`

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
