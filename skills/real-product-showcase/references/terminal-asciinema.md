# Terminal / CLI / TUI capture

Use this when the product truth lives in a terminal: Pi CLI, dashboards, TUIs, shell workflows.

## Tooling

| Tool | Role |
|------|------|
| `asciinema` **v3+** | Record session; supports live marker hotkey |
| `tmux` (optional) | Bracketed paste, stable pane size, automation |
| Remotion / agg | Post: 60fps MP4 or GIF |
| `ffprobe` | Verify outputs |

Install asciinema v3 if the distro still ships v2 (v2 lacks reliable `add_marker_key`).

Example config (`~/.config/asciinema/config.toml`):

```toml
[session]
add_marker_key = "^x"
```

## Recording recipe

1. Fix cols/rows before start (e.g. `120×36`). Never resize mid-shot unless you also handle resize events in post.
2. Launch the **real** product:

   ```bash
   asciinema rec /tmp/real-session.cast \
     --idle-time-limit 2 \
     --command 'pi --no-session -e ./dist/index.js ...'
   ```

3. At each story beat, fire the marker hotkey (or inject an `m` event).
4. Prefer bracketed paste for multi-line prompts (`tmux paste-buffer -p`) so the CLI receives one prompt, not one line per paste.
5. Stop after the last success signal (handoff verified, dashboard stable).

## Marker contract (this package)

Required scene ids, in order:

1. `skill-creation`
2. `subagent-run`
3. `dashboard-top`
4. `handoff`

Label unlabeled markers:

```bash
npm run showcase:label-scenes -- /tmp/real-session.cast
```

Parse / render:

```bash
npm run showcase:remotion -- /tmp/real-session.cast
```

## Framing rule (critical)

Replay uses the full row count from the cast header. Remotion chrome must **scale font size to `rows`**. A fixed large font inside a short box clips the Pi prompt bar (cwd, model, input line) and makes the clip look like a generic dark rectangle.

Fit math lives in `showcase/remotion/src/terminal-layout.ts` (`fitTerminalTypography`). After layout changes, re-render; do not re-record unless the cast itself is wrong.

## What "good" looks like

- Bottom of frame shows Pi footer: workspace path, token %, model name, prompt/status line
- Title chrome says it is Pi / coding agent
- Skill creation, Agent spawn, `/agents` top view, and handoff each appear as distinct marked scenes
- Idle gaps compressed; no multi-minute thinking stares

## Anti-patterns

- Programmatic dashboard GIF sold as the README hero when the user asked for a real session
- Recording only the prompt input with no tool/agent result
- Cropping bottom rows to enlarge glyphs
- asciinema v2 + undocumented marker hacks
