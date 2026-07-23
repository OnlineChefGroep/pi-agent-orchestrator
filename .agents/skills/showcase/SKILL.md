---
name: showcase
trigger: /showcase
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

## When To Use Each Pipeline

- **CI / PR checks:** `npm run showcase:ci` (Programmatic) — no external deps, fast, deterministic
- **README hero:** Tmux or Remotion — polished, compressed, scene-labeled
- **Quick demo GIF:** Programmatic — smallest files, CI-safe
- **Full terminal recording:** Tmux — realistic typing, ANSI transitions, ~60s compressed output
- **Social media / docs:** VHS — stylized terminal aesthetic

## Environment Variables

```bash
export SHOWCASE_FIDELITY=inspect   # compact | standard | inspect
export DROID_PLUGIN_ROOT=~/OrgChefgroep/pi-agent-control-extension
export SHOWCASE_FONT=/path/to/font.ttf   # override auto-detected font
export SHOWCASE_NO_TITLES=1              # skip drawtext overlays (CI)
```

## What You Must Do When Invoked

### Step 0 — Realism rules (when the user wants real / complete demos)

If the user asks for realistic, complete, non-fake, or multi-surface demos (terminal, browser, apps), also load the native skill [`skills/real-product-showcase/SKILL.md`](../../../skills/real-product-showcase/SKILL.md) and follow its chrome / marker / quality-gate rules. Programmatic GIFs are not a substitute for a real hero capture in that case.

### Step 1 — Load detailed pipeline reference

Read [references/details.md](references/details.md) for pipeline implementation details, asset map, update workflow, and troubleshooting.

Execute the pipeline from that reference file as appropriate for the user's request.

### Step 2 — Final output

After the pipeline completes, report what was generated and where assets live (`docs/images/`). If the user asked for a specific pipeline, confirm success and show file sizes.
