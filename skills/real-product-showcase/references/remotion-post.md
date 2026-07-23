# Post-production (Remotion and friends)

Turn one marked real capture into a master plus focused clips without inventing frames.

## Goals

- Keep every scene from the capture
- Compress idle so the story fits a short hero length
- Preserve product chrome (scale/fit; do not crop identity away)
- Emit reviewable H.264 assets

## This package pipeline

```bash
npm run showcase:label-scenes -- /path/to/real-session.cast
npm run showcase:remotion -- /path/to/real-session.cast
npm run showcase:verify-media
```

Key modules:

| File | Job |
|------|-----|
| `scripts/lib/showcase-cast.mjs` | Parse asciicast, idle caps, scene timeline normalize |
| `showcase/remotion/scripts/capture-terminal.mjs` | Build `showcase.json` frames |
| `showcase/remotion/src/PiTerminalShowcase.tsx` | Compose 1080p terminal film |
| `showcase/remotion/src/terminal-layout.ts` | Fit font size to captured rows |
| `scripts/verify-showcase-media.mjs` | Codec / fps / scene contract |

## Timeline rules

- Cap per-scene duration (skill ~10s, subagent ~12s, dashboard ~10s, handoff ~8s) by time-compressing idle, not by deleting markers.
- Prelude before the first marker may be trimmed.
- Floating timestamps must stay stable (`roundTime` style) so tests do not flake.

## Framing rules

- Video canvas is independent of capture rows; **content** must still show all rows.
- Derive `fontSize` from `contentHeight / (rows * lineHeight)`.
- After changing chrome padding/height, re-render and visually confirm the prompt/URL/app bar.

## Encoding

Normalize with ffmpeg when the renderer emits `yuvj420p`:

```bash
ffmpeg -y -i in.mp4 -vf "scale=in_range=pc:out_range=tv" \
  -c:v libx264 -pix_fmt yuv420p -color_range tv -an -movflags +faststart out.mp4
```

Target for heroes: **1920×1080**, **60 fps** (or 30 if source is 30), **H.264**, **yuv420p**.

## Multi-surface note

Browser/app captures follow the same cut logic even without Remotion: marker sidecar → edit decision list → ffmpeg segment extracts → concat master. Remotion is optional polish, not a license to replace the capture with synthetic UI.
