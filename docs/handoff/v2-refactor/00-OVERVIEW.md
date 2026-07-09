# pi-agent-orchestrator v2 — Handoff Package

**Doel:** Volledige refactor + rewrite van de orchestrator extensie + diepe integratie met Pi zodat de agent automatisch volledige kennis heeft.

Dit package bevat de nu beschikbare handoff bestanden voor de v2 refactor. Extra fasespecificaties worden in follow-up PRs toegevoegd.

## Structuur van dit package

| Bestand | Inhoud | Wanneer gebruiken |
|---------|--------|-------------------|
| `00-OVERVIEW.md` | Dit bestand — grote lijnen en fasering | Altijd als startpunt |
| `04-orchestrator-master-SKILL.md` | Volledige voorbeeld skill (klaar om te gebruiken) | Belangrijkste deliverable |
| `README.md` | Korte navigatie en samenvatting van dit package | Snel overzicht |

## Geplande follow-up specificaties

Deze bestanden zijn nog niet onderdeel van dit package en worden later toegevoegd:

- `01-ORCHESTRATION-AND-MODEL-REFACTOR.md` — Gedetailleerde specificatie voor de backend laag.
- `02-DASHBOARD-AND-TOP-VIEW-REWRITE.md` — Volledige UI rewrite specificatie.
- `03-PI-DEEP-KNOWLEDGE-STRATEGY.md` — Hoe we Pi diepe kennis geven van de orchestrator.
- `05-LINEAR-ISSUES.md` — Voorgestelde Linear issues + structuur.
- `06-CURSOR-WORKFLOW.md` — Aanbevolen werkwijze in Cursor + Grok 4.5.
- `07-SUCCESS-CRITERIA.md` — Wanneer is dit project succesvol?

## Aanbevolen Volgorde

1. Lees `00-OVERVIEW.md` (dit bestand)
2. Lees `04-orchestrator-master-SKILL.md` (de krachtigste manier om Pi kennis te geven)
3. Gebruik de fases hieronder als richting totdat de geplande follow-up specificaties beschikbaar zijn.

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