# Showcase media pipeline

Four complementary paths to generate README / PR visuals for v0.11.0.

| ID | Command | Output | Needs |
|----|---------|--------|-------|
| **C** CI-safe | `npm run showcase:ci` | `showcase_*.gif`, programmatic hero | `agg`, `ffmpeg`, Node build |
| **A** Live | `npm run showcase:live` | `showcase_live.gif`, `.mp4` | + `asciinema` |
| **B** Remotion | `npm run showcase:remotion` | `dashboard_preview.mp4` (hero) | + `pi-agent-control-extension` |
| **D** VHS | `npm run showcase:vhs` | `showcase_vhs.gif`, `.mp4` | + `vhs` (Go) |

**All four:** `npm run showcase` (set `SKIP_LIVE=1` / `SKIP_REMOTION=1` / `SKIP_VHS=1` to skip steps).

## C — Programmatic (dist renderers)

1. `scripts/generate-showcase-media.mjs` builds asciicast from real `dist/` dashboard, top table, widget code.
2. `scripts/lib/showcase-agg.sh` converts casts with **inspect** fidelity (Pi CLI theme, fontdue renderer).

## A — Live terminal playback

1. `scripts/showcase-live-demo.mjs --auto` plays a scripted session on stdout (real renderers, timed “hotkey” hints).
2. `asciinema rec` captures → `/tmp/showcase-live.cast`.
3. Same agg pipeline → `docs/images/showcase_live.gif`.

Optional: use `tuistory` + `tctl` from `pi-agent-control-extension` for full Pi host sessions when peer deps are available.

## B — Remotion post-production

Uses `pi-agent-control-extension/scripts/render-showcase.sh`:

- Title / outro, window chrome, keystroke overlays
- Prefers **live** cast, falls back to programmatic hero cast
- Preset: `warm-hero`, fidelity: `inspect`

```bash
export DROID_PLUGIN_ROOT=/path/to/pi-agent-control-extension
npm run showcase:live && npm run showcase:remotion
```

## D — VHS declarative tape

`showcase/install-and-agents.tape` — types `npm run build` + live demo in a fresh terminal.

```bash
go install github.com/charmbracelet/vhs@latest
npm run showcase:vhs
```

## Asset map

| File | Source |
|------|--------|
| `showcase_dashboard.gif` | C |
| `showcase_top_view.gif` | C |
| `showcase_widget.gif` | C |
| `showcase_live.gif` | A |
| `showcase_vhs.gif` | D |
| `dashboard_preview.mp4` | B (or C fallback) |
| `dashboard_preview_programmatic.gif` | C combined cast |

## Environment

```bash
export SHOWCASE_FIDELITY=inspect   # compact | standard | inspect
export DROID_PLUGIN_ROOT=~/OrgChefgroep/pi-agent-control-extension
```