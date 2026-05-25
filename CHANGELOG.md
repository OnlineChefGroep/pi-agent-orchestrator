# Changelog

## v0.9.2 (2026-05-25)

### 🚀 New Features

#### Rich Interactive AgentDashboard
- **Vim-style hotkeys**: `j/k` navigate, `Enter` steer, `K` kill, `?` help overlay
- **Live activity indicators**: Animated spinners with 5 styles (`dots`, `pulse`, `wave`, `bar`, `clock`)
- **Multi-select + bulk operations**: `v` visual mode, bulk kill support
- **Permissions view**: `p` hotkey shows tool permissions per agent
- **Auto-refresh timer**: Configurable dashboard refresh interval

#### Swarm Mode
- **SwarmCoordinator**: Live join/leave for collaborative multi-agent swarms
- **Swarm visibility**: Real-time swarm status in dashboard with `w` hotkey
- **Dynamic coordination**: Agents can join/leave swarms at runtime

#### Settings & Configuration
- **Orchestration mode**: New setting for spawn/parallel/sequential orchestration
- **Dashboard refresh interval**: Configurable via registry settings
- **pi-subagents-helper skill**: Development helper skill for quick agent testing

### 🔧 Fixes
- **Swarm delivery logic**: Improved coordinator handoff reliability
- **Flaky Windows timing tests**: Fixed schedule test timing issues
- **CodeRabbit review comments**: Addressed code quality feedback

### 🔧 CI
- **Dependabot updates**: actions/checkout@6, setup-node@6, upload-artifact@7, super-linter@7, codeql-action@4
- **Super-linter compatibility**: Disabled conflicting prettier/standard checkers
- **CodeQL**: Disabled auto-triggers (requires GitHub Code Security)

### 📊 Metrics
- 650 tests, 36 test files (+39 tests, +2 files since v0.9.1)

---

## v0.9.1 (2026-05-24)

### 🧹 Cleanup
- **Cinematic sidecar removal**: Go binary spawning logic verwijderd uit `agent-widget.ts`; sidecar wordt niet meer gebruikt.
- **UI enhancements**: Nieuwe spinner frames (`pulse`, `wave`), tool display mappings (`glob`, `webSearch`, `webFetch`).
- **Fix animation interval**: `ANIMATION_INTERVAL` constante toegevoegd en gebruikt in `ensureTimer()`.

### 🛡 Security
- **CVE-004**: Regex-blacklist verwijderd uit `validators.ts` — was "security theater" (triviaal te omzeilen met Unicode/whitespace). Vervangen door defense-in-depth: control char removal + hard length limits + sandbox isolatie (`isolated=true`, `levelLimit=0`).
- `.npmrc` toegevoegd aan `.gitignore` (bevatte harde GitHub token).

### 🔧 CI
- **Dependency compatibiliteitsmatrix**: `os [ubuntu, windows] x node [20, 22] x peer-deps [lowest, latest]`.
- Correcte lowest peer deps install via `--no-save` (geen `package.json` mutatie).
- Windows runner met `continue-on-error` voor pre-existing schedule flakiness.

### 📊 Metrics
- 614 tests, 34 test files (+ `validators.test.ts` regressie tests voor CVE-004)

## v0.9.0 (2026-05-24)

### 🔧 Fixes
- **Fix refactor regressie in `agent-types.ts`**: `intersectToolNames` hernoemd naar `PermissionUtils.intersectToolNames` na class-refactor; herstelt alle 14 partition-filter tests.
- **Fix template typo in `default-agents.ts`**: ontbrekende sluitende `}}` in `{{TOOL_INSTRUCTIONS}}` placeholder hersteld — prompts renderen nu correct.

### 🏗 Refactor
- **Consolidatie van parsing & permissie-logica**:
  - `custom-agents.ts`: losse field-parser functies samengevoegd naar `AgentFieldParser` class.
  - `default-agents.ts`: herhalende read-only prompt-boilerplate samengevoegd naar `AgentPromptTemplates` class.
  - `agent-types.ts`: `intersectPermission` / `intersectToolNames` / `applyParentRestrictions` samengevoegd naar `PermissionUtils` class.

