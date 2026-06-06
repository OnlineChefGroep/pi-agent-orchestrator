# Custom Scene Example

## Adding a New Scene to Tmux Choreography

Edit `scripts/showcase-tmux-scenes.mjs` to add custom scenes.

## Example: Adding a "Search" Scene

```javascript
// ══════════════════════════════════════════════════════════
// Scene 9: Search functionality
// ══════════════════════════════════════════════════════════
out("# ═══ Scene 9: Search ═══");
sceneTransition("Search", 1500);

// Navigate to search
typeCmdNatural("/search", 1500);

// Type search query
typeCharacterByCharacter("agent status", 80);
sleep(500);
tmuxEnter();
sleep(2000);

// Navigate results
navigateSlow("j", 3, 400);
sleep(1000);

// Select result
tmuxEnter();
sleep(2000);

// Return to dashboard
tmuxKey("Escape");
sleep(500);
```

## Example: Adding a "Filter" Scene

```javascript
// ══════════════════════════════════════════════════════════
// Scene 10: Filter by status
// ══════════════════════════════════════════════════════════
out("# ═══ Scene 10: Filter ═══");
sceneTransition("Filter", 1500);

// Press 'f' for filter
tmuxKey("f");
sleep(1000);

// Select "running" status
navigateSlow("j", 2, 400);
tmuxEnter();
sleep(1500);

// Show filtered list
sleep(2000);

// Clear filter
tmuxKey("Escape");
sleep(500);
```

## Helper Functions Reference

### `typeCmdNatural(cmd, waitAfterMs)`

Types a command character-by-character with natural delays.

```javascript
typeCmdNatural("/agents help", 1200);
```

### `navigateSlow(key, count, delayMs)`

Presses a key multiple times with delays.

```javascript
navigateSlow("j", 5, 400);  // Press 'j' 5 times, 400ms between
```

### `sceneTransition(label, pauseMs)`

ANSI crossfade transition between scenes.

```javascript
sceneTransition("Dashboard", 1500);
```

### `tmuxKey(key)`

Sends a tmux key (e.g., "Escape", "Enter").

```javascript
tmuxKey("Escape");
tmuxKey("Enter");
```

### `tmuxChar(ch)`

Sends a single character.

```javascript
tmuxChar("a");
```

### `typeCharacterByCharacter(text, charDelayMs)`

Types text character-by-character.

```javascript
typeCharacterByCharacter("hello world", 80);
```

## Timing Guidelines

| Action | Recommended Delay |
|--------|-------------------|
| Character typing | 80ms |
| Command execution | 1200-2000ms |
| Navigation step | 400ms |
| Scene transition | 1500ms |
| Overlay open/close | 500ms |
| Filter application | 1000ms |

## Scene Label Colors (for MP4 drawtext)

Add to `showcase-tmux-recorder.sh` drawtext filter:

```bash
# Add to VFILTER chain
VFILTER+=",drawtext=fontfile=${FONT_REG}:text='Search':fontsize=16:fontcolor=0xe0af68:x=40:y=20:enable='between(t,115,125)':alpha='if(between(t,115,115.7),(t-115)/0.7,if(between(t,124.3,125),1-(t-124.3)/0.7,1))'"
```

**Color mapping:**
- Green (#9ece6a): Dashboard, Settings, Overview
- Yellow (#e0af68): Help, Search
- Blue (#7aa2f7): Top View
- Purple (#bb9af7): Widget
- Red (#f7768e): Agent Spawn
- Cyan (#7dcfff): Swarm

## Testing Custom Scenes

```bash
# Generate choreography with test session
node scripts/showcase-tmux-scenes.mjs --session test-session > /tmp/test-choreography.sh

# Review the generated script
cat /tmp/test-choreography.sh

# Run in a test tmux session
tmux new-session -d -s test-session -x 110 -y 34
bash /tmp/test-choreography.sh
tmux attach -t test-session
```

## Debugging

### Scene doesn't execute

**Check:** Ensure scene code is after the bash header and before the final output.

### Typing too fast

**Fix:** Increase `charDelayMs` in `typeCharacterByCharacter` calls.

### Transition too abrupt

**Fix:** Increase `pauseMs` in `sceneTransition` calls.

### MP4 label timing wrong

**Fix:** Adjust `between(t,start,end)` in drawtext filter to match actual scene timing.
