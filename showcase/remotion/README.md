# Remotion showcase

This package renders the terminal demo and the reusable promo-media set for
`@onlinechefgroep/pi-agent-orchestrator`.

The compositions do not contain hand-written product claims. Before rendering,
`scripts/extract-promo-data.mjs` reads the repository package metadata, the
README capability and agent tables, the prompt-compression level table, and the
ASCII architecture diagram. It writes the normalized snapshot to
`public/promo-data.json`.

## Compositions

| ID | Type | Output |
| --- | --- | --- |
| `PiAgentTerminal` | video | `docs/images/dashboard_preview.mp4` |
| `PiAgentTerminalPoster` | still | `docs/images/dashboard_preview.png` |
| `PromoBanner` | still, 1280×640 | `docs/images/promo_banner.png` |
| `PromoSocialCard` | still, 1200×630 | `docs/images/social_preview.png` |
| `ArchitectureDiagram` | still, 1920×1080 | `docs/images/architecture_overview.png` |
| `FeatureTour` | video, dynamic duration | `docs/images/feature_tour.mp4` |

## Commands

From the repository root:

```bash
npm run showcase:remotion
```

For focused work inside this directory:

```bash
npm install
npm run promo:data
npm run promo:data:check
npm run typecheck
npm run studio
npm run promo:all
```

`promo:data:check` ignores only the volatile `generatedAt` value. Every product
claim, table row, and architecture line must otherwise match the canonical
repository documents.

See `references/remotion-conventions.md` for visual and rendering invariants.
