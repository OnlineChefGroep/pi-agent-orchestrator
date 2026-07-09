# orchestrator-master Skill

**Bestand:** `skills/orchestrator-master/SKILL.md`

Dit is de belangrijkste deliverable om Pi diepe kennis te geven van de orchestrator.

---

```yaml
---
name: orchestrator-master
description: |
  Expert in multi-agent orchestration using the pi-agent-orchestrator extension.
  Use this skill when the user wants to run multiple agents in parallel, manage
  different thinking levels, perform handoffs between agents, use swarm coordination,
  or when complex workflows with quotas, circuit breakers, or many concurrent agents
  are involved. Load this skill for any task that requires coordinating teams of agents
  rather than using a single agent.
---
```

## Wanneer de Orchestrator Gebruiken

Gebruik de orchestrator in plaats van een normale single agent wanneer:

- De taak complex is en baat heeft bij meerdere gespecialiseerde agents (bijv. explorer + planner + implementer + reviewer).
- Je verschillende **thinking levels** wilt gebruiken (low / medium / high).
- Je **handoffs** wilt doen tussen agents (één agent geeft werk door aan een ander).
- Je **swarm** coördinatie wilt gebruiken.
- Je quotas, rate limits of circuit breaker gedrag wilt respecteren.
- Je meerdere agents parallel wilt laten draaien met goed overzicht (via het dashboard).

Gebruik een normale single agent als de taak eenvoudig, lineair en snel is.

## Thinking Level Strategie

- **low**: Snelle, simpele taken (bijv. kleine fixes, formatting).
- **medium**: Standaard development werk (meeste gevallen).
- **high**: Complexe analyse, architectuur, debugging van lastige bugs, grote refactors.

Vraag de gebruiker expliciet welk thinking level gewenst is als het niet duidelijk is. Default naar `medium` tenzij de taak duidelijk complex is.

## Handoff & Swarm Patronen

**Handoff:**
- Gebruik handoff wanneer één agent een deel van het werk heeft afgerond en een andere agent beter geschikt is voor de volgende stap.
- Geef duidelijke context mee bij de handoff (wat is al gedaan, wat moet nog gebeuren, welke beslissingen zijn genomen).

**Swarm:**
- Gebruik swarm coördinatie wanneer meerdere agents tegelijkertijd aan gerelateerde sub-taken kunnen werken.
- Zorg voor goede coördinatie en conflictvermijding (bijv. via shared context of duidelijke taakverdeling).

## Quotas, Circuit Breaker & Error Handling

- Respecteer altijd de ingestelde quotas.
- Als een agent in een circuit breaker staat (te veel fouten), wacht of gebruik een andere agent.
- Bij errors: analyseer eerst of het een tijdelijk probleem is (retry) of een structureel probleem (andere aanpak of thinking level verhogen).

## Gotchas & Anti-Patronen

- **Anti-patroon:** Te veel agents spawnen zonder duidelijke taakverdeling → leidt tot chaos en quota verspilling.
- **Anti-patroon:** Hoge thinking level gebruiken voor simpele taken → onnodig traag en duur.
- **Anti-patroon:** Agents te lang laten doorwerken zonder tussenresultaten te evalueren.
- **Gotcha:** Bij parallel werk altijd rekening houden met shared resources (bestanden, state).
- **Gotcha:** Model selectie heeft impact op snelheid en kwaliteit — kies bewust.

## Concrete Voorbeelden

**Goed voorbeeld prompt:**
```
Gebruik de orchestrator om een complexe refactoring te doen van het dashboard.
- 1 explorer agent (high thinking) om de huidige structuur te analyseren
- 1 planner agent (medium thinking) om een plan te maken
- 1 implementer agent (medium thinking) om de refactor uit te voeren
- Gebruik handoff tussen de agents
- Toon tussentijds het dashboard zodat ik kan meekijken
```

**Slecht voorbeeld:**
```
Refactor het dashboard
```
→ Te vaag, geen structuur, geen thinking levels, geen coördinatie.

## Commands die handig zijn

- `/orchestrate` — Start een nieuwe multi-agent workflow
- `/agents status` of `/agents top` — Bekijk huidige agents
- Dashboard openen voor visueel overzicht

## Referenties

- Zie de documentatie in de extensie voor meer details over quotas, thinking levels en handoff.
- Gebruik het dashboard (`showAgentDashboard`) voor visueel overzicht tijdens complexe runs.

---

**Einde van de skill.**  
Deze skill moet in de map `skills/orchestrator-master/SKILL.md` staan zodat Pi hem automatisch ontdekt.