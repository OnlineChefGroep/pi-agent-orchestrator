# Motion profiles

The orchestrator uses a compact motion language rather than one generic loading spinner. Motion communicates three things independently:

1. **Agent identity** — known agent families keep a recognizable visual signature.
2. **Runtime role** — queue, tool activity, swarm coordination, scheduler and handoff each use a dedicated motion channel.
3. **Accessibility preference** — `reduced` freezes semantic glyphs and `none` removes them without hiding state text.

## Profiles

| Profile | Behaviour | Recommended use |
|---|---|---|
| `orchestrator` | Semantic agent identities plus role-specific orchestration motion | Default full dashboard experience |
| `signals` | Scanlines, signal bars, matrix/cascade and telemetry-oriented movement | Dense operational monitoring |
| `minimal` | Restrained dots and geometric movement | Low-distraction terminals |
| `reduced` | Semantic glyphs remain visible but do not advance | Accessibility, screen recording and slow terminals |
| `braille`, `dots`, `lines`, `classic` | One consistent legacy spinner style | Strict visual uniformity or compatibility |
| `none` | Motion glyphs are omitted | Fully static/plain output |

Select a profile from `/agents → Settings → Motion profile`. The menu includes a compact preview and persists the value in `.pi/subagents.json` as `animationStyle`.

## Default semantic identities

The `orchestrator` profile recognizes common agent-family names before falling back to deterministic ID hashing:

| Agent family | Motion identity | Meaning |
|---|---|---|
| Explore, research, search, scan | `radar` | discovery and coverage |
| Plan, architect, design | `lattice` | structure and decomposition |
| Analysis, audit, diagnose | `signal` | evidence and telemetry |
| Coder, implementor, builder, engineer | `forge` | construction |
| Reviewer, critic, inspector | `aperture` | inspection |
| Validator, test, QA, verify | `prism` | verification |
| Security, sentinel, threat | `sentinel` | watch and defence |
| Orchestrator, lead, manager, coordinator | `reactor` | coordination core |
| Compressor, summarizer, handoff | `weave` | synthesis and transfer |

Custom agent names that do not match a family still receive a stable style derived from their agent ID. Selecting `signals`, `minimal` or a direct legacy style intentionally overrides these identities.

## Runtime channels

- Running agent rows use agent identity motion.
- Queued work uses the profile's queue channel.
- Tool activity uses the tool channel.
- Dashboard headers use the coordination-core channel.
- Swarms, scheduler jobs and result handoffs each use their own role mapping.
- Phase offsets prevent a fleet from moving in lockstep.

## Rendering guarantees

- Dashboard-safe frames occupy one terminal cell to prevent horizontal jitter.
- The compact widget refreshes at 160 ms while work is active and returns to a 1000 ms idle cadence.
- `reduced` freezes the selected semantic frame rather than replacing state with a generic marker.
- `none` suppresses glyphs while preserving labels, counts, status, success/error markers and progress information.
- Compact widget, full dashboard and Agent Top use the same profile resolver.
