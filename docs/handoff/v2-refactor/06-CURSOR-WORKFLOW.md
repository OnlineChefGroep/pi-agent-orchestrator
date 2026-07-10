# Cursor Workflow

Dit package kan in Cursor of een vergelijkbare coding-agentomgeving worden gebruikt. De repository en actuele tooloutput blijven de bron van waarheid; modelnamen in deze workflow zijn uitwisselbaar.

## Aanbevolen werkwijze

### 1. Gebruik het handoffpackage gericht

- Open `docs/handoff/v2-refactor/` als context.
- Begin met `00-OVERVIEW.md` en alleen het relevante fasebestand.
- Laad niet automatisch het volledige package in iedere prompt.

### 2. Werk per capability

- Houd implementatie-PR's gericht op één coherent runtime- of UI-onderdeel.
- Partitioneer parallel schrijfwerk per bestand of module.
- Gebruik read-only onderzoekslanes voor brede analyse.
- Leg acceptatiebewijs vast voordat implementatie begint.

### 3. Maak huidige staat en doelarchitectuur expliciet

- Bestaande runtimebestanden staan grotendeels vlak onder `src/`.
- `src/orchestration/` en `src/model/` zijn v2-doelpaden totdat de migratie daadwerkelijk is uitgevoerd.
- Laat agents altijd bestaande bestanden verifiëren voordat ze imports of verplaatsingen voorstellen.

### 4. Valideer gericht

- Test orchestration-invarianten rond quotas, handoffs, circuit breakers en swarms.
- Test TUI-rendering op ANSI-visible width en representatieve terminalbreedtes.
- Test `skills/orchestrator-master/SKILL.md` op discovery en topologykeuze.
- Scheid kapotte CI-infrastructuur van aantoonbare codefouten.

### 5. Sluit iedere wave af

- Reconcile tegenstrijdige agentbevindingen.
- Stop duplicate of stale lanes.
- Werk docs en tests mee bij wanneer gedrag wijzigt.
- Leg resterende risico's expliciet vast in de PR.

## Relevante commands

Gebruik de commands die de actuele repository en geïnstalleerde Pi-versie daadwerkelijk aanbieden. Verifieer commandnamen via help of de commandregistry; neem geen commando over uit een ontwerpdocument zonder die controle.
