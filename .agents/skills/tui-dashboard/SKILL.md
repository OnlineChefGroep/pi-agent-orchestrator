---
name: tui-dashboard
description: "Develop and debug the TUI dashboard, widget, and rendering pipeline in pi-agent-orchestrator. Covers virtual scrolling, render performance, vim-hotkey interactions, theme system, and animation primitives. Use when modifying dashboard UI, fixing rendering issues, or optimizing TUI performance."
---

# TUI Dashboard Development

This skill covers the terminal UI components specific to pi-agent-orchestrator.

## Component Hierarchy

```
AgentDashboard (src/ui/agent-dashboard.ts)
├── AgentDashboardRenderer (src/ui/agent-dashboard-renderer.ts)
│   ├── Header (running/queued/completed counts)
│   ├── Body (virtual scrolling agent list)
│   │   ├── CompactRow
│   │   ├── RunningCard
│   │   └── SwarmSection
│   ├── Detail Panel (selected agent metadata)
│   └── Footer (help hints)
├── AgentTopRenderer (src/ui/agent-top-renderer.ts)
│   └── Top table with sorting and pagination
└── AgentWidget (src/ui/agent-widget.ts)
    └── WidgetRenderer (src/ui/agent-widget-renderer.ts)
        └── Virtual scrolling with safety caps
```

## Performance Architecture

### Dashboard (v2)

**Adaptive refresh rates:**
- Running agents: 200ms (5 fps)
- Idle: 750ms (configurable via `dashboardRefreshInterval`)
- Very large lists (>50 agents): 150ms (6.7 fps)
- Turbo mode: 100ms (10 fps)

**Render optimization:**
- Dirty flag tracks structural changes (agent IDs, statuses)
- Memoized theme/box chars until UI style changes
- Coalesced debounce: 16ms cap on rapid spawns
- Agent snapshot: lightweight structural hash for change detection
- Minimum render gap: 16ms (60 fps cap)

### Virtual Scrolling

Widget uses virtual scrolling with `VIRTUAL_WINDOW` (default 50):

```typescript
// Only render visible window, not entire list
const visibleAgents = agents.slice(scrollOffset, scrollOffset + VIRTUAL_WINDOW);
```

**Safety limits:**
- Batch safety cap on spawn notifications
- Debounced widget updates (16ms)
- Structural snapshot comparison before re-render

### Render Metrics

`RenderMetrics` class tracks per-frame timing:

```typescript
const metrics = new RenderMetrics();
metrics.recordRender(startTime, endTime, agentCount);
const snapshot: RenderMetricsSnapshot = metrics.snapshot();
// { totalMs, count, avgMs, maxMs, p95Ms, agentsAtMax }
```

## Vim Hotkeys

Dashboard supports vim-style navigation:

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate down/up |
| `Enter` | Intervene (open conversation) |
| `K` | Terminate selected agent |
| `v` | Toggle multi-select |
| `p` | Show permissions |
| `w` | Show swarm topology |
| `t` | Toggle top view |
| `?` | Show help overlay |
| `q` / `Esc` | Close dashboard |

## UI Styles

Configured via `uiStyle` setting:

| Style | Description |
|-------|-------------|
| `premium` | Default, rich visual output |
| `retro` | Minimalist, classic terminal |
| `plain` | No formatting, raw text |
| `cinematic` | Launches Go TUI sidecar (`@onlinechefgroep/pi-subagents-tui`) |

## Theme System

`src/ui/theme.ts` provides:

```typescript
// Box drawing characters (changes per UI style)
const boxChars = getBoxChars(uiStyle);
// Color constants
const colors = getThemeColors(uiStyle);
// Framed row helper
const line = framedRow(content, width, boxChars);
```

## Animation Primitives

`src/ui/animation.ts`:

- Spinner styles: `braille`, `dots`, `lines`, `classic`, `none`
- Configured via `animationStyle` setting
- Advanced on every timer tick, not just user input

## Common Tasks

### Adding a New Dashboard View

1. Add hotkey mapping in `AgentDashboard.handleInput()`
2. Create renderer function in `agent-dashboard-renderer.ts`
3. Update help overlay with new key binding

### Optimizing Render Performance

1. Check `RenderMetrics` snapshot for bottlenecks
2. Reduce refresh interval if agents are idle
3. Verify virtual scrolling window size is appropriate
4. Check for unnecessary re-renders via dirty flag

### Fixing Layout Issues

1. Check `MIN_VIEWPORT` (8 lines minimum)
2. Verify `DASHBOARD_HEIGHT_PCT` (92% of terminal)
3. Check theme box chars for terminal compatibility
4. Test with different terminal sizes

