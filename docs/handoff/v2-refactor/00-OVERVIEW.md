# pi-agent-orchestrator v2 — Handoff Package

**Doel:** De orchestrator-extensie stapsgewijs refactoren, de TUI professionaliseren en Pi betrouwbare domeinkennis geven via een echte loadable skill.

Dit package bevat gerichte specificaties die per fase in reviewbare changes kunnen worden uitgevoerd. De documenten beschrijven deels de huidige implementatie en deels de expliciete v2-doelarchitectuur.

## Structuur van dit package

| Bestand | Inhoud | Wanneer gebruiken |
|---|---|---|
| `00-OVERVIEW.md` | Grote lijnen, status en fasering | Altijd als startpunt |
| `01-ORCHESTRATION-AND-MODEL-REFACTOR.md` | Backend-refactor en migratiestrategie | Fase 1 |
| `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md` | Dashboard- en top-view-specificatie | Fase 2 |
| `03-PI-DEEP-KNOWLEDGE-STRATEGY.md` | Kennisarchitectuur voor tools, docs en skills | Parallel aan fase 1 |
| `04-orchestrator-master-SKILL.md` | Installatie- en ontwerpnotitie voor de loadable skill | Pi-integratie |
| `05-LINEAR-ISSUES.md` | Voorgestelde Linear-issues en afhankelijkheden | Projectmanagement |
| `06-CURSOR-WORKFLOW.md` | Aanbevolen uitvoeringsworkflow | Ontwikkeling |
| `07-SUCCESS-CRITERIA.md` | Acceptatiecriteria en closeout-checklist | Review en afronding |

De daadwerkelijk loadable skill staat in `skills/orchestrator-master/SKILL.md`.

## Aanbevolen volgorde

1. Lees `00-OVERVIEW.md`.
2. Lees `03-PI-DEEP-KNOWLEDGE-STRATEGY.md`.
3. Inspecteer `skills/orchestrator-master/SKILL.md` en de toelichting in `04-orchestrator-master-SKILL.md`.
4. Voer fase 1 uit via `01-ORCHESTRATION-AND-MODEL-REFACTOR.md`.
5. Voer fase 2 uit via `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md`.
6. Sluit af tegen `07-SUCCESS-CRITERIA.md`.

## Fases

### Fase 1 — Foundation

- Orchestration-verantwoordelijkheden expliciet scheiden.
- Modelresolver en modelconfiguratie verbeteren.
- Publieke toolbeschrijvingen source-grounded maken.
- De loadable `orchestrator-master` skill onderhouden als operationele kennislaag.

### Fase 2 — UI

- Dashboardstate, inputafhandeling en pure renderers verder scheiden.
- Thinking level, huidige actie en fleetstatus prominent tonen.
- Dashboard en `top` responsief en ANSI-width-safe houden.

### Fase 3 — Polish

- Motionprofielen, reduced motion en consistente semantische statusglyphs.
- Focused tests plus golden coverage voor representatieve terminalbreedtes.
- Skillgedrag en discovery in Pi valideren.

### Fase 4 — Release

- Publieke documentatie en changelog actualiseren.
- Projecttracking opschonen.
- Release-readiness en migratienotities afronden.

## Belangrijkste deliverables

- Onderhoudbare orchestration- en modellagen.
- Professionele dashboard- en top-view-ervaring.
- Een echte parsebare `orchestrator-master` skill.
- Sterke toolbeschrijvingen en source-grounded documentatie.
- Duidelijke acceptatiecriteria voor open-source release-readiness.
