# Orchestration & Model Layer Refactor Specification

**Fase:** 1  
**Doel:** De kern van de orchestrator schoner, beter testbaar en configureerbaarder maken.

## Huidige situatie

De huidige implementatie is bewust nog grotendeels vlak onder `src/`. De belangrijkste verantwoordelijkheden zitten onder meer in `agent-runner.ts`, `model-resolver.ts`, `batch-orchestrator.ts`, `orchestration-dispatch.ts`, `swarm-join.ts` en `group-join.ts`. Deze specificatie beschrijft de gewenste v2-doelarchitectuur; de genoemde submappen bestaan dus nog niet volledig.

## Gewenste doelstructuur

```text
src/
├── orchestration/
│   ├── agent-runner.ts
│   ├── quota-manager.ts
│   ├── circuit-breaker.ts
│   ├── handoff-manager.ts
│   ├── swarm-coordinator.ts
│   ├── thinking-level-manager.ts
│   └── types.ts
├── model/
│   ├── model-resolver.ts
│   ├── model-config.ts
│   ├── model-registry.ts
│   └── types.ts
```

## Belangrijkste verbeteringen

### 1. Orchestration layer

- `AgentRunner` wordt dunner en delegeert naar gespecialiseerde managers.
- `QuotaManager` centraliseert quotas en rate limits.
- `CircuitBreaker` krijgt expliciete states, thresholds en recovery.
- `HandoffManager` beheert gestructureerde overdracht tussen agents.
- `SwarmCoordinator` coördineert parallelle agents en delivery waves.
- `ThinkingLevelManager` centraliseert thinking-level selectie en observability.

### 2. Model layer

- `ModelResolver` krijgt betere caching, matching en foutmeldingen.
- `ModelConfig` maakt modellen, fallbacks en prioriteiten expliciet.
- `ModelRegistry` wordt de centrale bron voor modelmetadata.

### 3. Tool descriptions

Alle publieke tools krijgen compacte maar volledige descriptions volgens `03-PI-DEEP-KNOWLEDGE-STRATEGY.md`.

## Migratiestrategie

1. Leg interfaces en invarianten vast zonder runtimegedrag te wijzigen.
2. Extract één verantwoordelijkheid per commit.
3. Houd compatibility-adapters aan totdat alle call-sites gemigreerd zijn.
4. Verplaats pas daarna bestanden naar de nieuwe submappen.
5. Verwijder adapters alleen wanneer focused tests en integratietests groen zijn.

## Deliverables fase 1

- Onderhoudbare orchestration-componenten met duidelijke verantwoordelijkheden.
- Een expliciete modelconfiguratie- en registrylaag.
- Volledige descriptions op alle publieke tools.
- Goede JSDoc, types en gerichte tests voor quotas, circuit breaker, handoff en swarmgedrag.