## Testing TUI Changes

Run benchmark tests after UI changes:

```bash
# Dashboard render benchmark
npx vitest run test/dashboard-render-perf.test.ts

# Widget render benchmark
npx vitest run test/widget-render-perf.test.ts
```

Benchmarks assert performance thresholds with `expect(elapsed).toBeLessThan(threshold)`.

## Render Pipeline Deep Dive

### Dashboard Render Flow

```
AgentDashboard.render()
├── 1. Update agent list from manager
├── 2. Check dirty flag (skip if no structural changes)
├── 3. Build header lines (counts, status)
├── 4. Build body lines (virtual scroll window)
│   ├── Running agents (2-line cards with spinner)
│   ├── Queued agents (compact rows)
│   └── Completed agents (summary rows)
├── 5. Build detail panel (selected agent metadata)
├── 6. Build footer (help hints)
├── 7. Compose all lines into terminal output
└── 8. Record render metrics
```

### Dirty Flag Logic

The dirty flag tracks structural changes to avoid unnecessary re-renders:

```typescript
private isDirty(): boolean {
  // Compare current agents with cached snapshot
  // Structural changes: agent IDs, statuses, or count changed
  // Non-structural changes (spinner frame, elapsed time) don't trigger re-render
  return !structuralSnapshotsEqual(this.cachedSnapshot, this.buildSnapshot());
}
```

**What counts as structural change:**
- Agent added or removed
- Agent status changed (running → completed)
- Agent ID reordered

**What does NOT count:**
- Spinner frame advanced
- Elapsed time increased
- Token count updated

### Virtual Scrolling Implementation

```typescript
// Window size: render only visible portion
const VIRTUAL_WINDOW = 50;

function getVisibleAgents(agents: AgentRecord[], scrollOffset: number): AgentRecord[] {
  return agents.slice(scrollOffset, scrollOffset + VIRTUAL_WINDOW);
}

// Scroll boundaries
const maxScroll = Math.max(0, agents.length - VIRTUAL_WINDOW);
scrollOffset = Math.min(scrollOffset, maxScroll);
```

**Key constraints:**
- Minimum viewport: 8 lines (`MIN_VIEWPORT`)
- Dashboard height: 92% of terminal (`DASHBOARD_HEIGHT_PCT`)
- Each running agent takes 2 lines (card layout)
- Each queued/completed agent takes 1 line

### Widget Render Pipeline

```typescript
// Widget uses batch compaction for efficiency
const BATCH_COMPACT_THRESHOLD = 3;

// Agents with same type+status are grouped
// "3 Explore agents running" instead of 3 separate lines
```

**Widget features:**
- Activity heatmap (10 segments, 5-minute window)
- Burn rate calculation (tokens/sec)
- Last-seen relative time ("now", "5s", "2m")
- Pagination for large agent lists
- Error status highlighting

## Theme System Details

### Theme Colors

| Color | Premium (hex) | Retro (ANSI) | Plain |
|-------|---------------|--------------|-------|
| border | `#FF6464` | `\x1b[31m` (red) | "" |
| title | `#DCDCDC` | `\x1b[1;37m` (white bold) | "" |
| dim | `#646478` | `\x1b[2m` (dim) | "" |
| muted | `#A0A0AA` | `\x1b[37m` (white) | "" |
| highlight | `#FFC864` | `\x1b[1;33m` (yellow bold) | "" |
| accent | `#78B4FF` | `\x1b[1;36m` (cyan bold) | "" |
| success | `#50DC8C` | `\x1b[1;32m` (green bold) | "" |
| error | `#FF6478` | `\x1b[1;31m` (red bold) | "" |
| bgCard | `#191928` | "" | "" |
| bgSelected | `#232337` | "" | "" |
| bgHeader | `#141423` | "" | "" |

### Box Drawing Characters

| Style | Corners | Vertical | Horizontal | Junctions |
|-------|---------|----------|------------|-----------|
| Premium | `╭╮╰╯` | `│` | `─` | `├┤` |
| Retro | `++++` | `\|` | `-` | `++` |
| Plain | `    ` | ` ` | ` ` | `  ` |

### Theme Helpers

```typescript
// Pad to visible width (accounts for ANSI codes)
padVisible(content, width); // "text    " (not "text\x1b[31m    ")

// Fast truncate (skip if already fits)
fastTruncate(str, maxWidth); // O(1) check, O(n) only if needed

// Frame a row with box characters
framedRow(content, width, boxChars); // "│ content │"
```

## Animation System

