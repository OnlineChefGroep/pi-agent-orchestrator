# Pi Deep Knowledge Strategy

## Doel

Pi moet de orchestrator correct kunnen gebruiken zonder onnodig grote prompts, verzonnen capabilities of afhankelijkheid van impliciete repositorykennis.

## Kennislagen

1. **Tool schema's** — parameters, invarianten, defaults en foutgedrag van publieke tools.
2. **Loadable skill** — operationele beslisregels in `skills/orchestrator-master/SKILL.md`.
3. **Repository docs** — architectuur, API-reference en migratiespecificaties voor diepere uitleg.
4. **Runtime telemetry** — actuele agents, quotas, schedulerstatus, swarms en circuit-breakerstate.

De runtime blijft de bron van waarheid voor actuele status. Documentatie mag geen live state suggereren.

## Tool-description standaard

Elke publieke tooldescription vermeldt compact:

- wanneer de tool wel en niet gebruikt moet worden;
- verplichte en optionele parameters;
- defaults en limieten;
- side effects en persistence;
- relevante concurrency- of quota-invarianten;
- hoe fouten en partial results terugkomen.

Descriptions verwijzen niet naar interne paden die nog slechts doelarchitectuur zijn.

## Skillstrategie

De `orchestrator-master` skill bevat beslisregels, geen kopie van de volledige codebase. De skill moet:

- single-agent werk niet onnodig opschalen;
- onafhankelijke onderzoekslanes paralleliseren;
- schrijflanes expliciet partitioneren;
- quotas en session limits vooraf respecteren;
- handoffs voorzien van status, bewijs, beslissingen en resterend werk;
- resultaten evalueren voordat nieuwe agents worden gespawned;
- actuele runtimegegevens via tools ophalen in plaats van aannemen.

## Contextbudget

Gebruik progressive disclosure:

- tool schema voor directe uitvoering;
- skill voor orchestrationbeleid;
- gerichte docs alleen wanneer architectuur- of migratiecontext nodig is.

Vermijd het standaard injecteren van complete API-references of handoffpackages in iedere agentprompt.

## Source-grounding

Claims over bestanden, commands, modellen, limits of runtimegedrag moeten herleidbaar zijn tot minimaal één van:

- actuele tooloutput;
- bestaande broncode;
- een committed document dat expliciet als huidige staat is gemarkeerd.

V2-doelstructuren moeten altijd als toekomstig doel worden benoemd.

## Validatie

De integratie is geslaagd wanneer Pi:

- voor eenvoudige taken één agent kiest;
- complexe taken in conflictvrije lanes splitst;
- geen niet-bestaande commands of paden verzint;
- session limits vooraf controleert;
- handoffs compact en reproduceerbaar maakt;
- na partial failure gericht herplant in plaats van blind opnieuw te spawnen.
