# Dashboard + Top View Rewrite Specification

**Doel:** De huidige dashboard en top view volledig refactoren/rewriten naar een onderhoudbare, leesbare en uitbreidbare architectuur met duidelijk betere UX (vooral thinking level en current action zichtbaarheid).

## Huidige Problemen (Samenvatting)

- Te veel state en logica in één grote klasse (`agent-dashboard.ts`).
- `handleInput` is een god-method.
- Thinking level en current action zijn niet prominent genoeg.
- Virtual scrolling logica is complex en moeilijk te onderhouden.
- Top view (`agent-top-renderer.ts`) voelt gedateerd.
- Weinig scheiding tussen state, input handling en rendering.

## Gewenste Nieuwe Architectuur

```
src/ui/dashboard/
├── DashboardState.ts          // Alle data + derived state + dirty detection
├── InputHandler.ts            // Keyboard handling + command palette
├── AgentDashboard.ts          // Dunne orchestrator / entrypoint
└── renderers/
    ├── RowRenderer.ts
    ├── RunningCardRenderer.ts
    ├── TopTableRenderer.ts
    └── VirtualList.ts
```

### DashboardState.ts
- Beheert alle agents data, filters, selectie, modes.
- Berekent derived state (running, queued, done, etc.).
- Implementeert dirty detection (snapshot hash).
- Geeft een schone API aan de rest van de applicatie.

### InputHandler.ts
- Verwerkt alle keyboard input.
- Bevat logica voor command palette (`/` of `Ctrl+K`).
- Scheidt concerns van de rest van de UI.

### Renderers (Pure functies)
- `RowRenderer.ts` — Rendert één rij in de lijst (met thinking level + current action prominent).
- `RunningCardRenderer.ts` — Mooie card voor running agents met progress bar.
- `TopTableRenderer.ts` — Opschoonde versie van de huidige top view.
- `VirtualList.ts` — Simpele, herbruikbare virtualisatie helper.

## Belangrijkste UX Verbeteringen

1. **Thinking Level** — Altijd prominent tonen (niet alleen een klein icoontje).
2. **Current Action** — Duidelijk tonen wat een running agent op dit moment doet.
3. **Running Agents** — Echte cards met progress bar in plaats van platte rijen.
4. **Command Palette** — `/` opent een command palette voor betere discoverability.
5. **Visuele Hiërarchie** — Duidelijke kaarten/secties met goede spacing en borders.
6. **Top View** — Consistenter met de nieuwe renderers en betere theme support.

## Implementatie Aanpak

1. Maak eerst `DashboardState.ts` en `InputHandler.ts`.
2. Bouw de pure renderers.
3. Refactor `AgentDashboard.ts` zodat het dunner wordt en de nieuwe lagen gebruikt.
4. Migreer bestaande functionaliteit stap voor stap (behoud bestaande features).
5. Test met veel agents (performance).

## Deliverables Fase 2

- Volledige nieuwe map `src/ui/dashboard/` met de nieuwe architectuur.
- Werkende command palette.
- Duidelijk betere zichtbaarheid van thinking level en current action.
- Opschoonde Top view.
- Goede scheiding van concerns (state, input, rendering).

## Risico's & Mitigatie

- **Risico:** Feature regressie → Mitigatie: Stap voor stap migreren en bestaande functionaliteit behouden.
- **Risico:** Performance achteruitgang → Mitigatie: VirtualList vroeg testen met 100+ agents.
- **Risico:** Te grote PR → Mitigatie: Opsplitsen in meerdere kleinere PRs binnen Fase 2.
