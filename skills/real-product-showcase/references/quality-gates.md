# Quality gates

Run these before calling a showcase done.

## Technical probe

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt \
  -show_entries format=duration \
  -of default=nw=1 "$FILE"
```

Expect for this package's Remotion heroes:

- `codec_name=h264`
- `width=1920`, `height=1080`
- `pix_fmt=yuv420p`
- `r_frame_rate=60/1` (or documented 30/1)
- duration matches scene budget (±0.1s)

Package gate:

```bash
npm run showcase:verify-media
```

## Framing / identity check

Extract 1–3 stills and inspect (or send to a video/image reviewer):

```bash
ffmpeg -y -ss 8 -i docs/images/dashboard_preview.mp4 -frames:v 1 /tmp/frame.png
```

Pass only if:

1. Product chrome is readable (Pi prompt bar, browser URL/app title, or equivalent).
2. No bottom/top clip of that chrome.
3. Text is legible at 1080p.
4. The frame could not reasonably be mistaken for a different product after removing surrounding marketing labels.

## Story check

For each clip:

| Clip | Must show |
|------|-----------|
| skill-creation | Real skill file create/copy success |
| subagent-run | Real Agent / subagent start with id/status |
| dashboard-top | Live `/agents` or top view updating |
| handoff | Structured handoff / completed proof |

Reject clips that only show typing into an empty prompt.

## Publish checklist

- [ ] Master + per-scene clips on disk
- [ ] `showcase:verify-media` (or equivalent) green
- [ ] Framing stills reviewed
- [ ] Artifacts copied for PR review
- [ ] Tracked docs/changelog updated when required
- [ ] No secrets in the recording (API keys, private URLs, home paths with tokens)
