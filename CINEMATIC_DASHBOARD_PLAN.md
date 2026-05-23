# Cinematic Dashboard — Volledig Implementatieplan

## Status: Draft PR met review-fixes — klaar voor gefaseerde implementatie

---

## Fase 0: Review-fixes (DONE)

Alle 12 gevonden code-review issues zijn opgelost in commit `056cafb`:

| # | Fix | File |
|---|-----|------|
| 1 | Duplicate `this.uiCtx = ctx` | `src/ui/agent-widget.ts` |
| 2 | IPC payload mismatch (display flags per-agent → top-level) | `src/ui/agent-widget.ts` |
| 3 | Go `bufio.Scanner` per-call race bug | `cinematic-renderer/main.go` |
| 4 | Platform-aware binary path (`.exe` op Windows) | `src/ui/agent-widget.ts` |
| 5 | Sidecar stdio `inherit` → `pipe` | `src/ui/agent-widget.ts` |
| 6 | `UiStyle` type alias hersteld | `src/agent-registry.ts` |
| 7 | Settings tests: 6 ontbrekende applier fields + nieuwe tests | `test/settings.test.ts` |
| 8 | `.gitignore` voor Go binaries | `.gitignore` |
| 9 | `go.mod` replace directive uitgecommenteerd + TODO | `cinematic-renderer/go.mod` |
| 10 | Onverwante `MIN_INTERVAL` revert | `src/schedule.ts` |
| 11 | Implicit `any` getypt | `src/ui/agent-widget.ts` |
| 12 | Sanitizer + round-trip tests cinematic settings | `test/settings.test.ts` |

---

## Fase 1: Go Dependency Publiceren

**Probleem:** `bubbletea-cinematic` is een lokale dependency met `replace => ../../` — werkt nergens behalve author's machine.

**Oplossing:**
1. Vendor `bubbletea-cinematic/widget` package direct in `cinematic-renderer/internal/widget/`
2. Verwijder `replace` directive, verwijder externe dependency
3. Of: publiceer als `github.com/OnlineChef/bubbletea-cinematic` Go module met proper tag

**Subagent:** `go-vendor` (custom agent, zie `.pi/agents/go-vendor.md`)

---

## Fase 2: Cross-Platform Build Pipeline

**Probleem:** ~4.8MB compiled binary in git, alleen voor één platform.

**Oplossing:**
1. Verwijder binary uit git history (`git filter-repo`)
2. Maak `cinematic-renderer/Makefile` of `build.sh` met:
   - `GOOS=linux GOARCH=amd64 go build -o cinematic-tui`
   - `GOOS=darwin GOARCH=arm64 go build -o cinematic-tui-darwin`
   - `GOOS=windows GOARCH=amd64 go build -o cinematic-tui.exe`
3. GitHub Actions workflow: build Go binaries op release/PR
4. npm `postinstall` script of lazy download bij eerste `uiStyle: "cinematic"` activatie

**Subagent:** `ci-build` (custom agent, zie `.pi/agents/ci-build.md`)

---

## Fase 3: Sidecar Robuustheid

**Probleem:** Geen graceful shutdown, geen reconnect, geen health check.

**Oplossing:**
1. **Graceful shutdown:** Stuur `{"quit": true}\n` via stdin vóór `kill()`
2. **Go-side:** Handle quit-message in `Update()`, return `tea.Quit`
3. **Health check:** Als sidecar 3 seconden geen stdin accepteert → restart
4. **Error fallback:** Als sidecar niet start → automatisch terugvallen op `premium` style
5. **Process cleanup:** `dispose()` wacht max 2s op clean exit, dan SIGKILL

**Bestanden:**
- `src/ui/agent-widget.ts` — TS sidecar management
- `cinematic-renderer/main.go` — Go shutdown handling

---

## Fase 4: Cleanup Onverwante Wijzigingen

**Probleem:** PR bevat onverwante changes die in eigen PR's horen.

**Acties:**
1. Verplaats `SECURITY_FIXES_APPLIED_2026-05-23.md` naar eigen branch/PR
2. Verplaats `ANALYSIS_TYPESCRIPT_GO_INTEGRATION.md` naar docs/ of verwijder
3. Verplaats `handoff.test.ts` CVE-008 fix naar security-fixes branch
4. Verwijder security audit MD's uit deze branch

**Subagent:** `git-cleanup` (custom agent, zie `.pi/agents/git-cleanup.md`)

---

## Fase 5: Test Coverage

**Huidige:** Geen tests voor cinematic sidecar spawn/kill lifecycle.

**Toe te voegen:**
1. `test/cinematic-sidecar.test.ts`:
   - Mock `child_process.spawn`
   - Test: sidecar spawnt alleen als `uiStyle === "cinematic" && isCinematicEnabled()`
   - Test: sidecar stopt als uiStyle terugschakelt
   - Test: `dispose()` kill sidecar
   - Test: spawn error valt terug naar geen widget (niet crash)
   - Test: IPC payload structuur matcht Go struct
2. `test/settings.test.ts` (DONE — al uitgebreid in Fase 0)

**Subagent:** `test-writer` (custom agent, zie `.pi/agents/test-writer.md`)

---

## Fase 6: Documentation & Release

1. Update `README.md` met cinematic dashboard sectie
2. Update `CHANGELOG.md` met v0.10.0 entry
3. Merge naar `feat/cinematic-go-sidecar` (force-push clean history)
4. PR omzetten van draft → ready for review
5. Squash-merge naar main

---

## Custom Agents voor dit Plan

Zie `.pi/agents/` voor gespecialiseerde subagents:

| Agent | Doel |
|-------|------|
| `go-vendor` | Go dependency vendoring en module management |
| `ci-build` | GitHub Actions + cross-platform build pipeline |
| `test-writer` | Test coverage voor sidecar lifecycle |
| `git-cleanup` | Git history cleanup en branch hygiene |
| `security-reviewer` | Security review van IPC en process spawning |

---

## Prioriteit

```
Fase 0 ✅ → Fase 4 (cleanup) → Fase 1 (vendor) → Fase 2 (build) → Fase 3 (robust) → Fase 5 (tests) → Fase 6 (release)
```

Fase 4 eerst omdat een schone PR makkelijker te reviewen is.
Fase 1+2 samen omdat de Go binary niet werkt zonder dependency fix.
