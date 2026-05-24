# Cinematic Dashboard Sidecar

> Go-based TUI renderer for the cinematic agent widget. Communicates with the TypeScript host via JSON over stdin.

---

## Overview

When the user sets UI style to `"cinematic"` in `/agents` → Settings, `src/ui/agent-widget.ts` spawns this binary as a child process. The TypeScript host sends a JSON payload every tick; the Go renderer produces a rich terminal UI.

---

## Architecture

```
┌─────────────────┐      JSON payload      ┌──────────────────┐
│  TypeScript     │ ────────stdin────────> │  Go sidecar      │
│  agent-widget.ts│   {agents, tokens,     │  cinematic-tui   │
│                 │    activity, style}     │                  │
│                 │ <──────stdout────────── │                  │
│                 │    ANSI-rendered TUI    │                  │
└─────────────────┘                        └──────────────────┘
```

### JSON Payload Format

```ts
interface CinematicPayload {
  agents: Array<{
    id: string;
    name: string;
    status: "running" | "completed" | "failed";
    description: string;
    spinner: string;        // Current spinner frame
    duration: string;       // Formatted duration
    tokens: number;
    turns: number;
    activity?: string;      // Latest activity text
  }>;
  showActivityStream: boolean;
  showTokenUsage: boolean;
  showTurnProgress: boolean;
}
```

---

## Building

### Prerequisites

- Go 1.22+

### Build

```bash
cd cinematic-renderer

# Build native binary
go build -o cinematic-tui ./...

# Or build for all platforms
GOOS=linux GOARCH=amd64 go build -o cinematic-tui-linux ./...
GOOS=darwin GOARCH=amd64 go build -o cinematic-tui-darwin ./...
GOOS=windows GOARCH=amd64 go build -o cinematic-tui.exe ./...
```

### Verify

```bash
go vet ./...
go test ./...
go build ./...
```

---

## Development

### Project Structure

```
cinematic-renderer/
  main.go                    # Entry point, stdin reader, render loop
  go.mod / go.sum             # Dependencies
  internal/
    widget/                   # Bubble Tea model and rendering logic
      model.go                # State management
      view.go                 # Render functions
      update.go               # Message handling
```

### Running Locally

```bash
go run ./...
# Then paste JSON payloads into stdin, or pipe from a test file:
cat test_payload.json | go run ./...
```

### Testing

```bash
go test ./... -v
```

Tests cover:
- JSON parsing of payloads
- Graceful handling of invalid/malformed JSON
- Terminal resize handling
- Empty agent list rendering

---

## Dependencies

- `github.com/charmbracelet/bubbletea` — TUI framework
- `github.com/charmbracelet/lipgloss` — Styling
- `github.com/charmbracelet/bubbles` — Common TUI components

These are managed via Go modules (`go.mod`).

---

## Integration with TypeScript Host

### Spawning

From `src/ui/agent-widget.ts`:

```ts
import { spawn } from "child_process";
import { dirname, join } from "path";

const sidecarPath = join(extDir, "cinematic-renderer", "cinematic-tui");
this.sidecar = spawn(sidecarPath, [], { stdio: ["pipe", "pipe", "pipe"] });
```

### Communication

```ts
const payload = {
  agents: agentList.map(a => ({...})),
  showActivityStream: isShowActivityStream(),
  showTokenUsage: isShowTokenUsage(),
  showTurnProgress: isShowTurnProgress(),
};

this.sidecar.stdin.write(JSON.stringify(payload) + "\n");
```

### Shutdown

```ts
this.sidecar.kill();
this.sidecar = undefined;
```

---

## Troubleshooting

### Binary not found

Ensure `cinematic-tui` (or `cinematic-tui.exe` on Windows) exists in `cinematic-renderer/`. It is ignored by git (see `.gitignore`) and must be built locally.

### No output appearing

The sidecar writes to stdout. The TypeScript host reads stdout and displays it. If using directly from terminal, output should appear immediately.

### ANSI colors not showing

Set `TERM=xterm-256color` in your environment.

---

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) includes a Go job:

```yaml
go:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with: { go-version: '1.22' }
    - run: cd cinematic-renderer && go vet ./... && go build ./... && go test ./...
```
