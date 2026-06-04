# Performance Architecture

## Overzicht

Dit document beschrijft de belangrijkste performance-architectuur beslissingen in de pi-agent-orchestrator. Het legt uit _waarom_ bepaalde patronen zijn gekozen, zodat toekomstige contributors dezelfde afwegingen kunnen maken zonder de code tot in detail te hoeven analyseren.

---

## 1. Agent Cleanup TTL (AgentManager)

### Beslissing
- **Configurable cleanup TTL** via constructor parameter (default: 60 seconden)
- Periodic cleanup interval: 30 seconden
- Minimum TTL: 10 seconden (clamped via `setCleanupTtl()`)
- `clearCompleted()` verwijdert _alle_ completed/stopped/errored records direct

### Waarom
- **Memory pressure**: tijdens lange sessies met veel agent spawns kunnen honderden `AgentRecord` objecten accumuleren. Elk record bevat o.a. sessie-objecten, lifetime usage data, en result text.
- **Trade-off**: een korte TTL betekent dat gebruikers geen oude agent resultaten kunnen terugzien via `/agents`. `clearCompleted()` op sessie-grenzen (`session_start`, `session_before_switch`) zorgt voor een harde reset.
- **30s interval** is een compromis: frequent genoeg om geheugen laag te houden, maar niet zo frequent dat de O(n) iterate over de agents map merkbaar wordt.

### Wanneer aanpassen
- Voor sessies met extreem veel spawns (>1000): verlaag TTL naar 30s
- Voor debug sessies waar historie bewaard moet blijven: verhoog TTL naar 5min of gebruik `clearCompleted()` niet

### Key code
```typescript
// src/agent-manager.ts
constructor(
  onComplete?: OnAgentComplete,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
  onStart?: OnAgentStart,
  onCompact?: OnAgentCompact,
  cleanupTtlMs = 60_000, // ← default 60s
) { ... }

setCleanupTtl(ms: number): void {
  this.cleanupTtlMs = Math.max(10_000, ms); // ← minimum floor
}
```

---

## 2. Dirty Checking (Dashboard + Widget)

### Beslissing
Beide UI-componenten gebruiken een **lightweight structural snapshot** om te detecteren of de agent lijst echt veranderd is:

- **Snapshot**: een string hash van `id:status,` voor elke agent
- **Alleen status-transities** triggeren een `dirty = true` — toolUses/turnCount wijzigingen niet
- **Sneller dan deep-compare**: O(n) string concatenatie vs O(n) object vergelijking

### Waarom geen toolUses/turnCount in de snapshot
ToolUses en turnCount veranderen binnen een turn (elke tool call). Als we die zouden tracken, zou de snapshot _continu_ veranderen tijdens actieve agent-executie, waardoor de dirty flag nooit false wordt en de optimalisatie zinloos is. Status-transities (queued → running → completed) zijn de enige _structurele_ veranderingen die de UI layout beïnvloeden.

### Dashboard specifiek
```typescript
// src/ui/agent-dashboard.ts — refreshAgents()
const snapshot = this.buildSnapshot();
if (snapshot !== this.agentSnapshot) {
  this.agentSnapshot = snapshot;
  this.dirty = true;
  // clamp selection, purge selectedIds
}
```

### Widget specifiek
```typescript
// src/ui/agent-widget.ts — update()
const snapshot = this.buildSnapshot(allAgents);
if (snapshot !== this.agentSnapshot) {
  this.agentSnapshot = snapshot;
  this.dirty = true;
  // adapt refresh interval
}
if (!this.dirty && this.widgetRegistered) {
  return; // skip TUI re-render
}
```

### Trade-offs
- **Pro**: voorkomt ~90% van de `requestRender()` calls tijdens idle/stabiele periodes
- **Con**: mist incrementele progress (tool counts, token burn rate) tot de volgende turn boundary of status transitie. Dit is acceptabel omdat de UI een overview geeft, geen real-time monitor.

---

## 3. Adaptive Refresh Intervals

### Dashboard (agent-dashboard.ts)

| Aantal agents | Status | Interval | fps |
|---|---|---|---|
| ≥ 100 | any | 100ms (TURBO) | 10 |
| 50–99 | any | 150ms (HIGH_LOAD) | 6.7 |
| any | running/queued | 200ms (ACTIVE) | 5 |
| < 50 | idle | 750ms (configurable via settings) | 1.3 |

Het interval wordt dynamisch aangepast: elke timer tick checkt `computeRefreshInterval()` en herstart de timer als de waarde veranderd is.

### Widget (agent-widget.ts)

