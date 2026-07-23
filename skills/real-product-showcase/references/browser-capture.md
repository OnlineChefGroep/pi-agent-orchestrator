# Browser / web app capture

Use this when the product truth is a web UI: docs site, dashboard SPA, admin console, marketing flows.

## Tooling

| Tool | Role |
|------|------|
| Playwright / Puppeteer / CDP | Deterministic navigation + video |
| Cursor `RecordScreen` / OS screen record | Manual exploratory passes |
| `ffmpeg` | Normalize fps, crop, encode |

Prefer an automated browser harness when the path is repeatable. Prefer screen recording when the story needs human pacing or auth that automation cannot hold.

## Recording recipe

1. Boot the **real** app (local preview, staging, or production read-only). No Storybook fakes for hero claims.
2. Set a fixed viewport (e.g. 1440×900 or 1920×1080). Lock device scale factor to 1 unless retina is intentional.
3. Keep **browser chrome in frame** when the story is "using the product in a browser": URL bar, tab title, or a clearly labeled in-app top bar. If you record viewport-only, show an unmistakable product header/logo in the first second.
4. Mark beats with one of:
   - Playwright `page.evaluate` injecting a visible slate (`SCENE: checkout`) for 0.4s
   - Chapter timestamps written to a sidecar JSON as you go
   - Keyboard hotkey overlays if using an interactive recorder
5. Exercise the real controls: click, type, wait for network-idle or a specific selector that proves success.

## Scene design for web

Typical beat set:

1. Land on product
2. Perform the core action
3. Show the live result state
4. Show the durable outcome (saved record, share link, export)

Each beat needs a selector or text assertion you can cite in the PR.

## Post

- Cut on markers; discard login/typing dead air.
- Encode H.264 `yuv420p` 30–60 fps; strip audio unless narration is required.
- Export a poster frame that still shows product chrome.

## Anti-patterns

- Component-story screenshots chained into a "demo video"
- Cropping away the URL/product shell so it could be any site
- Cursor-only motion with no state change
- Dark-mode purple gradient filler instead of the real app surface
