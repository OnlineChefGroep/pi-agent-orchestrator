# Post-production

Take one marked real capture. Cut a master and short clips. Do not invent frames.

## Goals

- Keep every scene from the capture
- Compress idle so the hero stays short
- Keep product chrome (scale to fit, do not crop identity away)
- Emit H.264 files people can review

## This package

```bash
npm run showcase:label-scenes -- /path/to/real-session.cast
npm run showcase:remotion -- /path/to/real-session.cast
npm run showcase:verify-media
```

| File | Job |
|------|-----|
| `scripts/lib/showcase-cast.mjs` | Parse asciicast, cap idle, normalize scene times |
| `showcase/remotion/scripts/capture-terminal.mjs` | Build `showcase.json` frames |
| `showcase/remotion/src/PiTerminalShowcase.tsx` | 1080p terminal composition |
| `showcase/remotion/src/terminal-layout.ts` | Fit font size to captured rows |
| `scripts/verify-showcase-media.mjs` | Codec, fps, scene contract |

## Timeline

- Cap scene length by compressing idle (about 10s skill, 12s subagent, 10s dashboard, 8s handoff). Do not delete markers.
- You may trim prelude before the first marker.
- Keep timestamps stable (`roundTime` style) so tests do not flake.

## Framing

- The video canvas size is not the cast row count. The content must still show every row.
- `fontSize = contentHeight / (rows * lineHeight)`.
- After chrome padding or height changes, re-render and check the prompt, URL, or app bar by eye.

## Encoding

If the renderer emits `yuvj420p`:

```bash
ffmpeg -y -i in.mp4 -vf "scale=in_range=pc:out_range=tv" \
  -c:v libx264 -pix_fmt yuv420p -color_range tv -an -movflags +faststart out.mp4
```

Hero target: 1920×1080, 60 fps (or 30 if the source is 30), H.264, `yuv420p`.

## Browser and app takes

Same cut logic without Remotion: marker sidecar, edit list, ffmpeg segment extract, concat master. Remotion is polish. It is not permission to replace the capture with fake UI.