### 🛡 Repository hygiene
- `.pi/agents/` expliciet toegevoegd aan `.gitignore` (dev-only agents nooit meer per ongeluk tracken).
- `cinematic-renderer/cinematic-renderer.exe` toegevoegd aan `.gitignore`.
- `auditor.md` verwijderd uit git tracking (was dev-only agent).

### � Documentation
- **README.md volledig herschreven**: feature matrix, agent types tabel, custom agent frontmatter reference, cinematic dashboard docs, architecture diagram, development guide.
- **CI workflow**: GitHub Actions CI voor TypeScript (typecheck, lint, test) en Go sidecar (vet, build, test).
- **Vervolgplan**: `VERVOLG_PLAN.md` toegevoegd met prioriteitenlijst P0–P4.

### 🧹 Code cleanup
- **Lint**: ESLint verwijderd, Biome is enige linter. Alle pre-existing unused imports en organize-imports warnings opgelost.
- **Biome fixes**: unused parameters/variables in `agent-widget.ts`, `output-handler.ts`, `conversation-viewer.ts`.

### �📊 Metrics
- 611 tests, 34 test files (+ `default-agents.test.ts`)
- Typecheck: groen
- Lint: groen (3 stylistische warnings over static classes)

## v0.8.0 (2026-05-23)

### 🚀 New Features
- **Task budget + depth limiting**: Prevent runaway agent trees. Default levelLimit=5, taskBudget=unlimited. (from OpenCode)
- **Adversarial validators**: Post-completion Promise.all validation with ✅/❌ indicators in agent widget. (from Droid Factory)
- **Structured handoff protocol**: JSON machine-parseable chain-of-agents with graceful degrade on malformed JSON. (from Claude Code)
- **Hook system**: 11 lifecycle event types, 5s timeout, fail-open. Global registry via Symbol.for('pi-subagents:hooks'). (from Claude Code/OpenCode)
- **Permission inheritance**: Directional parent→child tool restriction. RO parent forces RO child. (from Claude Code)
- **Deferred context engine**: Build context at session.create boundary, saving 15-48% tokens on queued agents. (from Droid Factory)
- **Dual-phase compaction**: Prune old tool outputs + per-agent memory limits (default keep 5 turns). (from OpenCode)
- **Partitioned agent state**: Isolated tool/skill subsets per partition. No cross-contamination. (from OpenCode)
- **Context-mode-fork integration**: Optional ctx_* sandbox tool injection. New "Analysis" default agent type. (@onlinechef/context-mode peerDependency)
- **Code health**: Removed agent-registry.ts duplication. Fixed 35 pre-existing schedule test failures.

### 📊 Metrics
- 391 → 518 → 595 tests (+204, 0 failures)
- 22 → 30 → 33 test files
- 11 commits
- 4 plan review cycles (all APPROVED)

### 🧪 Test Suite Expansion (post v0.8.0)
- **E2E chain tests** (`test/e2e-chain.test.ts`): 28 tests covering budget enforcement, depth limit, validator isolation, permission inheritance, handoff parsing/graceful degrade, hooks dispatch, partition filtering, ctx_* tools, and full chain (spawn → run → validators → handoff → result)
- **Performance baseline** (`test/performance-baseline.test.ts`): 18 tests measuring spawn latency, context building, compaction reduction, deferred context timing, token estimation, batch throughput, and hook dispatch overhead
- **Backward compatibility** (`test/backward-compat.test.ts`): 31 tests verifying old AgentConfig loads, new field defaults, old-style invocation, and existing agent type integrity

## 0.7.6
- Fix: author -> OnlineChef, clean README

## 0.7.5
- Remove tintinweb URLs from package.json
- Add .npmignore for package-lock.json

## 0.7.4
- Publish @onlinechef/pi-subagents to GitHub Packages

## 0.7.3 (original)
- Forked from tintinweb/pi-subagents
