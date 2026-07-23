---
name: real-product-showcase
trigger: /real-showcase
description: "Capture realistic product showcases from real terminal, browser, or app sessions (no fake UI). Use for real demos, hero MP4s, asciinema/Remotion, browser walkthroughs, app recordings, or when the user says no namaak / fully realistic showcase."
---

# Real product showcase (Cursor entry)

This is the Cursor-facing entry for the native package skill.

## What You Must Do When Invoked

1. Read and follow [`skills/real-product-showcase/SKILL.md`](../../../skills/real-product-showcase/SKILL.md) immediately.
2. Load only the surface reference you need from `skills/real-product-showcase/references/`:
   - `terminal-asciinema.md` for Pi/CLI/TUI
   - `browser-capture.md` for web apps
   - `desktop-mobile-apps.md` for native/Electron/mobile
   - `remotion-post.md` for cutting/encoding
   - `quality-gates.md` before claiming done
3. Prefer real captures over `npm run showcase:ci` programmatic GIFs whenever the user asks for realistic or complete demos.
4. Never ship a hero video with the product chrome cropped away.
