# Pi Agent Orchestrator — marketing site

Standalone Vite + React + TypeScript frontend for [orchestrator.chefgroep.online](https://orchestrator.chefgroep.online).

## Commands

```bash
npm install --ignore-scripts
npm run dev      # stage assets/docs, start Vite dev server
npm run build    # output to dist/
npm test         # smoke tests
```

## Routes

- `/` — landing page with terminal showcase
- `/showcase` — full media gallery (Remotion, programmatic, tmux, live, VHS)
- `/install` — install instructions
- `/docs` — documentation index (links to staged markdown)
- `/capabilities` — feature overview

## Assets

`scripts/stage-public.mjs` copies showcase media from `docs/images/` and public markdown from the repo into `public/` before dev/build.
