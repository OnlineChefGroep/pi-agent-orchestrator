# Showcase Pipeline Details

Detailed pipeline documentation for the showcase media generation system. Loaded on-demand when the agent invokes `/showcase`.

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
