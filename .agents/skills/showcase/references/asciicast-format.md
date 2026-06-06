# Asciicast Format Reference

## File Structure

Asciicast is a JSON-based terminal recording format.

```json
{
  "version": 2,
  "width": 110,
  "height": 34,
  "timestamp": 1234567890.123,
  "env": {
    "SHELL": "/bin/bash",
    "TERM": "xterm-256color"
  }
}
```

**Header line:** Single JSON object on first line.

## Event Format

Each subsequent line is a JSON array: `[time, type, data]`

### Output Event (type "o")

```json
[0.123, "o", "\x1b[31mHello\x1b[0m"]
```

- `time` — Float seconds since start
- `type` — "o" for output
- `data` — UTF-8 string (may include ANSI escape codes)

### Input Event (type "i")

```json
[0.456, "i", "a"]
```

- `type` — "i" for input
- `data` — Key pressed

## Common ANSI Escape Codes

| Code | Name | Effect |
|------|------|---------|
| `\x1b[2J` | Erase display | Clear screen |
| `\x1b[H` | Cursor home | Move to (1,1) |
| `\x1b[2m` | Dim text | Reduce brightness |
| `\x1b[0m` | Reset | All attributes off |
| `\x1b[31m` | Red | Set foreground red |
| `\x1b[32m` | Green | Set foreground green |
| `\x1b[33m` | Yellow | Set foreground yellow |
| `\x1b[34m` | Blue | Set foreground blue |
| `\x1b[35m` | Magenta | Set foreground magenta |
| `\x1b[36m` | Cyan | Set foreground cyan |
| `\x1b[37m` | White | Set foreground white |
| `\x1b[1m` | Bold | Bright/bold |
| `\x1b[4m` | Underline | Underline text |

## Cursor Movement

| Code | Effect |
|------|--------|
| `\x1b[<n>A` | Move cursor up n lines |
| `\x1b[<n>B` | Move cursor down n lines |
| `\x1b[<n>C` | Move cursor right n columns |
| `\x1b[<n>D` | Move cursor left n columns |
| `\x1b[<n>;<n>H` | Move to row n, column n |

## Example Recording

```json
{"version":2,"width":80,"height":24,"timestamp":1234567890.123}
[0.0,"o","\x1b[2J\x1b[H"]
[0.1,"o","$ "]
[0.5,"i","e"]
[0.6,"i","c"]
[0.7,"i","h"]
[0.8,"i","o"]
[0.9,"i"," "]
[1.0,"i","h"]
[1.1,"i","e"]
[1.2,"i","l"]
[1.3,"i","l"]
[1.4,"i","o"]
[1.5,"i","\r"]
[1.6,"o","hello\r\n"]
[1.7,"o","$ "]
```

## Time Compression

Asciicast timestamps are real-time. For showcase, we compress time:

**Method 1: Edit timestamps directly**
```python
# Python example
import json
with open('input.cast') as f:
    lines = f.readlines()
header = json.loads(lines[0])
events = [json.loads(l) for l in lines[1:]]
# Compress time by 2x
for ev in events:
    ev[0] = ev[0] * 0.5
# Write back
with open('output.cast', 'w') as f:
    f.write(json.dumps(header) + '\n')
    for ev in events:
        f.write(json.dumps(ev) + '\n')
```

**Method 2: Use agg speed parameter**
```bash
agg --speed 2.0 input.cast output.gif
```

**Method 3: Use ffmpeg setpts**
```bash
ffmpeg -i input.gif -vf "setpts=0.5*PTS" output.gif
```

## Optimizing File Size

1. **Remove idle time** — Delete events with long gaps
2. **Merge consecutive output** — Combine adjacent "o" events
3. **Reduce frame rate** — agg `--fps-cap` parameter
4. **Shorten idle limit** — agg `--idle-time-limit` parameter

## Tools

### asciinema

```bash
# Record
asciinema rec demo.cast

# Play
asciinema play demo.cast

# Upload to asciinema.org
asciinema upload demo.cast
```

### agg (asciinema GIF generator)

```bash
# Convert to GIF
agg input.cast output.gif

# With theme
agg --theme solarized input.cast output.gif

# With speed
agg --speed 2.0 input.cast output.gif

# With idle limit
agg --idle-time-limit 2 input.cast output.gif
```

## Troubleshooting

### Recording too large

**Cause:** Too many events, long idle times

**Fix:**
```bash
# Compress with agg
agg --fps-cap 24 --idle-time-limit 2 input.cast output.gif
```

### Colors wrong

**Cause:** TERM not set correctly

**Fix:**
```bash
export TERM=xterm-256color
asciinema rec demo.cast
```

### Missing escape codes

**Cause:** Terminal doesn't support them

**Fix:** Use `TERM=xterm-256color` or `TERM=screen-256color`
