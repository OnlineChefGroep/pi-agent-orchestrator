# Orchestration & Model Layer Refactor Specification

**Fase:** 1  
**Doel:** De kern van de orchestrator schoner, beter testbaar en configureerbaarder maken.

## Huidige Situatie

De huidige `agent-runner.ts` en `model-resolver.ts` bevatten te veel verantwoordelijkheden in te weinig bestanden. Dit maakt de code moeilijk te onderhouden en uit te breiden.

## Gewenste Nieuwe Structuur

```
src/
├── orchestration/
│   ├── AgentRunner.ts
│   ├── QuotaManager.ts
│   ├── CircuitBreaker.ts
│   ├── HandoffManager.ts
│   ├── SwarmCoordinator.ts
│   ├── ThinkingLevelManager.ts
│   └── types.ts
├── model/
│   ├── ModelResolver.ts
│   ├── ModelConfig.ts
│   ├── ModelRegistry.ts
│   └── types.ts
```

## Belangrijkste Verbeteringen

### 1. Orchestration Layer

- **AgentRunner** wordt dunner en delegeert naar gespecialiseerde managers.
- **QuotaManager** — centraal beheer van quotas en rate limits.
- **CircuitBreaker** — expliciete implementatie met duidelijke states en recovery.
- **HandoffManager** — logica voor het doorgeven van werk tussen agents.
- **SwarmCoordinator** — coördinatie van meerdere parallelle agents.
- **ThinkingLevelManager** — configuratie en observatie van thinking levels.

### 2. Model Layer

- **ModelResolver** — betere caching, fuzzy matching en error UX.
- **ModelConfig** — expliciete configuratie van beschikbare modellen, fallbacks en prioritering.
- **ModelRegistry** — centrale plek voor model metadata.

### 3. Tool Descriptions

Alle tools in `src/tools/` krijgen rijke descriptions volgens het patroon in `03-PI-DEEP-KNOWLEDGE-STRATEGY.md`.

## Deliverables Fase 1

- Volledig gerefactorde `orchestration/` map met duidelijke verantwoordelijkheden.
- Verbeterde `model/` laag met expliciete configuratie.
- Uitstekende tool descriptions op alle publieke tools.
- Goede JSDoc en types.

## Aanpak

1. Begin met het schetsen van de nieuwe types (`types.ts`).
2. Implementeer de managers één voor één.
3. Migreer bestaande logica stap voor stap.
4. Update tool descriptions parallel.
5. Test grondig (vooral quotas, circuit breaker en handoff scenarios).