| Status | Interval | fps |
|---|---|---|
| Agents running/queued | 200ms | 5 |
| Alle agents finished | 1000ms | 1 |

De widget past zijn interval aan wanneer de snapshot verandert (en dus een status-transitie heeft plaatsgevonden). Dit gebeurt via `currentIntervalMs` tracking: de timer wordt alleen herstart als de target interval echt verschilt van de huidige.

### Waarom deze intervallen
- **200ms** is snel genoeg voor vloeiende spinner-animatie en snelle status-updates
- **1000ms** idle is langzaam genoeg om CPU te sparen, maar frequent genoeg om een nieuwe spawn binnen 1 seconde te tonen
- **100ms/150ms** voor grote agent lijsten omdat status-transities frequenter zijn bij veel agents

---

## 4. Debounced requestRender (Conversation Viewer)

### Beslissing
In plaats van direct `this.tui.requestRender()` aan te roepen bij elke session event, gebruiken we een **drie-fasen debounce**:

1. **Rate limit check**: als er binnen de laatste 16ms een render is geweest, skip
2. **Coalesce fallback**: als de rate-limit actief is, plan een `setTimeout` voor als de window verloopt
3. **queueMicrotask**: als de rate-limit niet actief is, plan een microtask (coalesceert alle events in de huidige synchrone burst)

### Waarom geen directe requestRender
De session subscription vuurt op elk session event: text deltas, turn ends, compaction, etc. Tijdens streaming kan dit tientallen keren per seconde zijn. Zonder debounce zou de TUI ~60+ renders per seconde doen — allemaal identiek (de content is nog niet veranderd omdat de microtask de state pas na de burst update).

### Waarom geen vaste requestAnimationFrame
De TUI is terminal-gebaseerd en heeft geen `requestAnimationFrame`. `queueMicrotask` is het dichtste equivalent: het vuurt na de huidige synchrone call stack, maar voor eventuele I/O callbacks.

### Pattern (ook gebruikt in dashboard)
```typescript
private requestRender(): void {
  // 1. Rate limit
  if (lastRenderTime > 0 && elapsed < MIN_RENDER_GAP_MS) {
    if (!this.coalesceTimer && !this.renderPending) {
      this.coalesceTimer = setTimeout(() => {
        this.coalesceTimer = null;
        this.lastRenderTime = 0;
        this.requestRender(); // retry na window
      }, MIN_RENDER_GAP_MS - elapsed);
    }
    return;
  }
  // 2. Pending guard
  if (this.renderPending) return;
  this.renderPending = true;
  // 3. Microtask
  queueMicrotask(() => {
    this.renderPending = false;
    this.lastRenderTime = Date.now();
    this.tui.requestRender();
  });
}
```

---

## 5. Memoized Theme (Dashboard)

### Beslissing
Dashboard theme (colors + box chars) wordt gecached en alleen herberekend als de UI style verandert.

### Waarom
`getThemeColors()` en `getBoxChars()` doen ANSI-string constructie. Voor elke render (elke 200ms) zou dit overhead geven. Met caching is het O(1) lookup.

```typescript
private getTheme(): DashboardTheme {
  const currentStyle = getUiStyle();
  if (this.cachedTheme && this.lastUiStyle === currentStyle) {
    return this.cachedTheme;
  }
  this.cachedTheme = getThemeColors();
  this.lastUiStyle = currentStyle;
  return this.cachedTheme;
}
```

Cache wordt geïnvalideerd in de `invalidate()` methode (aangeroepen door de TUI bij style changes).

---

## 6. Dynamische chromeLines (Dashboard)

### Beslissing
Chrome lines (aantal regels voor headers, footers, borders) past zich aan aan terminal hoogte:

| Terminal hoogte | Chrome lines |
|---|---|
| < 30 rijen | 10 |
| 30–50 | 13 |
| 50–80 | 16 |
| > 80 | 19 |

### Waarom
Op kleine terminals (laptops, gesplitste schermen) is elke regel kostbaar. Minder chrome = meer ruimte voor agent data. Op grote terminals is extra chrome acceptabel voor een rijkere UI.

---

## 7. AgentActivity Cleanup

### Beslissing
`AgentActivity` entries worden opgeruimd via een callback chain:

```
AgentManager.removeRecord() 
  → onRecordRemoved(id) 
  → index.ts: agentActivity.delete(id)
```

Dit gebeurt op drie momenten:
1. **Periodieke cleanup** (elke 30s, na TTL)
2. **`clearCompleted()`** (sessie start/switch)
3. **Agent completion** (via `sendIndividualNudge`, `groupJoin.onAgentComplete`, `swarmJoin.onAgentComplete`)

