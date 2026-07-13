# Linear Issues Voorstel — pi-agent-orchestrator v2

Maak een Epic aan met de naam:

**Epic: pi-agent-orchestrator v2 — Full Refactor + Pi Deep Integration**

Daarna de onderstaande issues aanmaken.

## Fase 1 — Orchestration + Model + Skills

| Issue Titel | Beschrijving | Labels | Prioriteit |
|-------------|--------------|--------|------------|
| Refactor Orchestration Layer | Splits AgentRunner uit in kleinere modules (QuotaManager, CircuitBreaker, HandoffManager, SwarmCoordinator, ThinkingLevelManager) | refactor, backend | High |
| Upgrade Model Resolver & Config | Maak ModelResolver schoner met betere caching, error handling en expliciete configuratie (ModelConfig.ts) | refactor, model | High |
| Improve All Tool Descriptions | Update alle tool descriptions volgens het nieuwe rijke patroon (doel + wanneer + voorbeelden + gotchas) | docs, quality | High |
| Create orchestrator-master Skill | Maak de volledige `skills/orchestrator-master/SKILL.md` inclusief sterke description en gedetailleerde instructies | feature, pi-integration | High |

## Fase 2 — Dashboard + Top View Rewrite

| Issue Titel | Beschrijving | Labels | Prioriteit |
|-------------|--------------|--------|------------|
| Create DashboardState + InputHandler | Implementeer de nieuwe state en input architectuur | refactor, ui | High |
| Rewrite Renderers (Row + RunningCard + Top) | Bouw pure renderers met betere zichtbaarheid van thinking level en current action | refactor, ui | High |
| Implement Command Palette | Voeg command palette toe (`/` of `Ctrl+K`) voor betere discoverability | feature, ux | High |
| Clean up agent-top-renderer.ts | Maak de top view consistenter met de nieuwe renderers en betere theme support | refactor, ui | Medium |

## Fase 3 — Polish

| Issue Titel | Beschrijving | Labels | Prioriteit |
|-------------|--------------|--------|------------|
| Improve Spinners & UI Polish | Voeg meer en betere spinners toe + algemene UI consistentie | polish, ux | Medium |
| Test orchestrator-master Skill in Pi | Test of Pi de skill correct laadt en gebruikt na installatie van de extensie | testing, pi-integration | High |

## Fase 4 — Open Source Voorbereiding

| Issue Titel | Beschrijving | Labels | Prioriteit |
|-------------|--------------|--------|------------|
| Update README for External Audience | Maak de README vriendelijker en duidelijker voor mensen die Pi nog niet kennen | docs, oss | High |
| Prepare Release & Cleanup | Linear issues opruimen, CHANGELOG updaten, eerste release voorbereiden | release, oss | Medium |

## Aanbeveling

- Maak één **Epic**.
- Gebruik de bovenstaande issues als basis.
- Werk per fase met kleine, reviewable PRs.
- Koppel elke PR aan het bijbehorende Linear issue.
