---
name: showcase
description: "Generate README and PR showcase visuals for pi-agent-orchestrator. Use when the user asks to create, update, or regenerate showcase GIFs, MP4s, hero videos, or terminal recordings. Examples: \"run the showcase\", \"regenerate the dashboard GIF\", \"create a new hero video\", \"update showcase assets\"."
---

# Showcase Media Pipeline

Generate polished terminal recordings and hero videos for README, PR descriptions, and documentation.

## Available Pipelines

| ID | Command | Output | Dependencies |
|----|---------|--------|--------------|
| **C** Programmatic | `npm run showcase:ci` | `showcase_*.gif`, programmatic hero | `agg`, `ffmpeg`, Node build |
| **A** Live | `npm run showcase:live` | `showcase_live.gif`, `.mp4` | + `asciinema` |
| **T** Tmux | `npm run showcase:tmux` | `showcase_tmux.gif`, `showcase_tmux.mp4` | + `tmux`, `asciinema` |
| **B** Remotion | `npm run showcase:remotion` | `dashboard_preview.mp4` (hero) | + `pi-agent-control-extension` |
| **D** VHS | `npm run showcase:vhs` | `showcase_vhs.gif`, `.mp4` | + `vhs` (Go) |

**Run all:** `npm run showcase` (set `SKIP_LIVE=1` / `SKIP_REMOTION=1` / `SKIP_VHS=1` / `SKIP_TMUX=1` to skip steps).

## Pipeline Details

### C — Programmatic (CI-safe, no external deps beyond agg/ffmpeg)

1. `scripts/generate-showcase-media.mjs` builds asciicast from real `dist/` dashboard, top table, widget code.
2. `scripts/lib/showcase-agg.sh` converts casts with **inspect** fidelity (Pi CLI theme, fontdue renderer).
3. Output: `docs/images/showcase_dashboard.gif`, `showcase_top_view.gif`, `showcase_widget.gif`, `dashboard_preview_programmatic.gif`.

### T — Tmux Recording (recommended for polished output)

1. `scripts/showcase-tmux-recorder.sh` orchestrates a full tmux session:
   - Builds the project, launches tmux, runs `asciinema rec`
   - `scripts/showcase-tmux-scenes.mjs` choreographs 7 scenes with calm pacing and ANSI crossfade transitions
   - Per-character typing with realistic delays
   - Scenes: Dashboard → Help → Top View → Widget → Agent Spawn → Settings → Swarm
2. ffmpeg compresses the ~133s recording to ~60s with `setpts=0.45*PTS`
3. Optional drawtext title card + scene labels (auto-detected; `--no-titles` to skip)
4. Output: `docs/images/showcase_tmux.gif`, `showcase_tmux.mp4`

### A — Live Terminal Playback

1. `scripts/showcase-live-demo.mjs --auto` plays a scripted session on stdout (real renderers, timed "hotkey" hints).
2. `asciinema rec` captures → `/tmp/showcase-live.cast`.
3. Same agg pipeline → `docs/images/showcase_live.gif`.

### B — Remotion Post-Production

Uses `pi-agent-control-extension/scripts/render-showcase.sh`:
- Title / outro, window chrome, keystroke overlays
- Prefers **live** cast, falls back to programmatic hero cast
- Preset: `warm-hero`, fidelity: `inspect`

```bash
export DROID_PLUGIN_ROOT=/path/to/pi-agent-control-extension
npm run showcase:live && npm run showcase:remotion
```

### D — VHS Declarative Tape

`showcase/install-and-agents.tape` — types `npm run build` + live demo in a fresh terminal.

```bash
go install github.com/charmbracelet/vhs@latest
npm run showcase:vhs
```

## Asset Map

| File | Pipeline |
|------|----------|
| `showcase_dashboard.gif` | C |
| `showcase_top_view.gif` | C |
| `showcase_widget.gif` | C |
| `showcase_live.gif` | A |
| `showcase_tmux.gif` / `.mp4` | T |
| `showcase_vhs.gif` | D |
| `dashboard_preview.mp4` | B (or C fallback) |
| `dashboard_preview_programmatic.gif` | C combined cast |

All assets live in `docs/images/`.

## Environment Variables

```bash
export SHOWCASE_FIDELITY=inspect   # compact | standard | inspect
export DROID_PLUGIN_ROOT=~/OrgChefgroep/pi-agent-control-extension
export SHOWCASE_FONT=/path/to/font.ttf   # override auto-detected font
export SHOWCASE_NO_TITLES=1              # skip drawtext overlays (CI)
```

## When To Use Each Pipeline

- **CI / PR checks:** `npm run showcase:ci` (Programmatic) — no external deps, fast, deterministic
- **README hero:** Tmux or Remotion — polished, compressed, scene-labeled
- **Quick demo GIF:** Programmatic — smallest files, CI-safe
- **Full terminal recording:** Tmux — realistic typing, ANSI transitions, ~60s compressed output
- **Social media / docs:** VHS — stylized terminal aesthetic

## Updating Showcase Assets

After any UI changes to the dashboard, top view, or widget:

1. Run `npm run showcase:ci` to regenerate programmatic GIFs (fastest)
2. Run `npm run showcase:tmux` for a polished terminal recording (recommended)
3. Run `npm run showcase` for all pipelines (slowest, most comprehensive)
4. Verify output in `docs/images/` — check file sizes and durations with `ffprobe`
5. Commit the updated GIFs alongside the code changes

## Troubleshooting

- **`drawtext` not available:** ffmpeg was compiled without libfreetype. Use `--no-titles` or install a full ffmpeg (`apt install ffmpeg` on Debian/Ubuntu).
- **Font not found:** Set `SHOWCASE_FONT=/path/to/font.ttf` or install `fonts-dejavu-core`.
- **GIF too large:** Reduce choreography duration or increase compression in `showcase-agg.sh`.
- **Tmux recording fails:** Ensure `tmux` and `asciinema` are installed. Check `showcase-tmux-scenes.mjs` for syntax errors.