### Waarom geen extra GC
De `AgentActivity` map groeit alleen als agents actief zijn of net voltooid. Na voltooiing wordt de entry binnen 1-2 turn boundaries verwijderd. De callback chain zorgt dat verwijdering altijd gepaard gaat met activity cleanup — er is geen aparte sweep nodig.

---

## 8. Overzicht RequestRender Strategie

| Component | Timer | Debounce | Dirty check | Interval |
|---|---|---|---|---|
| Dashboard | Adaptief | Ja (16ms + microtask + coalesce) | Ja (snapshot) | 100–750ms |
| Widget | Adaptief | Nee (al rate gelimiteerd door timer) | Ja (snapshot) | 200–1000ms |
| ConversationViewer | Event-driven | Ja (16ms + microtask + coalesce) | Nee | — |
| AgentsTopComponent | Fixed 1s | Nee (al rate gelimiteerd) | Nee | 1000ms |

### Waarom conversation-viewer geen dirty check heeft
De conversation viewer toont de _volledige_ agent conversation. Elke session event (text delta, tool call, tool result) verandert de visible state. Een dirty check zou altijd true zijn tijdens streaming. De rate limit alleen is voldoende.

### Waarom AgentsTopComponent geen debounce heeft
Het gebruikt een vaste 1s refresh interval. Dit is bewust gekozen: `/agents top` is een statische momentopname, geen live stream.

---

---

## 9. Spawn Batching (Phase 3.1)

### Beslissing
Bij bulk spawns (meerdere achtergrond agents die tegelijk worden gestart), gebruiken we een **tweetraps debounce** om de widget-updates te coalesceren:

1. **Eerste spawn**: `debouncedUpdate()` roept `update()` direct aan voor onmiddellijke feedback
2. **Timer (16ms)**: een korte setTimeout wordt gestart om eventuele volgende spawns binnen 16ms op te vangen
3. **Timer callback**: een tweede `update()` wordt uitgevoerd met de volledige batch
4. **Tussentijdse calls**: alle `debouncedUpdate()` calls tijdens de 16ms window worden overgeslagen

### Compacte batch rendering
Wanneer er 3+ agents van hetzelfde type in "queued" status zijn, worden ze getoond als een compacte regel:
```
├── ◦ 5× Explore queued
```
in plaats van 5 individuele regels. Dit bespaart verticale ruimte en vermindert render overhead.

### Waarom geen strict batching op spawn-niveau
Anders dan de batch orchestrator (die completions debounced), hebben spawns geen aparte buffer nodig omdat:
- De `AgentManager.spawn()` is synchroon — alle records worden in dezelfde call stack toegevoegd
- De widget timer (200ms actief) ziet alle records in één keer
- De dashboard requestRender is al rate gelimiteerd op 16ms

De debounce in `debouncedUpdate()` voorkomt alleen dat `widget.update()` 20x wordt aangeroepen voor 20 spawns — de snapshot build en `listAgents()` sort worden zo teruggebracht van 20 naar 2 calls.

### Key code
```typescript
// src/ui/agent-widget.ts
debouncedUpdate(): void {
  if (this.updateTimer) return;          // timer pending → skip
  this.update();                          // immediate: eerste spawn
  this.updateTimer = setTimeout(() => {    // coalesce volgende spawns
    this.updateTimer = undefined;
    this.update();
  }, AgentWidget.SPAWN_BATCH_MS);          // 16ms
}
```

### Trade-offs
- **Pro**: `listAgents()` en snapshot build worden 10-20x minder aangeroepen bij bulk spawns
- **Con**: eerste render toont 1 agent, tweede render 16ms later toont de volledige batch — korte visuele flits
- **Con**: compacte weergave verbergt individuele descriptions voor batches van 3+ agents

---

## 10. Aanbevolen Benchmarks

Voor het valideren van performance veranderingen:

```bash
# Basislijn: typecheck + lint + test suite
npm run typecheck && npm run lint && npm test

# Dashboard rendering performance (bestaande test)
npm test -- test/dashboard-components.test.ts

# Compaction benchmarks
node --experimental-specifier-resolution=node test/compaction.benchmark.ts
```

### Kritische metrics
- **`listAgents()` tijd**: zou < 1ms moeten zijn voor < 500 agents
- **`buildSnapshot()` tijd**: zou < 0.1ms moeten zijn voor < 100 agents
- **`requestRender()` calls per seconde**: dashboard max 5-10fps, max 60fps met debounce
- **Geheugen per `AgentRecord`**: ~2-5KB (excl. session messages)
