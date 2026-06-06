# Tmux Scene Choreography Reference

## Scene Order (showcase-tmux-scenes.mjs)

| Scene | Duration | Key Actions |
|-------|----------|-------------|
| 1. Dashboard overview | ~13s | Launch pi CLI, open dashboard |
| 2. Help overlay | ~6s | Press `?` for hotkey help |
| 3. Top View | ~16s | Press `t` for resource usage table |
| 4. Widget | ~8s | Press `w` for running agents widget |
| 5. Agent Spawn | ~15s | Spawn new agent, watch it run |
| 6. Settings | ~17s | Navigate settings menu |
| 7. Swarm | ~13s | Show swarm topology view |
| 8. Overview | ~20s | Final dashboard overview |

## ANSI Crossfade Transition

```bash
# 1. Close any overlay
Escape
# 2. Dim text
$'\x1b[2m'
# 3. Clear screen (black moment)
$'\x1b[2J\x1b[H'
# 4. Reset brightness
$'\x1b[0m'
```

## Pacing Constants

- Character typing delay: 80ms
- Natural command wait: 1200ms
- Navigation delay: 400ms
- Scene transition pause: 1500ms
- Total recording: ~133s raw → ~60s compressed

## Scene Label Timing (MP4 drawtext)

| Label | Start | End | Color |
|-------|-------|-----|-------|
| Dashboard | 5s | 18s | #9ece6a |
| Help | 19s | 25s | #e0af68 |
| Top View | 26s | 42s | #7aa2f7 |
| Widget | 42s | 50s | #bb9af7 |
| Agent Spawn | 50s | 65s | #f7768e |
| Settings | 65s | 82s | #9ece6a |
| Swarm | 82s | 95s | #7dcfff |
| Overview | 95s | 115s | #9ece6a |

## Title Card (first 3.5s)

- Line 1: "Pi Agent Orchestrator" (48pt, white)
- Line 2: "v0.11.0 — Sub-agents, Swarms & Live Dashboard" (20pt, #cccccc)
