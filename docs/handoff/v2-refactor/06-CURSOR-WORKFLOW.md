# Cursor + Grok 4.5 Werkwijze

Dit project is ontworpen om prettig te werken in Cursor met Grok 4.5 (of vergelijkbare modellen).

## Aanbevolen Werkwijze

### 1. Gebruik dit Handoff Package als Context

- Open de bestanden in `pi-agent-orchestrator-v2-handoff/` als context in Cursor.
- Begin elke sessie met `00-OVERVIEW.md` + het relevante fase-bestand.

### 2. Werk per Fase met Kleine PRs

- Maak geen mega-PRs.
- Houd elke PR gericht op één specifiek onderdeel (bijv. alleen `QuotaManager`, of alleen `RunningCardRenderer`).
- Review elke PR voordat je doorgaat.

### 3. Houd Bestanden Klein en Duidelijk

- Eén verantwoordelijkheid per bestand.
- Goede JSDoc en comments (helpt Grok enorm).
- Duidelijke types.

### 4. Test Vaak

- Test de orchestration laag grondig (quotas, handoff, circuit breaker).
- Test de UI met veel agents (performance).
- Test de `orchestrator-master` skill in Pi (`/reload` + test prompts).

### 5. Gebruik de Skill als Kwaliteitsmeter

- Als Pi de `orchestrator-master` skill goed gebruikt, weet je dat de integratie succesvol is.
- Dit is een van de belangrijkste succes criteria.

## Best Practices voor dit Project

- Schrijf code die **agent-vriendelijk** is (duidelijke structuur, goede namen, goede documentatie).
- Maak kleine, incrementele veranderingen.
- Documenteer beslissingen kort in de PR beschrijving.
- Gebruik de Linear issues als leidraad.

## Commando's die Vaak Nuttig Zijn

- `/reload` — Herlaad de extensie in Pi (belangrijk tijdens ontwikkeling)
- Dashboard openen om visueel te testen
- `/perf` om performance metrics te bekijken

---

Werk systematisch, klein en met duidelijke reviews. Dit project leent zich uitstekend voor een agentic workflow.