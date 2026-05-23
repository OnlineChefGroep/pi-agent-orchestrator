# TypeScript-Go Integration Analysis

## Overview

The `agent-widget.ts` integrates a Go sidecar process (`cinematic-tui`) for rendering a "cinematic" UI style. The integration uses Node.js `child_process.spawn()` to launch the Go binary and communicates via JSON over stdin.

## 1. Go Sidecar Spawning and Management

### Current Implementation (lines 368-395)

```typescript
if (activeUiStyle === "cinematic") {
  if (!this.sidecar) {
    const extDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const binPath = join(extDir, "cinematic-renderer", "cinematic-tui");
    this.sidecar = spawn(binPath, [], { stdio: ["pipe", "inherit", "inherit"] });
    this.sidecar.on("exit", () => { this.sidecar = undefined; });
  }
  // ...
}
```

### Issues Found

1. **No error handling on spawn failure**: If the binary doesn't exist or isn't executable, `spawn()` may emit an `error` event that's not caught.

2. **No validation of binary existence**: The code assumes the binary exists at the expected path without checking.

3. **Race condition in `exit` handler**: Setting `this.sidecar = undefined` in the `exit` handler could conflict with concurrent `stopSidecar()` calls.

4. **Stdout/stderr inheritance concerns**: Using `"inherit"` for stdout/stderr means the Go process writes directly to the terminal, which could interfere with Pi's TUI rendering.

## 2. JSON State Updates

### Current Implementation (lines 377-388)

```typescript
if (this.sidecar.stdin) {
  const payload = {
    agents: allAgents.map(a => ({
      id: a.id,
      type: a.type,
      role: getDisplayName(a.type),
      status: a.status,
      tokens: this.agentActivity.get(a.id)?.toolUses || 0,
      progress: 50 // Mock progress for now
    }))
  };
  this.sidecar.stdin.write(JSON.stringify(payload) + "\n");
}
```

### Issues Found

1. **No error handling on stdin write**: `stdin.write()` can fail if the pipe is broken (Go process crashed).

2. **Synchronous serialization**: `JSON.stringify()` on large agent lists could block the event loop.

3. **Mock progress value**: `progress: 50` is hardcoded - should be computed dynamically.

4. **Missing agent data**: The `tokens` field uses `toolUses` which is not tokens - misleading naming.

5. **No backpressure handling**: If the Go process can't keep up, stdin buffer could grow unbounded.

## 3. Child Process Lifecycle Issues

### Critical Bug: Missing cleanup in `dispose()`

```typescript
dispose() {
  if (this.widgetInterval) {
    clearInterval(this.widgetInterval);
    this.widgetInterval = undefined;
  }
  if (this.uiCtx) {
    this.uiCtx.setWidget("agents", undefined);
    this.uiCtx.setStatus("subagents", undefined);
  }
  this.widgetRegistered = false;
  this.tui = undefined;
  this.lastStatusText = undefined;
  // BUG: this.stopSidecar() is NOT called!
}
```

**Impact**: When the widget is disposed (extension unload, Pi shutdown), the Go sidecar process is left running as an orphan process.

### Sidecar startup timing

The sidecar is spawned lazily in `renderWidget()`, which is called from the widget's `render()` callback. This means:
- First render might be delayed while the Go process starts
- No feedback if startup fails

### Exit handler cleanup

The `exit` handler is added but never removed:
```typescript
this.sidecar.on("exit", () => { this.sidecar = undefined; });
```

If the process is killed externally and later restarted, multiple handlers could accumulate.

## 4. Cleanup on Exit

### Issues

1. **Orphan process on dispose**: See above - `stopSidecar()` not called in `dispose()`.

2. **No SIGTERM handling**: `kill()` sends SIGTERM by default, but the Go process might not handle it gracefully.

3. **No process tracking**: If multiple instances of `AgentWidget` exist, they could spawn multiple sidecar processes.

4. **stdin not explicitly closed**: Before killing, stdin should be ended properly to signal EOF to the Go process.

## 5. Animation Style Settings

### Implementation (lines 16-38)

```typescript
const SPINNER_FRAMES = {
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  dots: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  lines: ["-", "\\", "|", "/"],
  classic: ["*"],
  none: [""],
};

export function setSpinnerStyle(style: keyof typeof SPINNER_FRAMES) {
  const frames = SPINNER_FRAMES[style] || SPINNER_FRAMES.braille;
  SPINNER.length = 0;
  SPINNER.push(...frames);
}
```

### Issues Found

1. **Global mutable state**: `SPINNER` is exported and mutated by `setSpinnerStyle()`. Multiple concurrent calls could lead to inconsistent state.