### Spinner Styles

| Style | Frames | Unicode |
|-------|--------|---------|
| `braille` | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` | Braille patterns |
| `dots` | `⣾⣽⣻⢿⡿⣟⣯⣷` | Block dots |
| `lines` | `\|/-` | ASCII rotation |
| `classic` | `◐◓◑◒` | Circle quarters |
| `none` | ` ` | Disabled |

**Selection:** Configured via `animationStyle` setting (default: `"braille"`).

**Timing:** Advanced on every timer tick (200ms active, 750ms idle), not just on user input.

## Performance Optimization

### Render Metrics

```typescript
const metrics = new RenderMetrics();

// After each render
metrics.recordRender(startTime, endTime, agentCount);

// Get snapshot
const snap: RenderMetricsSnapshot = metrics.snapshot();
// { totalMs, count, avgMs, maxMs, p95Ms, agentsAtMax }
```

**Performance targets:**
- 10 agents: < 5ms
- 100 agents: < 16ms (60fps)
- 1000 agents: < 100ms
- 10000 agents: virtual scroll keeps it < 16ms

### Adaptive Refresh Rates

```typescript
function getRefreshInterval(agents: AgentRecord[]): number {
  const runningCount = agents.filter(a => a.status === "running").length;

  if (runningCount > 50) return TURBO_REFRESH_MS;      // 100ms (10 fps)
  if (runningCount > 10) return HIGH_LOAD_REFRESH_MS; // 150ms (6.7 fps)
  if (runningCount > 0) return ACTIVE_REFRESH_MS;     // 200ms (5 fps)
  return getDashboardRefreshInterval();                // 750ms (configurable)
}
```

### Debouncing

```typescript
// Multiple rapid spawns are coalesced
private debouncedRender(): void {
  if (this.renderPending) return;
  this.renderPending = true;

  queueMicrotask(() => {
    this.renderPending = false;
    this.render();
  });
}
```

**Debounce cap:** 16ms (one frame at 60fps).

### Memoization

```typescript
// Theme and box chars cached until UI style changes
private theme = getThemeColors();
private boxChars = getBoxChars();

// Only recalculate when getUiStyle() returns different value
```

## Debugging TUI Issues

### Render Performance

```bash
# Run render benchmark
npx vitest run test/dashboard-render-perf.test.ts --reporter=verbose

# Check specific thresholds
npx vitest run test/dashboard-render-perf.test.ts -t "100 agents"
```

**If benchmarks fail:**
1. Check `RenderMetrics` snapshot for which view is slow
2. Verify dirty flag is working (should skip ~80% of timer ticks)
3. Check virtual scroll window size (too large = more rendering)
4. Verify theme memoization (shouldn't recalculate every frame)

### Layout Issues

**Dashboard too tall:**
- Check `DASHBOARD_HEIGHT_PCT` (default 92%)
- Verify terminal has at least `MIN_VIEWPORT` (8) lines
- Check if help overlay is adding extra lines

**Text cut off:**
- Check `fastTruncate` vs `truncateToWidth`
- Verify `padVisible` accounts for ANSI codes
- Check terminal width (minimum 80 cols recommended)

**Box chars not rendering:**
- Terminal may not support Unicode box drawing
- Try `uiStyle: "retro"` for ASCII fallback
- Check `$TERM` environment variable

### Input Handling

**Hotkeys not working:**
- Verify `matchesKey` mapping (see mock in tests)
- Check if dashboard has focus
- Verify key is not intercepted by terminal/IDE

**Multi-select not working:**
- Press `v` to toggle multi-select mode
- Use `j`/`k` to navigate, `v` to toggle selection
- Selected agents highlighted with `bgSelected` color

### Animation Issues

**Spinner not animating:**
- Check `animationStyle` setting (not `"none"`)
- Verify refresh timer is running (running agents trigger 200ms)
- Check if terminal supports Unicode braille

**Flickering:**
- Reduce refresh rate (increase interval)
- Check for unnecessary re-renders (dirty flag)
- Verify coalesced debounce is working

## When to Use This Skill

Invoke this skill when:
- User mentions "dashboard", "widget", or "TUI"
- User mentions "render", "virtual scrolling", or "performance"
- User mentions "vim", "hotkeys", or "key bindings"
- User mentions "theme", "style", or "animation"
- User wants to add/modify UI components
- User is debugging layout or rendering issues
- User wants to optimize TUI performance
- User mentions "dirty flag", "debounce", or "memoization"
- User mentions "box chars", "ANSI codes", or "Unicode"
- User mentions "activity heatmap", "burn rate", or "last seen"
