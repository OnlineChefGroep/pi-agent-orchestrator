---
name: real-product-showcase
description: Capture and ship realistic product showcases from real sessions — never synthetic fakes — across terminal/CLI, browser, desktop, and mobile. Use when the user asks for real demos, showcase GIFs/MP4s, hero videos, asciinema/Remotion recordings, browser walkthroughs, app recordings, README/PR media, or says no namaak / fully realistic / complete showcase. Also use after UI changes when regenerating marketing or docs visuals.
license: MIT
compatibility: Works in Pi, Cursor, and other Agent Skills hosts. Repo-local pipeline commands in this package are authoritative when present; otherwise apply the surface-specific references generically.
metadata:
  author: OnlineChefGroep
  version: "1.0.0"
  source: "Derived from OnlineChefGroep real-session showcase practice; authored with skill-creator progressive-disclosure patterns."
---

# Real product showcase

Ship proof that the product works by recording a real session, then cutting and verifying media. Do not invent UI frames, mock dashboards, or scripted "looks like Pi" renderers for hero assets when the user wants realistic output.

## Non-negotiables

1. **Real session first.** Drive the actual CLI, browser app, or native app. Capture that session.
2. **Full chrome visible.** Terminal prompt bar, browser URL/toolbar, or app chrome must remain in frame. If viewers cannot tell what product this is, the crop failed.
3. **Named scenes.** Mark skill → subagent → dashboard → handoff (or the product's equivalent beats) so one capture yields a master plus focused clips.
4. **Smooth delivery.** Prefer 1080p H.264 `yuv420p` at 30–60 fps. Reject 1 fps slideshows and GIF-as-master for hero videos.
5. **Verify before ship.** Probe codec/resolution/fps, watch for clipped chrome, and confirm each clip reaches a successful result.

## Surface selection

| Surface | Capture | Read next |
|---------|---------|-----------|
| Terminal / Pi CLI / TUI | asciinema v3 + markers → Remotion or agg | [references/terminal-asciinema.md](references/terminal-asciinema.md) |
| Browser / web app | Playwright/CDP or screen record of real UI | [references/browser-capture.md](references/browser-capture.md) |
| Desktop / mobile apps | OS recorder or device farm + scene markers | [references/desktop-mobile-apps.md](references/desktop-mobile-apps.md) |
| Post-production | Scene trim, 60 fps master, framing fit | [references/remotion-post.md](references/remotion-post.md) |
| Quality gates | ffprobe, framing checks, clip contracts | [references/quality-gates.md](references/quality-gates.md) |

Pick one primary surface. Do not mix fake terminal frames into a "browser" story or vice versa.

## Workflow (all surfaces)

### 1. Define the story beats

Write 3–6 beats that prove the product. Example for this orchestrator:

1. Create a skill
2. Create / spawn a subagent
3. Open live dashboard / top
4. Show structured handoff success

Each beat needs a visible success signal (file created, agent running, handoff JSON, green status).

### 2. Prepare a disposable real runtime

- Use the real binary / URL / build under test (current package version, not an old tag).
- Prefer an isolated home/profile/session dir so the recording does not leak secrets.
- Pre-stage fixtures the model or UI needs (skill markdown, seed data) when the live model is unreliable; still execute the real create/copy/run path on camera.

### 3. Record with scene markers

- Start the native recorder for that surface.
- Insert a marker at the start of each beat (asciinema `m` events, chapter markers, or a spoken/on-screen slate).
- Keep typing/idle short; cut long waits in post. Do not crop the chrome to "save space."

### 4. Post-produce

- Label markers in required order.
- Time-compress idle without dropping scenes.
- Fit typography / viewport so every captured row/pixel of chrome stays visible.
- Render master + one clip per beat.

### 5. Quality gate and publish

- Run [references/quality-gates.md](references/quality-gates.md).
- Copy reviewable artifacts beside the PR.
- Update changelog / asset map only when tracked docs expect it.
- Keep GIF as fallback or social accessory, not the canonical hero.

## This repository (worked example)

When operating inside `pi-agent-orchestrator`:

```bash
# Real marked cast → 60fps master + clips
npm run showcase:label-scenes -- /path/to/real-session.cast
npm run showcase:remotion -- /path/to/real-session.cast
npm run showcase:verify-media

# Fast CI-safe GIFs only (not a substitute for real hero video)
npm run showcase:ci
```

Canonical assets live under `docs/images/`:

- `dashboard_preview.mp4` — master
- `showcase_skill_creation.mp4`
- `showcase_subagent_run.mp4`
- `showcase_dashboard_top.mp4`
- `showcase_handoff.mp4`

Repo-local agent shortcut: `.agents/skills/showcase` for pipeline commands; this skill owns the realism rules across surfaces.

## Failure modes to refuse

- Synthetic dashboard frames sold as a live Pi session
- Prompt bar / URL bar / navigation chrome cropped out
- One long prompt-typing clip with no successful agent/UI result
- Master video that is actually a low-fps GIF upscale
- Markers missing so clips cannot be cut from one capture

## Done criteria

Report:

1. Surface used and capture path
2. Scene list with durations
3. Output files + ffprobe summary
4. Explicit confirmation that product chrome is visible and each beat succeeded
