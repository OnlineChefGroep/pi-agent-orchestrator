# pi-agent-orchestrator v2 Handoff Package

Dit package bundelt de uitvoeringsspecificaties voor de v2-refactor en TUI-upgrade van `pi-agent-orchestrator`.

## Inhoud

- `00-OVERVIEW.md` — startpunt, status en fasering.
- `01-ORCHESTRATION-AND-MODEL-REFACTOR.md` — orchestration- en modelrefactor.
- `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md` — dashboard- en top-view-specificatie.
- `03-PI-DEEP-KNOWLEDGE-STRATEGY.md` — kennisarchitectuur voor Pi, tools en skills.
- `04-orchestrator-master-SKILL.md` — installatie- en ontwerpnotitie voor de skill.
- `05-LINEAR-ISSUES.md` — voorgestelde projectissues.
- `06-CURSOR-WORKFLOW.md` — aanbevolen ontwikkelworkflow.
- `07-SUCCESS-CRITERIA.md` — acceptatiecriteria en closeout.

De echte parsebare skill staat buiten dit documentatiepakket in:

```text
skills/orchestrator-master/SKILL.md
```

## Aanbevolen volgorde

1. `00-OVERVIEW.md`
2. `03-PI-DEEP-KNOWLEDGE-STRATEGY.md`
3. `skills/orchestrator-master/SKILL.md`
4. `01-ORCHESTRATION-AND-MODEL-REFACTOR.md`
5. `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md`
6. `07-SUCCESS-CRITERIA.md`

## Resultaat

Na uitvoering is de orchestrator onderhoudbaarder, beter geïntegreerd met Pi, responsiever in de terminal en beter voorbereid op een publieke release. Doelarchitectuur en huidige implementatie worden in de documenten expliciet van elkaar onderscheiden, zodat een agent geen toekomstige paden als reeds bestaande code behandelt.
