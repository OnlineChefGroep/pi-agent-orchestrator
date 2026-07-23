---
name: real-product-showcase
description: Record real product demos from terminal, browser, or apps and ship them as verified media. Never use fake or synthetic UI for hero assets. Use when the user asks for real demos, hero MP4s/GIFs, asciinema or Remotion recordings, browser walkthroughs, app recordings, README/PR media, or says no namaak / fully realistic / complete showcase. Also use after UI changes when regenerating marketing or docs visuals.
license: MIT
compatibility: Works in Pi, Cursor, and other Agent Skills hosts. When this package has local pipeline commands, those win. Otherwise use the surface references as written.
metadata:
  author: OnlineChefGroep
  version: "1.0.0"
---

# Real product showcase

Record the real product. Cut the tape. Check that viewers can still tell what product it is.

If someone wants a realistic demo, do not invent UI frames, mock dashboards, or "looks like Pi" renderers for the hero clip.

## Hard rules

1. **Record the real thing.** Drive the actual CLI, web app, or native app. Capture that session.
2. **Keep the chrome.** Terminal prompt bar, browser URL bar, or app title bar must stay in frame. If you cannot tell which product it is, the crop failed.
3. **Mark the beats.** Tag each proof step (for this package: skill, subagent, dashboard, handoff) so one take becomes a master plus short clips.
4. **Ship smooth video.** Prefer 1080p H.264 `yuv420p` at 30 or 60 fps. Reject 1 fps slideshows. Do not promote a GIF as the master hero.
5. **Check before you publish.** Probe codec, size, and fps. Confirm chrome is uncut and each clip ends on a real success.

## Which surface

| Surface | Capture | Read next |
|---------|---------|-----------|
| Terminal / Pi CLI / TUI | asciinema v3 + markers, then Remotion or agg | [references/terminal-asciinema.md](references/terminal-asciinema.md) |
| Browser / web app | Playwright/CDP or a screen record of the live UI | [references/browser-capture.md](references/browser-capture.md) |
| Desktop / mobile apps | OS or device recorder + scene markers | [references/desktop-mobile-apps.md](references/desktop-mobile-apps.md) |
| Post | Trim scenes, fit framing, render 60 fps master | [references/remotion-post.md](references/remotion-post.md) |
| Checks | ffprobe, framing stills, clip contracts | [references/quality-gates.md](references/quality-gates.md) |

Pick one surface. Do not stitch fake terminal frames into a browser story.

## Workflow

### 1. Write the beats

List 3 to 6 steps that prove the product works. For this orchestrator that usually means:

1. Create a skill
2. Spawn a subagent
3. Open the live dashboard or top view
4. Show a finished handoff

Every beat needs a visible win: file on disk, running agent id, handoff JSON, green status.

### 2. Set up a disposable runtime

- Use the real binary, URL, or build you claim to show. Current package version, not an old tag.
- Isolate home/profile/session so secrets stay out of the tape.
- If the model is flaky, pre-stage fixtures, but still run the real create/copy/run path on camera.

### 3. Record with markers

- Start the recorder for that surface.
- Drop a marker at the start of each beat (asciinema `m`, chapter mark, or a short on-screen slate).
- Keep typing and idle short. Cut waits later. Do not crop chrome to make glyphs bigger.

### 4. Cut and render

- Label markers in order.
- Compress idle. Keep every scene.
- Fit typography or viewport so every captured row stays visible.
- Render one master and one clip per beat.

### 5. Gate and publish

- Follow [references/quality-gates.md](references/quality-gates.md).
- Drop review artifacts next to the PR.
- Update changelog or asset maps only when tracked docs expect it.
- GIF is fine for social or fallback. It is not the hero.

## This repo

Inside `pi-agent-orchestrator`:

```bash
npm run showcase:label-scenes -- /path/to/real-session.cast
npm run showcase:remotion -- /path/to/real-session.cast
npm run showcase:verify-media

# CI GIFs only. Not a stand-in for a real hero take.
npm run showcase:ci
```

Files under `docs/images/`:

- `dashboard_preview.mp4` (master)
- `showcase_skill_creation.mp4`
- `showcase_subagent_run.mp4`
- `showcase_dashboard_top.mp4`
- `showcase_handoff.mp4`

`.agents/skills/showcase` knows the local commands. This skill owns the realism rules.

## Refuse these

- Synthetic dashboard frames sold as a live Pi session
- Prompt bar, URL bar, or nav chrome cut off
- Long typing with no agent or UI result
- A "master" that is a stretched low-fps GIF
- Missing markers, so you cannot cut clips from one take

## Done when you can report

1. Surface and capture path
2. Scenes and durations
3. Output files plus ffprobe summary
4. That product chrome is visible and each beat actually succeeded