2. **Animation style vs UI style confusion**: `animationStyle` (spinner frames) is separate from `uiStyle` (premium/retro/plain/cinematic). The interaction between them is not clearly defined.

3. **Cinematic mode ignores spinner settings**: When `uiStyle === "cinematic"`, the spinner settings are irrelevant since the Go sidecar handles rendering.

4. **setSpinnerStyle not called when settings change**: The `SettingsHooks` interface doesn't include `setSpinnerStyle`, so animation style changes from the UI won't propagate.

## Summary of Critical Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| `dispose()` doesn't call `stopSidecar()` | **CRITICAL** | Orphan processes on shutdown |
| No error handling on spawn | HIGH | Silent failures, hard to debug |
| stdin write without error handling | MEDIUM | Unhandled pipe breaks |
| Mock progress value | MEDIUM | Incorrect UI display |
| Missing `setSpinnerStyle` in hooks | MEDIUM | Animation style settings don't apply |
| stdout/stderr inherit to terminal | LOW | Potential TUI corruption |
| Race condition in exit handler | LOW | Rare but possible undefined behavior |

## Recommended Fixes

### 1. Fix dispose() to stop sidecar

```typescript
dispose() {
  this.stopSidecar();  // ADD THIS LINE
  if (this.widgetInterval) {
    clearInterval(this.widgetInterval);
    this.widgetInterval = undefined;
  }
  // ... rest of dispose
}
```

### 2. Add robust error handling

```typescript
private startSidecar(): void {
  const extDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const binPath = join(extDir, "cinematic-renderer", "cinematic-tui");

  // Check binary exists
  if (!existsSync(binPath)) {
    console.error(`Cinematic renderer not found at ${binPath}`);
    return;
  }

  this.sidecar = spawn(binPath, [], {
    stdio: ["pipe", "inherit", "inherit"],
    detached: false
  });

  this.sidecar.on("error", (err) => {
    console.error(`Sidecar error: ${err.message}`);
    this.sidecar = undefined;
  });

  this.sidecar.on("exit", (code, signal) => {
    console.error(`Sidecar exited: code=${code}, signal=${signal}`);
    this.sidecar = undefined;
  });

  this.sidecar.stdin?.on("error", () => {
    // Pipe broken, will be cleaned up on exit
  });
}
```

### 3. Safe stdin write

```typescript
private sendStateToSidecar(payload: object): void {
  if (!this.sidecar?.stdin?.writable) return;

  try {
    const json = JSON.stringify(payload);
    this.sidecar.stdin.write(json + "\n", (err) => {
      if (err) this.stopSidecar();
    });
  } catch (err) {
    console.error("Failed to serialize sidecar payload:", err);
  }
}
```

### 4. Proper sidecar shutdown

```typescript
private stopSidecar() {
  if (!this.sidecar) return;

  const proc = this.sidecar;
  this.sidecar = undefined;

  // Close stdin to signal EOF
  if (proc.stdin?.writable) {
    proc.stdin.end();
  }

  // Give graceful shutdown time, then force
  const timeout = setTimeout(() => {
    proc.kill("SIGKILL");
  }, 1000);

  proc.on("exit", () => {
    clearTimeout(timeout);
  });

  proc.kill("SIGTERM");
}
```

### 5. Add animation style to settings hooks

In `settings.ts`, add to `SettingsHooks`:

```typescript
export interface SettingsHooks {
  // ... existing hooks
  setAnimationStyle: (style: AnimationStyle) => void;
}
```

And ensure it's wired up in `applySettings()`.

## Go Sidecar Recommendations

The Go code in `main.go` is functional but could benefit from:

1. **Proper EOF handling**: Return `tea.Quit` when stdin closes
2. **Error logging**: Log JSON parse errors for debugging
3. **Graceful shutdown**: Handle SIGTERM/SIGINT properly

```go
func listenForStateUpdates() tea.Cmd {
    return func() tea.Msg {
        scanner := bufio.NewScanner(os.Stdin)
        if scanner.Scan() {
            line := scanner.Text()
            var state AgentState
            if err := json.Unmarshal([]byte(line), &state); err != nil {
                // Log parse errors for debugging
                fmt.Fprintf(os.Stderr, "JSON parse error: %v\n", err)
                return nil
            }
            return stateUpdateMsg(state)
        }
        // EOF - signal shutdown
        if err := scanner.Err(); err != nil {
            fmt.Fprintf(os.Stderr, "stdin error: %v\n", err)
        }
        return tea.Quit
    }
}
```