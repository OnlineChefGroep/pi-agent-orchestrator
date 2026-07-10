# Motion profiles

The orchestrator UI uses semantic motion rather than one shared spinner. Agent rows, queue state, tool activity, swarm coordination, scheduler jobs, dashboard headers, and completion handoffs each receive a role-specific glyph.

## Profiles

| Profile | Behaviour | Recommended use |
|---|---|---|
| `orchestrator` | Deterministic heterogeneous motion using orbit, pipeline, weave, aperture, lattice, prism, ripple and related frames | Default full dashboard experience |
| `signals` | Scanlines, signal bars, matrix/cascade and telemetry-oriented movement | Dense operational monitoring |
| `minimal` | Restrained dots and geometric movement | Low-distraction terminals |
| `reduced` | Semantic glyphs remain visible but do not advance between frames | Accessibility, screen recording, slow terminals |
| `braille`, `dots`, `lines`, `classic` | One consistent legacy spinner style | Backwards compatibility or strict visual uniformity |
| `none` | Motion glyphs are omitted | Fully static/plain output |

Select a profile from `/agents → Settings → Motion profile`. The value persists in `.pi/subagents.json` as `animationStyle`, so existing configuration files remain compatible.

## Rendering guarantees

- Dashboard-safe packs use single-cell frames to prevent horizontal jitter.
- Agent assignment is deterministic from the agent ID.
- Phase offsets prevent a fleet from animating in lockstep.
- Reduced-motion mode freezes the selected semantic frame rather than replacing state with a generic marker.
- `none` suppresses motion but keeps status text, success/error markers, counts and progress information intact.
