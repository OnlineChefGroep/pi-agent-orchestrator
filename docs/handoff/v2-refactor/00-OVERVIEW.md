# pi-agent-orchestrator v2 — Complete Handoff Package

**Doel:** Volledige refactor + rewrite van de orchestrator extensie + diepe integratie met Pi zodat de agent automatisch volledige kennis heeft.

Dit package bevat meerdere gerichte specificatie bestanden die je (of Grok 4.5 in Cursor) stapsgewijs kunt uitvoeren.

## Structuur van dit package

| Bestand | Inhoud | Wanneer gebruiken |
|---------|--------|-------------------|
| `00-OVERVIEW.md` | Dit bestand — grote lijnen en fasering | Altijd als startpunt |
| `01-ORCHESTRATION-AND-MODEL-REFACOR.md` | Gedetailleerde specificatie voor de backend laag | Fase 1 |
| `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md` | Volledige UI rewrite specificatie | Fase 2 |
| `03-PI-DEEP-KNOWLEDGE-STRATEGY.md` | Hoe we Pi diepe kennis geven van de orchestrator | Parallel aan Fase 1 |
| `04-orchestrator-master-SKILL.md` | Volledige voorbeeld skill (klaar om te gebruiken) | Belangrijkste deliverable |
| `05-LINEAR-ISSUES.md` | Voorgestelde Linear issues + structuur | Voor project management |
| `06-CURSOR-WORKFLOW.md` | Aanbevolen werkwijze in Cursor + Grok 4.5 | Ontwikkeling |
| `07-SUCCESS-CRITERIA.md` | Wanneer is dit project succesvol? | Review & afronding |

## Aanbevolen Volgorde

1. Lees `00-OVERVIEW.md` (dit bestand)
2. Lees `03-PI-DEEP-KNOWLEDGE-STRATEGY.md` (belangrijk voor adoptie)
3. Lees `04-orchestrator-master-SKILL.md` (de krachtigste manier om Pi kennis te geven)
4. Begin met Fase 1 → `01-ORCHESTRATION-AND-MODEL-REFACOR.md`
5. Daarna Fase 2 → `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md`

## Fases

**Fase 1 — Foundation (Orchestration + Model + Skills)**
- Refactor orchestration laag
- Upgrade Model Resolver + configuratie
- Uitstekende tool descriptions
- Maak `orchestrator-master` skill

**Fase 2 — UI Rewrite**
- Nieuwe architectuur: `DashboardState` + `InputHandler` + pure renderers
- Thinking level + current action prominent maken
- Command palette toevoegen
- Top view opschonen

**Fase 3 — Polish**
- Betere spinners
- Consistentie
- Testen van de skill in Pi

**Fase 4 — Open Source**
- README + docs updaten
- Linear opruimen
- Release voorbereiden

## Belangrijkste Deliverables

- Schone, onderhoudbare orchestration laag
- Volledig herschreven Dashboard + Top view
- `orchestrator-master` skill (Pi krijgt diepe kennis)
- Command palette
- Goede tool descriptions
- Klaar voor open source

---

**Dit package is gemaakt voor Cursor + Grok 4.5.**  
Houd bestanden klein, verantwoordelijkheden duidelijk, en werk per fase met reviewable PRs.