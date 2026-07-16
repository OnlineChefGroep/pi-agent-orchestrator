# Remotion conventions

## Source of truth

Generated media must reflect repository content, not a parallel marketing copy
store. `scripts/extract-promo-data.mjs` owns the extraction contract:

- package name, version, description, and repository URL: `package.json`;
- core capabilities and built-in agent types: `README.md`;
- compression levels: `docs/prompt-compression.md`;
- architecture diagram: `docs/architecture.md`.

When those documents change, run `npm run promo:data` and commit the regenerated
JSON snapshot with the source change.

## Visual identity

Colors in `src/theme.ts` mirror `site/index.html`. Do not introduce composition-
specific brand colors. Semantic status colors are limited to `accent`, `ok`,
`warn`, and `error`.

Inter is used for prose and display typography. JetBrains Mono is used for
commands, status labels, diagrams, counters, and terminal chrome. Fonts load at
the module boundary through `@remotion/google-fonts`; compositions must not add
raw `<link>` tags or depend on system font availability.

## Motion

Animations must be frame-derived and deterministic. Use Remotion's `spring`,
`interpolate`, `Sequence`, and `useCurrentFrame`; do not use CSS transitions,
random values, wall-clock timers, or DOM animation APIs.

The feature tour duration is calculated from the current number of extracted
capabilities. Adding or removing a README capability must not truncate the video
or leave dead frames.

## Rendering

All H.264 output uses `yuv420p` for broad browser and social-platform support.
The root rendering script accepts `REMOTION_BROWSER_EXECUTABLE` for controlled CI
or server environments. Output paths remain under `docs/images/` so the existing
site staging pipeline can publish selected assets without another media store.
