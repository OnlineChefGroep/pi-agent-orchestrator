# Desktop and mobile app capture

Use this when the product is a native or hybrid app: Electron, Tauri, VS Code extension host UI outside the terminal, iOS, Android, or desktop installers.

## Tooling

| Platform | Capture options |
|----------|-----------------|
| macOS | `screencapture` video, QuickTime, `ffmpeg` avfoundation |
| Windows | Xbox Game Bar, OBS, `ffmpeg` dshow/gdigrab |
| Linux | OBS, `ffmpeg` x11grab/PipeWire |
| iOS Simulator | `xcrun simctl io booted recordVideo` |
| Android Emulator | `adb shell screenrecord` / Android Studio recorder |
| VS Code / Electron | Extension host + OS recorder, or Playwright Electron |

## Recording recipe

1. Install or build the **exact version** being advertised.
2. Use a clean profile / guest user when possible.
3. Fix display resolution and color profile; disable OS notifications.
4. Keep **app chrome** visible: title bar, traffic lights/menu, tab strip, or mobile status/navigation where it identifies the product.
5. Mark beats with an on-screen slate, voice note timestamps, or a sidecar JSON of `{t, id, label}` written by the automation driver.
6. Show success inside the app (toast, completed list, saved file in Finder/Explorer only as a secondary proof).

## Automation tips

- Prefer driving the app through its real IPC/CLI when available (Pi commands, extension commands), then record the visible result.
- For store demos, script the happy path; keep one alternate take for a recovery story only if requested.
- Sync clocks if you stitch webcam + app later; default is app-only.

## Mobile specifics

- Prefer simulator/emulator for CI-friendly takes; use a device recording when performance or camera hardware matters.
- Lock to one orientation; do not rotate mid-scene.
- Include the app name in the first frame via splash or navigation title.

## Anti-patterns

- Mockups or Figma prototype recordings labeled as the shipped app
- Cropping the title bar so Electron could be any Chromium shell
- Permission dialogs and notification spam left in the hero take
- Variable refresh / huge idle with no app state change
